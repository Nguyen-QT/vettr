// Post-sign-in redirect target validation. Single app-side owner of the
// open-redirect rules; shared by every hook that follows a `redirectTo`
// query param (architecture.md 4.B) -- do not fork.

// Candidates are resolved against this placeholder; only paths that stay
// on it are same-origin. `.invalid` is reserved (RFC 2606), never a host.
const PLACEHOLDER_ORIGIN = "https://redirect.invalid";

// Backslashes, whitespace and C0/DEL/C1 controls. A path we issued never
// contains them (proxy.ts sets redirectTo from the serialised pathname),
// but browsers rewrite them -- "\" becomes "/", tabs and newlines are
// dropped -- so "/\evil.com" and "/\t/evil.com" both reach evil.com.
const UNSAFE_CHARACTER = /[\\\s\u0000-\u001f\u007f-\u009f]/;

export interface SafeRedirectPathOptions {
  // e.g. ["/client"]. A prefix matches itself and anything below it at a
  // segment boundary: "/client" allows "/client/bookings", not "/clients".
  allowedPrefixes: readonly string[];
  // Trusted caller constant, returned for every rejection.
  fallback: string;
}

function isUnderPrefix(pathname: string, prefix: string): boolean {
  return (
    pathname === prefix ||
    pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

// Pure and never throws. Returns the candidate normalised (dot segments
// resolved, non-ASCII percent-encoded) when it is a same-origin path under
// an allowed prefix, otherwise `fallback`. Returning the normalised form
// means the string checked here is exactly the string navigated to.
export function safeRedirectPath(
  candidate: string | null | undefined,
  { allowedPrefixes, fallback }: SafeRedirectPathOptions
): string {
  // Path-absolute only: rejects schemes ("javascript:", "https:"),
  // relative paths and the empty string.
  if (!candidate?.startsWith("/") || UNSAFE_CHARACTER.test(candidate)) {
    return fallback;
  }

  let url: URL;
  try {
    url = new URL(candidate, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }

  // "//evil.com" is protocol-relative: it resolves to another host.
  if (url.origin !== PLACEHOLDER_ORIGIN) {
    return fallback;
  }

  // Same origin, but "/.//evil.com" resolves to the path "//evil.com",
  // which is protocol-relative again once it is navigated to.
  const { pathname } = url;
  if (pathname.startsWith("//")) {
    return fallback;
  }

  // Checked on the resolved path so "/client/../artist" can't escape.
  if (!allowedPrefixes.some((prefix) => isUnderPrefix(pathname, prefix))) {
    return fallback;
  }

  return `${pathname}${url.search}${url.hash}`;
}
