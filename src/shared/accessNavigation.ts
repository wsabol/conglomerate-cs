/** Keep a post-login destination on this origin and inside the protected app. */
export function protectedDestination(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  try {
    const url = new URL(next, "https://archive.invalid");
    if (url.origin !== "https://archive.invalid") return "/";
    if (/^\/(?:welcome|signin|logged-out|api|media|cdn-cgi)(?:\/|$)/i.test(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
