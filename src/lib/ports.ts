/** Port-range helpers shared by the validator, the UI and the export. */

export interface PortRange {
  from: number;
  to: number;
}

export const ANY_PORT: PortRange = { from: 1, to: 65535 };

export function isAny(r: PortRange): boolean {
  return r.from <= 1 && r.to >= 65535;
}

/** "502, 5026, 1000-1010, any" -> ranges. Invalid tokens are returned separately. */
export function parsePorts(text: string): { ranges: PortRange[]; invalid: string[] } {
  const ranges: PortRange[] = [];
  const invalid: string[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    if (/^(any|\*)$/i.test(tok)) {
      ranges.push({ ...ANY_PORT });
      continue;
    }
    const m = tok.match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
    if (!m) {
      invalid.push(tok);
      continue;
    }
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to > 65535 || from > to) invalid.push(tok);
    else ranges.push({ from, to });
  }
  return { ranges: normalise(ranges), invalid };
}

export function normalise(ranges: PortRange[]): PortRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const out: PortRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to + 1) last.to = Math.max(last.to, r.to);
    else out.push({ ...r });
  }
  return out;
}

export function formatPorts(ranges: PortRange[]): string {
  return ranges.map((r) => (isAny(r) ? 'any' : r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`)).join(', ');
}

export function covers(ranges: PortRange[], port: number): boolean {
  return ranges.some((r) => port >= r.from && port <= r.to);
}

export function addPort(ranges: PortRange[], port: number): PortRange[] {
  return normalise([...ranges, { from: port, to: port }]);
}

/** Removes one port, splitting any range that contained it. */
export function removePort(ranges: PortRange[], port: number): PortRange[] {
  const out: PortRange[] = [];
  for (const r of ranges) {
    if (port < r.from || port > r.to) out.push(r);
    else {
      if (r.from < port) out.push({ from: r.from, to: port - 1 });
      if (r.to > port) out.push({ from: port + 1, to: r.to });
    }
  }
  return out;
}
