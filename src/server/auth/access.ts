import type { AppConfig } from "../lib/config";
import { protectedDestination } from "@shared/accessNavigation";

// Verifies a Cloudflare Access application token (RS256 JWT) against the team's
// public JWKS. Cloudflare places the assertion on the `Cf-Access-Jwt-Assertion`
// header (and a `CF_Authorization` cookie). See PRD Sec: Authentication.

interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  use?: string;
  n: string;
  e: string;
}

interface AccessClaims {
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
}

const JWKS_TTL_SECONDS = 60 * 60;
const keyCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

export function tokenAudienceAllowed(
  claimAud: string | string[] | undefined,
  expectedAuds: string[],
): boolean {
  if (expectedAuds.length === 0) return true;
  const aud = Array.isArray(claimAud) ? claimAud : [claimAud];
  return expectedAuds.some((expected) => aud.includes(expected));
}

/** Application-host logout so Access clears the cookie on this hostname. */
export function buildAccessLogoutUrl(
  requestUrl: string,
  accessTeamDomain: string,
): string | null {
  if (!accessTeamDomain) return null;
  return `${new URL(requestUrl).origin}/cdn-cgi/access/logout`;
}

/** Match Cloudflare Access's application login URL for this public hostname. */
export function buildAccessLoginUrl(
  requestUrl: string,
  next: string | null,
  config: AppConfig,
): string | null {
  const destination = new URL(protectedDestination(next), requestUrl);
  if (!config.accessEnforced) {
    return new URL(`${destination.pathname}${destination.search}`, config.appBaseUrl).toString();
  }

  const hostname = new URL(requestUrl).hostname.toLowerCase();
  const audience = config.accessLoginAudiences[hostname];
  if (!config.accessTeamDomain || !audience || !config.accessAuds.includes(audience)) {
    return null;
  }

  const login = new URL(
    `/cdn-cgi/access/login/${hostname}`,
    `https://${config.accessTeamDomain}`,
  );
  login.searchParams.set("kid", audience);
  login.searchParams.set("redirect_url", `${destination.pathname}${destination.search}`);
  return login.toString();
}

export async function verifyAccessEmail(
  request: Request,
  config: AppConfig,
): Promise<string | null> {
  const token = extractToken(request);
  if (!token || !config.accessTeamDomain) return null;

  const claims = await verifyToken(token, config);
  if (!claims?.email) return null;
  return claims.email.trim().toLowerCase();
}

function extractToken(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function verifyToken(
  token: string,
  config: AppConfig,
): Promise<AccessClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { kid?: string; alg?: string };
  let claims: AccessClaims;
  try {
    header = JSON.parse(textFromB64Url(headerB64));
    claims = JSON.parse(textFromB64Url(payloadB64));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const jwk = await findKey(config.accessTeamDomain, header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = bytesFromB64Url(signatureB64);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    signed,
  );
  if (!valid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) return null;
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;

  const expectedIss = `https://${config.accessTeamDomain}`;
  if (claims.iss && claims.iss !== expectedIss) return null;

  if (!tokenAudienceAllowed(claims.aud, config.accessAuds)) return null;

  return claims;
}

function jwksCacheKey(teamDomain: string): string {
  return `https://access-jwks.internal/${teamDomain}`;
}

async function loadJwks(teamDomain: string): Promise<Jwk[]> {
  const mem = keyCache.get(teamDomain);
  if (mem && Date.now() - mem.fetchedAt < JWKS_TTL_SECONDS * 1000) {
    return mem.keys;
  }

  const cacheReq = new Request(jwksCacheKey(teamDomain));
  const cached = await caches.default.match(cacheReq);
  if (cached) {
    try {
      const keys = (await cached.json()) as Jwk[];
      keyCache.set(teamDomain, { keys, fetchedAt: Date.now() });
      return keys;
    } catch {
      // Fall through to network fetch.
    }
  }

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) return mem?.keys ?? [];

  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = data.keys ?? [];
  keyCache.set(teamDomain, { keys, fetchedAt: Date.now() });

  await caches.default.put(
    cacheReq,
    new Response(JSON.stringify(keys), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${JWKS_TTL_SECONDS}`,
      },
    }),
  );

  return keys;
}

async function findKey(teamDomain: string, kid: string): Promise<Jwk | null> {
  const keys = await loadJwks(teamDomain);
  return keys.find((k) => k.kid === kid) ?? null;
}

function bytesFromB64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textFromB64Url(input: string): string {
  return new TextDecoder().decode(bytesFromB64Url(input));
}
