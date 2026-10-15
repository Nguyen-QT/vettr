// Content-Security-Policy builder (53.4). Single app-side owner of the CSP
// directive list; the proxy sets the header, nothing else assembles one --
// do not fork. Pure and framework-free: it knows nothing about Next.js
// requests, so it is trivially unit-testable (architecture.md 5, 7).

// The proxy forwards the nonce to server components under this request
// header; the root layout reads it to nonce the theme init script.
export const NONCE_REQUEST_HEADER = "x-nonce";

// Report-Only until a clean staging run (53.4.2.2 flips it to enforcing).
// Next reads the nonce from either header name, so its own scripts are
// nonced in both modes.
export const CSP_HEADER_NAME = "Content-Security-Policy-Report-Only";

const NONCE_BYTE_LENGTH = 16;

// Stripe.js, Elements and the in-page 3D Secure frame (Stripe's CSP guide,
// "Stripe.js"). `maps.googleapis.com` is omitted: there is no Address Element.
const STRIPE_SCRIPT_HOSTS = ["https://js.stripe.com", "https://*.js.stripe.com"];
const STRIPE_FRAME_HOSTS = [...STRIPE_SCRIPT_HOSTS, "https://hooks.stripe.com"];
const STRIPE_CONNECT_HOSTS = ["https://api.stripe.com"];

// The browser PUTs reference images to a region subdomain taken from the
// UPLOADTHING_TOKEN; api.uploadthing.com is only ever called server-side.
const UPLOADTHING_CONNECT_HOSTS = ["https://*.ingest.uploadthing.com"];

export interface BuildContentSecurityPolicyInput {
  nonce: string;
  isDevelopment: boolean;
}

// 128 bits from the CSPRNG, base64-encoded. Call once per request; a nonce
// must never be cached or shared between responses.
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTE_LENGTH));
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
}: BuildContentSecurityPolicyInput): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Host lists are ignored by CSP3 browsers under 'strict-dynamic'; they stay
    // as the CSP2 fallback.
    ...STRIPE_SCRIPT_HOSTS,
    // React rebuilds server error stacks with eval in development only.
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Styles are split so an injected <style> (the only kind that can use
    // selectors to read the page) needs the nonce, while `style` attributes
    // stay inline: Base UI, UploadThing, next/image and framer-motion render
    // them on the server, and a nonce can't cover an attribute. No directive
    // holds both, since a nonce cancels 'unsafe-inline'. Browsers without the
    // split directives fall back to `style-src`. In development Next and HMR
    // inject un-nonced <style>, so <style> stays inline there.
    "style-src 'self' 'unsafe-inline'",
    `style-src-elem 'self' ${isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${[...STRIPE_CONNECT_HOSTS, ...UPLOADTHING_CONNECT_HOSTS].join(" ")}`,
    `frame-src ${STRIPE_FRAME_HOSTS.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  // Safari refuses to load http://localhost under this directive.
  if (!isDevelopment) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}
