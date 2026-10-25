import http from 'http';
import https from 'https';
import dns from 'dns';
import net from 'net';
import { isTestMode } from './test-seam';

/**
 * SSRF-hardened URL preview fetcher for link-card OpenGraph metadata.
 *
 * Security invariants (do not weaken without a new review):
 *  1. Only http/https schemes, no embedded credentials (userinfo) allowed.
 *  2. Every resolved IP - literal or DNS - is validated against a deny-list of
 *     loopback / private / link-local / CGNAT / multicast / reserved ranges
 *     (IPv4 and IPv6 incl. v4-in-v6 mapped, 6to4, Teredo, NAT64 embedding).
 *  3. If a DNS answer contains ANY non-public address the whole host is
 *     rejected (fail-closed against mixed/poisoned answers and rebinding).
 *  4. IPs are pinned: the connection always goes to the validated address that
 *     was resolved for this hop (no second lookup => no rebinding TOCTOU).
 *  5. Redirects are followed manually with a strict hop limit; EVERY hop is
 *     re-parsed and re-validated (location cannot escape into private space).
 *  6. Total deadline + idle socket timeout; response body capped in BYTES;
 *     errors are collapsed into a plain null by the caller (no internals leak).
 *
 * Production behavior does not consult any test seam. The loopback allowance
 * and DNS override map are inert unless the active process runs under explicit
 * test mode (same policy as test-seam.ts) - mirrored so security suites can
 * exercise the success path deterministically without real infrastructure.
 */

const PREVIEW_MAX_REDIRECTS = 5;
const PREVIEW_TIMEOUT_MS = 8000;
const PREVIEW_IDLE_MS = 5000;
const PREVIEW_BODY_CAP_BYTES = 300_000;
const PREVIEW_USER_AGENT = 'Mozilla/5.0 (compatible; PeepDeskPreview/1.0)';

/** Test-only fixture hostname that may be allowed to reach loopback when
 *  --preview-test-allow-loopback is present. Numeric/other hostnames NEVER pass. */
const TEST_LOOPBACK_HOST = 'preview-test.example';

// ---------------------------------------------------------------------------
// Test seams (inert in production; same pattern as test-seam.ts)
// ---------------------------------------------------------------------------

let previewTestDnsOverride: Map<string, string[]> | null = null;
let previewConnectionCount = 0;

function previewTestAllowLoopback(): boolean {
  return (
    isTestMode() &&
    (process.argv.includes('--preview-test-allow-loopback') ||
      process.env.PEEPDESK_PREVIEW_TEST_LOOPBACK === '1')
  );
}

export function setPreviewDnsOverride(map: unknown): void {
  if (!isTestMode()) return; // production no-op
  previewTestDnsOverride = new Map<string, string[]>();
  if (map && typeof map === 'object') {
    for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
      if (typeof k === 'string' && k) {
        const values = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : typeof v === 'string' && v ? [v] : [];
        previewTestDnsOverride.set(k.toLowerCase(), values);
      }
    }
  }
}

export function getPreviewConnectionCount(): number {
  return previewConnectionCount;
}

export function resetPreviewTestState(): void {
  if (!isTestMode()) return;
  previewTestDnsOverride = null;
  previewConnectionCount = 0;
}

/** Inspect validation of one URL without connecting (test seam only). */
export async function previewProbeResolve(raw: unknown): Promise<{ ok: boolean; ip?: string; family?: number; blocked?: 'parse' | 'ip' | 'dns' }> {
  if (!isTestMode()) return { ok: false, blocked: 'parse' };
  const target = parsePreviewTarget(raw);
  if (!target) return { ok: false, blocked: 'parse' };
  const result = await resolveHostIp(target.hostname);
  if (result === null) return { ok: false, blocked: 'ip' }; // non-public address found
  if (result.length === 0) return { ok: false, blocked: 'dns' }; // lookup failed
  return { ok: true, ip: result[0], family: net.isIP(result[0]) === 6 ? 6 : 4 };
}

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

type V4 = [number, number, number, number];

function ipv4Blocked(q: V4): boolean {
  const [a, b, c] = q;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24 IETF
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast 224/4 + reserved 240/4 + broadcast
  return false;
}

/** CanonicalizeINET_ATON-style numeric IPv4 forms ("2130706433", "0x7f000001",
 *  "0177.0.0.1", "127.1") to standard dotted-quad. Non-numeric hostnames -> null. */
export function canonicalIpv4Literal(host: string): string | null {
  const parts = host.split('.');
  if (parts.length < 1 || parts.length > 4) return null;
  let numeric = 0;
  let consumed = 0; // bytes already determined by the leading parts
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!/^(?:0[xX][0-9a-fA-F]+|0[0-7]*|[0-9]+)$/.test(p)) return null;
    let value: number;
    if (/^0[xX]/.test(p)) value = parseInt(p.slice(2), 16);
    else if (/^0[0-7]+$/.test(p)) value = parseInt(p.slice(1), 8);
    else value = parseInt(p, 10);
    if (Number.isNaN(value) || value < 0 || value > 0xff_ff_ff_ff) return null;
    const isLast = i === parts.length - 1;
    if (isLast) {
      // The final part covers every remaining byte (inet_aton semantics).
      const tailBytes = 4 - consumed;
      if (value >= Math.pow(2, 8 * tailBytes)) return null;
      numeric = (numeric * Math.pow(2, 8 * tailBytes)) + value;
      consumed = 4;
    } else {
      if (value > 0xff) return null;
      numeric = (numeric << 8) | value;
      consumed++;
    }
  }
  const u = numeric >>> 0;
  return `${(u >>> 24) & 0xff}.${(u >>> 16) & 0xff}.${(u >>> 8) & 0xff}.${u & 0xff}`;
}

function parseV4(text: string): V4 | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  const q = m.slice(1).map(Number) as unknown as V4;
  if (q.some((n) => n > 255)) return null;
  return q;
}

/** Expand an IPv6 address (or null if invalid) to 8 hextets. */
function expandIpv6(input: string): number[] | null {
  let host = input;
  const zone = host.indexOf('%');
  if (zone >= 0) host = host.slice(0, zone);
  host = host.toLowerCase();
  // embedded dotted quad tail (::ffff:192.0.2.128)
  const parts = host.split(':');
  const tail = parts[parts.length - 1];
  if (tail.includes('.')) {
    const q = parseV4(tail);
    if (!q) return null;
    parts[parts.length - 1] = ((q[0] << 8) | q[1]).toString(16) + ':' + ((q[2] << 8) | q[3]).toString(16);
  }
  const pieces = parts.join(':').split('::');
  if (pieces.length > 2) return null;
  let left = pieces[0] ? pieces[0].split(':') : [];
  let right = pieces.length > 1 && pieces[1] ? pieces[1].split(':') : [];
  if (pieces.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (pieces.length > 1) {
    if (missing < 0 || (missing === 0 && !(left.length === 0 || right.length === 0))) return null;
    return [...left, ...Array(missing).fill(0), ...right].map((h) => parseInt(h || '0', 16));
  }
  return left.map((h) => parseInt(h || '0', 16));
}

function segmentsToV4(h: number[], lo: number): V4 | null {
  const a = (h[lo] >> 8) & 0xff;
  const b = h[lo] & 0xff;
  const c = (h[lo + 1] >> 8) & 0xff;
  const d = h[lo + 1] & 0xff;
  return [a, b, c, d];
}

/** True when the address must never be contacted. Unparseable => blocked. */
export function isBlockedIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) {
    const q = parseV4(ip);
    return q ? ipv4Blocked(q) : true;
  }
  if (fam !== 6) return true;
  const h = expandIpv6(ip);
  if (!h || h.length !== 8) return true;
  if (h.every((x) => x === 0)) return true; // :: unspecified
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  const p0 = h[0], p1 = h[1];
  // v4-embedded forms
  if (p0 === 0 && p1 === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0) {
    if (h[5] === 0xffff) {
      const q = segmentsToV4(h, 6);
      if (q) return ipv4Blocked(q);
      return true;
    }
    if (h[5] === 0) {
      // ::x:y /96 IPv4-compatible (deprecated) - treat as embedded IPv4.
      const q = segmentsToV4(h, 6);
      return q ? ipv4Blocked(q) : true;
    }
  }
  if (p0 === 0x2002) {
    // 6to4: embedded IPv4 in hextets 1-2
    const q = segmentsToV4(h, 1);
    if (q) return ipv4Blocked(q);
    return true;
  }
  if (p0 === 0x2001 && p1 === 0) {
    // Teredo: embedded IPv4 (xor'd) in hextets 6-7
    const a = ((h[6] >> 8) & 0xff) ^ 0xff;
    const b = (h[6] & 0xff) ^ 0xff;
    const c = ((h[7] >> 8) & 0xff) ^ 0xff;
    const d = (h[7] & 0xff) ^ 0xff;
    return ipv4Blocked([a, b, c, d]);
  }
  if (p0 === 0x64 && p1 === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    // NAT64 well-known prefix: embedded IPv4 in hextets 6-7
    const q = segmentsToV4(h, 6);
    if (q) return ipv4Blocked(q);
    return true;
  }
  if (p0 >= 0xfc00 && p0 <= 0xfdff) return true; // ULA fc00::/7
  if (p0 >= 0xfe80 && p0 <= 0xfebf) return true; // link-local fe80::/10
  if (p0 >= 0xff00) return true; // multicast ff00::/8
  if (p0 === 0x2001 && p1 === 0x0db8) return true; // documentation 2001:db8::/32
  if (p0 === 0x0100) return true; // discard-only 100::/64
  return false;
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

export interface PreviewTarget {
  href: string;
  hostname: string;
  isHttps: boolean;
}

function defaultPortFor(isHttps: boolean): number {
  return isHttps ? 443 : 80;
}

/** Strict parse for preview fetch targets. Null on any doubt. */
export function parsePreviewTarget(raw: unknown): PreviewTarget | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const rawTarget = raw.trim();
  let parsed: URL | null = null;
  try {
    parsed = new URL(rawTarget);
  } catch {
    const hasScheme = /^https?:\/\//i.test(rawTarget);
    if (!hasScheme) {
      try {
        parsed = new URL(`https://${rawTarget}`);
      } catch {
        return null;
      }
    }
  }
  if (!parsed) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null; // never send creds anywhere
  const hostname = parsed.hostname.replace(/\.$/, ''); // trailing dot = same origin
  if (!hostname) return null;
  if (hostname.includes('%')) return null; // %-decodable garbage never resolves safely
  return { href: parsed.toString(), hostname, isHttps: parsed.protocol === 'https:' };
}

/** Resolve a hostname to validated, connectable IPs. Empty array = DNS failure.
 *  Null = host rejected (non-public address discovered). IPs may be pinned. */
export async function resolveHostIp(hostname: string): Promise<string[] | null> {
  const override = previewTestDnsOverride?.get(hostname.toLowerCase());
  if (override) {
    // Empty entry = simulated NXDOMAIN (deterministic DNS-failure seam).
    if (override.length === 0) return [];
    // 'stall:<ms>' entry = simulated hanging resolver (deadline-race seam).
    const stall = /^stall:(\d+)$/.exec(override[0]);
    if (stall) {
      await new Promise((r) => setTimeout(r, Number(stall[1])));
      return [];
    }
    if (previewTestAllowLoopback() && hostname === TEST_LOOPBACK_HOST) return override;
    for (const ip of override) if (isBlockedIp(ip)) return null;
    return override;
  }

  // Deterministic pure-numeric IPv4 forms never touch DNS.
  const literal = canonicalIpv4Literal(hostname);
  if (literal) {
    const q = parseV4(literal);
    if (q && ipv4Blocked(q)) return null;
    return [literal];
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return [];
  }
  if (!records.length) return [];
  // Fail closed: one poisoned answer rejects the whole host (rebinding guard).
  for (const r of records) if (isBlockedIp(r.address)) return null;
  const v4 = records.filter((r) => r.family === 4).map((r) => r.address);
  return v4.length ? v4 : records.map((r) => r.address);
}

// ---------------------------------------------------------------------------
// Validated connection layer
// ---------------------------------------------------------------------------

interface HopResult {
  kind: 'response' | 'redirect';
  status: number;
  headers: http.IncomingHttpHeaders;
  body?: Buffer;
  truncated?: boolean;
  redirectTo?: string;
}

function requestHop(url: URL, ip: string, family: 4 | 6, deadline: number): Promise<HopResult> {
  return new Promise<HopResult>((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const port = Number(url.port) || defaultPortFor(isHttps);
    const lib = isHttps ? https : http;
    const hostHeader = (family === 6 ? `[${url.hostname}]` : url.hostname) +
      (port !== defaultPortFor(isHttps) ? `:${port}` : '');

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      fn();
    };

    const timeoutMs = Math.max(1, deadline - Date.now());
    const options: https.RequestOptions = {
      host: ip,
      port,
      path: `${url.pathname || '/'}${url.search || ''}`,
      method: 'GET',
      headers: { host: hostHeader, 'user-agent': PREVIEW_USER_AGENT, accept: 'text/html' },
      timeout: Math.min(PREVIEW_IDLE_MS, timeoutMs)
    };
    if (isHttps) {
      // SNI stays the public hostname; the TCP destination stays the pinned IP.
      options.servername = url.hostname;
    }

    previewConnectionCount++;
    let watchdog: NodeJS.Timeout;
    const req = lib.request(options, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        void res.destroy();
        finish(() => resolve({ kind: 'redirect', status, headers: res.headers, redirectTo: location }));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      let truncated = false;
      let contentTypeOk = !res.headers['content-type'] ||
        /(?:x?html|text\/plain)/i.test(res.headers['content-type']);
      res.on('data', (chunk: Buffer) => {
        if (Date.now() > deadline) {
          truncated = true;
          void res.destroy();
          return;
        }
        total += chunk.length;
        if (total > PREVIEW_BODY_CAP_BYTES) {
          truncated = true;
          void res.destroy();
          return;
        }
        if (contentTypeOk) chunks.push(chunk); else chunks.length = 0;
      });
      res.on('end', () => finish(() => resolve({ kind: 'response', status, headers: res.headers, body: Buffer.concat(chunks), truncated })));
      res.on('error', () => finish(() => resolve({ kind: 'response', status, headers: res.headers, body: Buffer.concat(chunks), truncated })));
      res.on('close', () => {
        if (!res.complete) void res.destroy();
        finish(() => resolve({ kind: 'response', status, headers: res.headers, body: Buffer.concat(chunks), truncated }));
      });
    });
    watchdog = setTimeout(() => req.destroy(), Math.max(1, deadline - Date.now()) + 250);
    req.on('timeout', () => req.destroy(new Error('idle-timeout'))); // only destroys, error path rejects
    req.on('error', (e) => finish(() => reject(e)));
    req.end();
  });
}

export interface GuardedFetchResult {
  finalUrl: string;
  body: string;
}

/** DNS must not outlive the overall deadline: a hanging resolver aborts the
 *  fetch like any other phase (socket timeouts alone never cover DNS). */
async function resolveUnderDeadline(hostname: string, deadline: number): Promise<string[] | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  return await Promise.race([
    resolveHostIp(hostname),
    new Promise<null>((resolve) => {
      const t = setTimeout(() => resolve(null), remaining);
      if (typeof t.unref === 'function') t.unref();
    })
  ]);
}

/** Fully-validated redirect-following fetch used for link previews. */
export async function guardedPreviewFetch(
  rawUrl: string,
  opts?: { timeoutMs?: number }
): Promise<GuardedFetchResult | null> {
  const start = parsePreviewTarget(rawUrl);
  if (!start) return null;
  const deadline = Date.now() + Math.min(opts?.timeoutMs ?? PREVIEW_TIMEOUT_MS, PREVIEW_TIMEOUT_MS);
  const visited = new Set<string>();

  let current: URL;
  try {
    current = new URL(start.href);
  } catch {
    return null;
  }

  try {
    for (let hop = 0; hop <= PREVIEW_MAX_REDIRECTS; hop++) {
      const target = parsePreviewTarget(current.href);
      if (!target) return null;
      const key = target.href;
      if (visited.has(key)) return null; // loop
      visited.add(key);

      const ips = await resolveUnderDeadline(target.hostname, deadline);
      if (!ips || ips.length === 0) return null;
      const ip = ips[0];
      const family = net.isIP(ip) === 6 ? 6 : 4;

      const res = await requestHop(new URL(target.href), ip, family, deadline);

      if (res.kind === 'redirect' && res.redirectTo) {
        let next: URL;
        try {
          next = new URL(res.redirectTo, target.href);
        } catch {
          return null;
        }
        current = next;
        continue;
      }
      if (res.status !== 200 || !res.body) return null;
      if (Date.now() > deadline) return null;
      return { finalUrl: target.href, body: res.body.toString('utf8') };
    }
    return null; // hop limit exceeded
  } catch {
    return null; // network/DNS/TLS/timeout errors collapse to null
  }
}
