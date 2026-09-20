/**
 * STEP 5 - Pre-flight export. Builds a report object (JSON) and a plain-text
 * punch-list from the validated project. Both are generated locally.
 */
import { formatPorts } from './ports';
import { LEVEL_META, SERVICES } from './rules';
import type { Project } from './schema';
import { conduitPortRows, validateProject, type Finding } from './validate';

export interface PunchRow {
  conduit: string;
  from: string;
  to: string;
  firewall: string;
  service: string;
  port: number;
  proto: string;
  status: 'OPEN' | 'BLOCKED';
}

export interface PreflightReport {
  generatedAt: string;
  tool: 'OT Subnet & Firewall Pre-Flight Checker';
  project: { name: string; site: string; engineer: string };
  status: 'APPROVED' | 'NOT APPROVED';
  summary: { errors: number; warnings: number; info: number };
  ipAllocation: {
    zone: string;
    level: string;
    slTarget: number;
    subnets: string[];
    nodes: { name: string; type: string; ip: string }[];
  }[];
  conduits: {
    name: string;
    from: string;
    to: string;
    firewall: string;
    allowedPorts: string;
    note?: string;
  }[];
  portPunchList: PunchRow[];
  additionalOpenPorts: { conduit: string; ports: string }[];
  findings: Pick<Finding, 'severity' | 'category' | 'title' | 'detail' | 'fix'>[];
}

export function buildReport(project: Project, now = new Date()): PreflightReport {
  const v = validateProject(project);
  const zone = (id: string) => project.zones.find((z) => z.id === id)?.name ?? '(missing zone)';
  const fwName = (id?: string) => project.nodes.find((n) => n.id === id)?.name ?? '(none)';

  const punch: PunchRow[] = [];
  const extras: PreflightReport['additionalOpenPorts'] = [];
  for (const c of project.conduits) {
    for (const row of conduitPortRows(c)) {
      if (!row.required) continue;
      punch.push({
        conduit: c.name,
        from: zone(c.fromZoneId),
        to: zone(c.toZoneId),
        firewall: fwName(c.firewallId),
        service: row.service.name,
        port: row.service.port,
        proto: row.service.proto,
        status: row.open ? 'OPEN' : 'BLOCKED',
      });
    }
    const knownPorts = new Set(SERVICES.map((s) => s.port));
    const other = c.allowed.filter((r) => !(r.from === r.to && knownPorts.has(r.from)));
    if (other.length) extras.push({ conduit: c.name, ports: formatPorts(other) });
  }

  return {
    generatedAt: now.toISOString(),
    tool: 'OT Subnet & Firewall Pre-Flight Checker',
    project: { name: project.name, site: project.site, engineer: project.engineer },
    status: v.approved ? 'APPROVED' : 'NOT APPROVED',
    summary: { errors: v.counts.error, warnings: v.counts.warning, info: v.counts.info },
    ipAllocation: project.zones.map((z) => ({
      zone: z.name,
      level: LEVEL_META.get(z.level)?.label ?? String(z.level),
      slTarget: z.slTarget,
      subnets: z.subnets,
      nodes: project.nodes
        .filter((n) => n.zoneId === z.id)
        .map((n) => ({ name: n.name, type: n.type, ip: n.ip || '-' })),
    })),
    conduits: project.conduits.map((c) => ({
      name: c.name,
      from: zone(c.fromZoneId),
      to: zone(c.toZoneId),
      firewall: fwName(c.firewallId),
      allowedPorts: formatPorts(c.allowed) || 'none',
      note: c.note || undefined,
    })),
    portPunchList: punch,
    additionalOpenPorts: extras,
    findings: v.findings.map(({ severity, category, title, detail, fix }) => ({ severity, category, title, detail, fix })),
  };
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

export function toPunchListText(r: PreflightReport): string {
  const L: string[] = [];
  const rule = '-'.repeat(72);
  L.push('OT SUBNET & FIREWALL PRE-FLIGHT REPORT');
  L.push(rule);
  L.push(`Project:  ${r.project.name}`);
  if (r.project.site) L.push(`Site:     ${r.project.site}`);
  if (r.project.engineer) L.push(`Engineer: ${r.project.engineer}`);
  L.push(`Created:  ${r.generatedAt}`);
  L.push(`STATUS:   ${r.status}  (${r.summary.errors} blocking, ${r.summary.warnings} warnings, ${r.summary.info} notes)`);
  L.push('');

  L.push('1. FIREWALL PORT PUNCH-LIST');
  L.push(rule);
  if (r.portPunchList.length === 0) L.push('No required services defined.');
  for (const p of r.portPunchList) {
    L.push(
      `[${pad(p.status, 7)}] ${pad(`${p.port}/${p.proto}`, 10)} ${pad(p.service, 48)}`,
    );
    L.push(`          ${p.from} -> ${p.to}   via ${p.firewall}   (${p.conduit})`);
  }
  for (const e of r.additionalOpenPorts) L.push(`[EXTRA  ] ${e.ports}  on ${e.conduit}`);
  L.push('');

  L.push('2. IP ALLOCATION');
  L.push(rule);
  for (const z of r.ipAllocation) {
    L.push(`${z.zone}  |  ${z.level}  |  SL-T ${z.slTarget}`);
    L.push(`  Subnets: ${z.subnets.join(', ') || '(none)'}`);
    for (const n of z.nodes) L.push(`  ${pad(n.ip, 16)} ${pad(n.name, 24)} ${n.type}`);
    L.push('');
  }

  L.push('3. ZONES AND CONDUITS');
  L.push(rule);
  for (const c of r.conduits) {
    L.push(`${c.from} -> ${c.to}  |  ${c.name}  |  firewall ${c.firewall}  |  allow ${c.allowedPorts}`);
    if (c.note) L.push(`  Note: ${c.note}`);
  }
  L.push('');

  L.push('4. FINDINGS');
  L.push(rule);
  if (r.findings.length === 0) L.push('None.');
  for (const f of r.findings) {
    L.push(`[${f.severity.toUpperCase()}] ${f.title}`);
    L.push(`  ${f.detail}`);
    L.push(`  Fix: ${f.fix}`);
  }
  return L.join('\n');
}

export function download(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';
