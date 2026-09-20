/**
 * Validation engine: subnet overlaps, address hygiene, industrial port checks
 * and IEC 62443 / Purdue zone-and-conduit policy. Pure function of a Project so
 * it can re-run on every keystroke and works fully offline.
 */
import { ipToInt, ipInSubnet, isReservedHost, overlap, parseCidr, type SubnetInfo } from './netmath';
import { covers, isAny } from './ports';
import {
  LEVEL_META,
  RISKY_PORTS,
  SERVICES,
  SERVICE_BY_ID,
  SERVICE_BY_PORT,
  levelIndex,
  type ServiceRule,
} from './rules';
import type { Conduit, NetNode, Project, Zone } from './schema';

export type Severity = 'error' | 'warning' | 'info';
export type Category = 'subnet' | 'address' | 'port' | 'zone';

export interface Finding {
  id: string;
  severity: Severity;
  category: Category;
  title: string;
  detail: string;
  fix: string;
  target?: { kind: 'zone' | 'node' | 'conduit'; id: string };
  /** Other zone/node/conduit ids this finding should also badge. */
  also?: string[];
}

export interface ConduitPortRow {
  service: ServiceRule;
  required: boolean;
  open: boolean;
}

export interface ValidationResult {
  findings: Finding[];
  counts: Record<Severity, number>;
  approved: boolean;
  /** Findings keyed by the zone / node / conduit they point at, for inline badges. */
  byTarget: Map<string, Finding[]>;
}

const sevRank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function conduitPortRows(c: Conduit): ConduitPortRow[] {
  return SERVICES.map((service) => ({
    service,
    required: c.requiredServices.includes(service.id),
    open: covers(c.allowed, service.port),
  }));
}

export function zoneDomain(z: Zone) {
  return LEVEL_META.get(z.level)?.domain ?? 'OT';
}

export interface ParsedSubnet {
  zone: Zone;
  raw: string;
  info: SubnetInfo;
}

export function parsedSubnets(project: Project): { ok: ParsedSubnet[]; bad: { zone: Zone; raw: string; error: string }[] } {
  const ok: ParsedSubnet[] = [];
  const bad: { zone: Zone; raw: string; error: string }[] = [];
  for (const zone of project.zones) {
    for (const raw of zone.subnets) {
      const r = parseCidr(raw);
      if (r.ok) ok.push({ zone, raw, info: r.info });
      else bad.push({ zone, raw, error: r.error });
    }
  }
  return { ok, bad };
}

export function validateProject(project: Project): ValidationResult {
  const f: Finding[] = [];
  const zoneById = new Map(project.zones.map((z) => [z.id, z]));
  const nodeById = new Map(project.nodes.map((n) => [n.id, n]));
  const add = (x: Finding) => f.push(x);

  /* ---------- 1. subnets ---------- */
  const { ok: subnets, bad } = parsedSubnets(project);
  for (const b of bad) {
    add({
      id: `badcidr:${b.zone.id}:${b.raw}`,
      severity: 'error',
      category: 'subnet',
      title: `Invalid subnet "${b.raw}" in ${b.zone.name}`,
      detail: b.error,
      fix: 'Correct the CIDR or remove it from the zone.',
      target: { kind: 'zone', id: b.zone.id },
    });
  }

  for (let i = 0; i < subnets.length; i++) {
    for (let j = i + 1; j < subnets.length; j++) {
      const a = subnets[i];
      const b = subnets[j];
      const o = overlap(a.info, b.info);
      if (o.kind === 'none') continue;
      const sameZone = a.zone.id === b.zone.id;
      const da = zoneDomain(a.zone);
      const db = zoneDomain(b.zone);
      const itOt = (da === 'IT' && db === 'OT') || (da === 'OT' && db === 'IT');
      const shared = `${o.sharedFrom} - ${o.sharedTo} (${o.sharedCount} addresses)`;
      add({
        id: `overlap:${a.zone.id}:${a.info.cidr}:${b.zone.id}:${b.info.cidr}`,
        severity: sameZone ? 'warning' : 'error',
        category: 'subnet',
        title: sameZone
          ? `Overlapping subnets inside ${a.zone.name}`
          : itOt
            ? `IT / OT subnet overlap: ${a.zone.name} and ${b.zone.name}`
            : `Subnet overlap: ${a.zone.name} and ${b.zone.name}`,
        detail: `${a.info.cidr} (${a.zone.name}) and ${b.info.cidr} (${b.zone.name}) share ${shared}. Routing to the shared range is ambiguous.`,
        fix: sameZone
          ? 'Remove the redundant subnet.'
          : 'Re-address one side, or place NAT on the conduit and document it as an exception.',
        target: { kind: 'zone', id: a.zone.id },
        also: sameZone ? [] : [b.zone.id],
      });
    }
  }

  for (const z of project.zones) {
    if (z.subnets.length === 0) {
      add({
        id: `nosubnet:${z.id}`,
        severity: 'warning',
        category: 'subnet',
        title: `${z.name} has no subnet`,
        detail: 'Without a subnet the checker cannot verify node addresses or overlaps for this zone.',
        fix: 'Add at least one CIDR to the zone.',
        target: { kind: 'zone', id: z.id },
      });
    }
  }

  /* ---------- 2. node addresses ---------- */
  const subnetsByZone = new Map<string, SubnetInfo[]>();
  for (const s of subnets) subnetsByZone.set(s.zone.id, [...(subnetsByZone.get(s.zone.id) ?? []), s.info]);

  const byIp = new Map<string, NetNode[]>();
  for (const n of project.nodes) {
    const ip = n.ip.trim();
    if (!ip) continue;
    const zone = zoneById.get(n.zoneId);
    const zoneName = zone?.name ?? 'unknown zone';
    if (ipToInt(ip) === null) {
      add({
        id: `badip:${n.id}`,
        severity: 'error',
        category: 'address',
        title: `${n.name}: "${ip}" is not a valid IPv4 address`,
        detail: 'Use four octets from 0 to 255 with no leading zeros.',
        fix: 'Correct the address.',
        target: { kind: 'node', id: n.id },
      });
      continue;
    }
    byIp.set(ip, [...(byIp.get(ip) ?? []), n]);
    const zs = subnetsByZone.get(n.zoneId) ?? [];
    if (zs.length > 0) {
      const home = zs.find((s) => ipInSubnet(ip, s));
      if (!home) {
        add({
          id: `outside:${n.id}`,
          severity: 'error',
          category: 'address',
          title: `${n.name} (${ip}) is outside ${zoneName}`,
          detail: `The address is not inside ${zs.map((s) => s.cidr).join(', ')}. The node would not be reachable on its own segment.`,
          fix: `Move the node to a zone that owns ${ip}, or re-address it inside ${zs[0].cidr}.`,
          target: { kind: 'node', id: n.id },
        });
      } else {
        const res = isReservedHost(ip, home);
        if (res) {
          add({
            id: `reserved:${n.id}`,
            severity: 'error',
            category: 'address',
            title: `${n.name} uses the ${res} address ${ip}`,
            detail: `${ip} is the ${res} address of ${home.cidr} and cannot be assigned to a host.`,
            fix: `Pick an address between ${home.firstUsable} and ${home.lastUsable}.`,
            target: { kind: 'node', id: n.id },
          });
        }
      }
    }
  }
  for (const [ip, nodes] of byIp) {
    if (nodes.length < 2) continue;
    add({
      id: `dupip:${ip}`,
      severity: 'error',
      category: 'address',
      title: `Duplicate IP ${ip}`,
      detail: `Assigned to ${nodes.map((n) => n.name).join(' and ')}. Both devices will drop off the network intermittently.`,
      fix: 'Give each device a unique address.',
      target: { kind: 'node', id: nodes[0].id },
    });
  }

  /* ---------- 3. conduits: zone policy + ports ---------- */
  const touched = new Set<string>();
  for (const c of project.conduits) {
    const from = zoneById.get(c.fromZoneId);
    const to = zoneById.get(c.toZoneId);
    const tgt = { kind: 'conduit' as const, id: c.id };
    if (!from || !to) {
      add({
        id: `dangling:${c.id}`,
        severity: 'error',
        category: 'zone',
        title: `Conduit "${c.name}" has a missing zone`,
        detail: 'One end of this conduit points at a zone that no longer exists.',
        fix: 'Pick a source and destination zone.',
        target: tgt,
      });
      continue;
    }
    touched.add(from.id);
    touched.add(to.id);
    if (from.id === to.id) {
      add({
        id: `self:${c.id}`,
        severity: 'warning',
        category: 'zone',
        title: `Conduit "${c.name}" starts and ends in ${from.name}`,
        detail: 'Traffic inside one zone does not need a conduit.',
        fix: 'Delete the conduit or choose a different destination.',
        target: tgt,
      });
      continue;
    }

    const dFrom = zoneDomain(from);
    const dTo = zoneDomain(to);
    const crossesItOt = (dFrom === 'IT' && dTo === 'OT') || (dFrom === 'OT' && dTo === 'IT');
    const crossesDomain = dFrom !== dTo;
    const gap = Math.abs(levelIndex(from.level) - levelIndex(to.level));

    if (crossesItOt) {
      add({
        id: `nodmz:${c.id}`,
        severity: 'error',
        category: 'zone',
        title: `${from.name} connects directly to ${to.name} with no DMZ`,
        detail: `IEC 62443 and the Purdue model do not allow ${LEVEL_META.get(from.level)?.label} to talk straight to ${LEVEL_META.get(to.level)?.label}. Any compromise upstream reaches the control network.`,
        fix: 'Add a Level 3.5 DMZ zone with its own firewall and split this into two conduits that terminate in it.',
        target: tgt,
      });
    } else if (gap > 1) {
      add({
        id: `skip:${c.id}`,
        severity: 'warning',
        category: 'zone',
        title: `${c.name} skips ${gap - 1} Purdue level${gap - 1 > 1 ? 's' : ''}`,
        detail: `${from.name} and ${to.name} are not adjacent levels.`,
        fix: 'Route through the intermediate zone, or record an approved exception in the conduit note.',
        target: tgt,
      });
    }

    const fw = c.firewallId ? nodeById.get(c.firewallId) : undefined;
    if (!c.firewallId) {
      add({
        id: `nofw:${c.id}`,
        severity: crossesDomain ? 'error' : 'warning',
        category: 'zone',
        title: `${c.name} has no firewall`,
        detail: 'A conduit needs an enforcement point so the allowed ports can actually be applied.',
        fix: 'Assign a firewall node to this conduit.',
        target: tgt,
      });
    } else if (!fw || fw.type !== 'firewall') {
      add({
        id: `badfw:${c.id}`,
        severity: 'error',
        category: 'zone',
        title: `${c.name}: enforcement device is not a firewall`,
        detail: fw ? `${fw.name} is a ${fw.type}.` : 'The selected device was deleted.',
        fix: 'Choose a node of type Firewall.',
        target: tgt,
      });
    }

    if (Math.abs(from.slTarget - to.slTarget) >= 2) {
      add({
        id: `sl:${c.id}`,
        severity: 'warning',
        category: 'zone',
        title: `Security level gap on ${c.name}`,
        detail: `${from.name} targets SL ${from.slTarget} and ${to.name} targets SL ${to.slTarget}. The lower zone can weaken the higher one.`,
        fix: 'Add compensating controls or raise the lower zone.',
        target: tgt,
      });
    }

    /* ports */
    for (const row of conduitPortRows(c)) {
      if (row.required && !row.open) {
        add({
          id: `blocked:${c.id}:${row.service.port}`,
          severity: 'error',
          category: 'port',
          title: `Blocked: ${row.service.short} ${row.service.port}/${row.service.proto} on ${c.name}`,
          detail: `${row.service.name} must pass ${from.name} to ${to.name}, but the firewall rules do not permit port ${row.service.port}.`,
          fix: `Add an allow rule for ${row.service.port}/${row.service.proto} from ${from.name} to ${to.name}.`,
          target: tgt,
        });
      }
      if (!row.required && row.open) {
        add({
          id: `unneeded:${c.id}:${row.service.port}`,
          severity: 'info',
          category: 'port',
          title: `${row.service.short} ${row.service.port} is open but not marked required on ${c.name}`,
          detail: 'Open ports that nothing depends on widen the attack surface.',
          fix: 'Mark it required, or remove the rule.',
          target: tgt,
        });
      }
    }

    // services hosted at the destination but not listed on the conduit
    const hostedAt = new Map<string, string[]>();
    for (const n of project.nodes.filter((n) => n.zoneId === to.id)) {
      for (const s of n.hosts) hostedAt.set(s, [...(hostedAt.get(s) ?? []), n.name]);
    }
    for (const [sid, names] of hostedAt) {
      const svc = SERVICE_BY_ID[sid as keyof typeof SERVICE_BY_ID];
      if (svc && !c.requiredServices.includes(svc.id)) {
        add({
          id: `unlisted:${c.id}:${svc.id}`,
          severity: 'info',
          category: 'port',
          title: `${to.name} hosts ${svc.short} (${svc.port}) but ${c.name} does not list it`,
          detail: `${names.join(', ')} listen${names.length === 1 ? 's' : ''} on ${svc.port}/${svc.proto}. If clients in ${from.name} use it, the port will be missing from the punch-list.`,
          fix: 'Tick the service as required on the conduit, or ignore if that traffic is not needed.',
          target: tgt,
        });
      }
    }

    if (c.allowed.some(isAny)) {
      add({
        id: `any:${c.id}`,
        severity: 'error',
        category: 'port',
        title: `${c.name} allows any port`,
        detail: 'An allow-any rule defeats the purpose of the conduit.',
        fix: 'Replace it with the specific ports the design needs.',
        target: tgt,
      });
    } else {
      for (const r of c.allowed) {
        if (r.from !== r.to) {
          add({
            id: `range:${c.id}:${r.from}-${r.to}`,
            severity: 'warning',
            category: 'port',
            title: `${c.name} opens range ${r.from}-${r.to}`,
            detail: `${r.to - r.from + 1} ports are open. Wide ranges are hard to audit.`,
            fix: 'List only the ports in use.',
            target: tgt,
          });
        } else if (!SERVICE_BY_PORT.has(r.from) && !RISKY_PORTS[r.from]) {
          add({
            id: `unknown:${c.id}:${r.from}`,
            severity: 'info',
            category: 'port',
            title: `Port ${r.from} on ${c.name} is not in the OT rule set`,
            detail: 'The checker has no rule for this port. Confirm it is intended.',
            fix: 'Record why it is needed in the conduit note.',
            target: tgt,
          });
        }
      }
      if (crossesDomain) {
        for (const [p, why] of Object.entries(RISKY_PORTS)) {
          if (covers(c.allowed, Number(p))) {
            add({
              id: `risky:${c.id}:${p}`,
              severity: 'warning',
              category: 'port',
              title: `Risky port ${p} crosses ${dFrom}/${dTo} boundary on ${c.name}`,
              detail: why + '.',
              fix: 'Use a jump host or remove the rule, and record an exception if it must stay.',
              target: tgt,
            });
          }
        }
      }
    }
  }

  if (project.zones.length > 1) {
    for (const z of project.zones) {
      if (!touched.has(z.id)) {
        add({
          id: `isolated:${z.id}`,
          severity: 'info',
          category: 'zone',
          title: `${z.name} has no conduits`,
          detail: 'The zone is isolated. That is fine if intended.',
          fix: 'Add a conduit if it needs to exchange data.',
          target: { kind: 'zone', id: z.id },
        });
      }
    }
  }

  f.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  const byTarget = new Map<string, Finding[]>();
  for (const x of f) {
    counts[x.severity]++;
    for (const id of [x.target?.id, ...(x.also ?? [])]) {
      if (id) byTarget.set(id, [...(byTarget.get(id) ?? []), x]);
    }
  }
  return { findings: f, counts, approved: project.zones.length > 0 && counts.error === 0, byTarget };
}

