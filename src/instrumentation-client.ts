import { z } from "zod";

// Runs in the browser before any page module loads (Next's client
// instrumentation hook). Zod's JIT probes `new Function("")` when an object
// schema is built; the CSP has no 'unsafe-eval' in production (53.4.2.2), so
// the probe would log a violation on every page that ships Zod. `jitless`
// skips the probe and the generated parser; parse results are unchanged.
// Server-side parsing keeps the JIT, since the CSP doesn't apply there.
z.config({ jitless: true });
