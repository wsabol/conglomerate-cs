import type { AppConfig } from "../lib/config";

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

const JWKS_TTL_MS = 60 * 60 * 1000;
const keyCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

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

  if (config.accessAud) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(config.accessAud)) return null;
  }

  return claims;
}

async function findKey(teamDomain: string, kid: string): Promise<Jwk | null> {
  const cached = keyCache.get(teamDomain);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) {
    const hit = cached.keys.find((k) => k.kid === kid);
    if (hit) return hit;
  }

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) return cached?.keys.find((k) => k.kid === kid) ?? null;

  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = data.keys ?? [];
  keyCache.set(teamDomain, { keys, fetchedAt: Date.now() });
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
