// Where to send someone after they sign in. No imports, so `node --test` can run its test file.

/** A path on this site to go to after signing in; anything else (another site, say) is home. */
export function safeNext(next: unknown): string {
  // Read the way a browser reads it, so a tab, a backslash or the like can't make it another site.
  try {
    const url = new URL(typeof next === "string" ? next : "/", "http://thanos.invalid");
    return url.origin === "http://thanos.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
