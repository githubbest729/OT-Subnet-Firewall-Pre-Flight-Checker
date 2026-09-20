/**
 * STEP 1 - Network math utilities (IPv4 / CIDR).
 * Pure functions, no dependencies. All arithmetic is done on unsigned 32-bit
 * integers (`>>> 0`) so results are never negative.
 */

export interface SubnetInfo {
  input: string;
  ip: string; // address as typed (normalised)
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstUsable: string;
  lastUsable: string;
  usableHosts: number;
  totalAddresses: number;
  cidr: string; // canonical network/prefix, e.g. 192.168.1.0/24
  isPrivate: boolean;
  range: 'RFC1918' | 'CGNAT' | 'link-local' | 'loopback' | 'public';
  hostBitsSet: boolean; // typed address was not the network address
  // integer form, used by overlap maths
  netInt: number;
  bcastInt: number;
}

export type ParseResult = { ok: true; info: SubnetInfo } | { ok: false; error: string };

export function ipToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    if (p.length > 1 && p.startsWith('0')) return null; // ambiguous octal
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}

export function intToIp(n: number): string {
  const v = n >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
}

export function prefixToMask(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

/** Dotted mask -> prefix length, or null if the mask is not contiguous. */
export function maskToPrefix(mask: string): number | null {
  const m = ipToInt(mask);
  if (m === null) return null;
  let prefix = 0;
  let seenZero = false;
  for (let i = 31; i >= 0; i--) {
    const bit = (m >>> i) & 1;
    if (bit === 1) {
      if (seenZero) return null;
      prefix++;
    } else seenZero = true;
  }
  return prefix;
}

function classify(netInt: number): SubnetInfo['range'] {
  const inR = (base: string, p: number) => (netInt & prefixToMask(p)) >>> 0 === ipToInt(base)!;
  if (inR('10.0.0.0', 8) || inR('172.16.0.0', 12) || inR('192.168.0.0', 16)) return 'RFC1918';
  if (inR('100.64.0.0', 10)) return 'CGNAT';
  if (inR('169.254.0.0', 16)) return 'link-local';
  if (inR('127.0.0.0', 8)) return 'loopback';
  return 'public';
}

/**
 * Accepts "10.0.0.5/24", "10.0.0.5 /24", or "10.0.0.5 255.255.255.0".
 * A bare address is treated as a /32 host.
 */
export function parseCidr(raw: string): ParseResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'Enter an address such as 192.168.10.0/24.' };

  let ipPart: string;
  let prefix: number;

  const slash = text.match(/^(\S+)\s*\/\s*(\d{1,2})$/);
  const spaced = text.match(/^(\S+)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (slash) {
    ipPart = slash[1];
    prefix = Number(slash[2]);
    if (prefix > 32) return { ok: false, error: `Prefix /${prefix} is out of range (0-32).` };
  } else if (spaced) {
    ipPart = spaced[1];
    const p = maskToPrefix(spaced[2]);
    if (p === null) return { ok: false, error: `${spaced[2]} is not a valid subnet mask.` };
    prefix = p;
  } else if (ipToInt(text) !== null) {
    ipPart = text;
    prefix = 32;
  } else {
    return { ok: false, error: 'Use CIDR (10.1.0.0/24) or address + mask (10.1.0.0 255.255.255.0).' };
  }

  const ipInt = ipToInt(ipPart);
  if (ipInt === null) return { ok: false, error: `${ipPart} is not a valid IPv4 address.` };

  const mask = prefixToMask(prefix);
  const netInt = (ipInt & mask) >>> 0;
  const bcastInt = (netInt | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);

  let first: number, last: number, usable: number;
  if (prefix === 32) {
    first = last = netInt;
    usable = 1;
  } else if (prefix === 31) {
    // RFC 3021 point-to-point: both addresses usable
    first = netInt;
    last = bcastInt;
    usable = 2;
  } else {
    first = netInt + 1;
    last = bcastInt - 1;
    usable = total - 2;
  }

  const range = classify(netInt);
  return {
    ok: true,
    info: {
      input: text,
      ip: intToIp(ipInt),
      prefix,
      mask: intToIp(mask),
      wildcard: intToIp(~mask >>> 0),
      network: intToIp(netInt),
      broadcast: intToIp(bcastInt),
      firstUsable: intToIp(first),
      lastUsable: intToIp(last),
      usableHosts: usable,
      totalAddresses: total,
      cidr: `${intToIp(netInt)}/${prefix}`,
      isPrivate: range === 'RFC1918',
      range,
      hostBitsSet: ipInt !== netInt,
      netInt,
      bcastInt,
    },
  };
}

export type OverlapKind = 'none' | 'identical' | 'a-contains-b' | 'b-contains-a';

export interface Overlap {
  kind: OverlapKind;
  /** First/last address of the shared range (only when kind !== 'none'). */
  sharedFrom?: string;
  sharedTo?: string;
  sharedCount?: number;
}

/** CIDR blocks are aligned, so any overlap is either identical or fully nested. */
export function overlap(a: SubnetInfo, b: SubnetInfo): Overlap {
  const lo = Math.max(a.netInt, b.netInt);
  const hi = Math.min(a.bcastInt, b.bcastInt);
  if (lo > hi) return { kind: 'none' };
  let kind: OverlapKind = 'identical';
  if (a.prefix < b.prefix) kind = 'a-contains-b';
  else if (a.prefix > b.prefix) kind = 'b-contains-a';
  return { kind, sharedFrom: intToIp(lo), sharedTo: intToIp(hi), sharedCount: hi - lo + 1 };
}

export function ipInSubnet(ip: string, s: SubnetInfo): boolean {
  const n = ipToInt(ip);
  return n !== null && n >= s.netInt && n <= s.bcastInt;
}

/** True when the address is the network or broadcast address of a /30 or larger. */
export function isReservedHost(ip: string, s: SubnetInfo): 'network' | 'broadcast' | null {
  if (s.prefix >= 31) return null;
  const n = ipToInt(ip);
  if (n === s.netInt) return 'network';
  if (n === s.bcastInt) return 'broadcast';
  return null;
}
