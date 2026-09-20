/**
 * STEP 3 - Topology state & schema.
 * Everything the engineer draws lives in one Project document, stored whole in
 * IndexedDB (Dexie). Documents are small, so whole-document writes are simpler
 * and safer than a normalised store.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { NodeType, PurdueLevel, ServiceId } from './rules';
import type { PortRange } from './ports';

export type SecurityLevel = 1 | 2 | 3 | 4;

export interface Zone {
  id: string;
  name: string;
  level: PurdueLevel;
  /** IEC 62443 target security level (SL-T). */
  slTarget: SecurityLevel;
  /** CIDR strings, e.g. "192.168.20.0/24". */
  subnets: string[];
}

export interface NetNode {
  id: string;
  zoneId: string;
  name: string;
  type: NodeType;
  /** Plain IPv4 address, blank for unaddressed devices such as L2 switches. */
  ip: string;
  /** Services this node listens on. Used to suggest required conduit ports. */
  hosts: ServiceId[];
}

export interface Conduit {
  id: string;
  name: string;
  /** Traffic initiator side. */
  fromZoneId: string;
  /** Traffic listener side. */
  toZoneId: string;
  /** Node of type "firewall" that enforces this conduit. */
  firewallId?: string;
  /** Services that must pass from -> to for the design to work. */
  requiredServices: ServiceId[];
  /** Ports the firewall rule set currently permits from -> to. */
  allowed: PortRange[];
  /** Free-text note, e.g. an approved exception reference. */
  note?: string;
}

export interface Project {
  id: string;
  name: string;
  site: string;
  engineer: string;
  createdAt: number;
  updatedAt: number;
  zones: Zone[];
  nodes: NetNode[];
  conduits: Conduit[];
}

export class PreflightDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  meta!: EntityTable<{ key: string; value: string }, 'key'>;

  constructor() {
    super('ot-preflight');
    this.version(1).stores({
      projects: 'id, name, updatedAt',
      meta: 'key',
    });
  }
}

export const db = new PreflightDB();

export const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export function newProject(name = 'Untitled project'): Project {
  const now = Date.now();
  return { id: uid('prj'), name, site: '', engineer: '', createdAt: now, updatedAt: now, zones: [], nodes: [], conduits: [] };
}

/**
 * Demo project with deliberate faults so the checker has something to show:
 * IT/OT subnet overlap, a PLC-to-cloud conduit with no DMZ, blocked AVEVA ports,
 * a duplicate IP, and an address outside its zone subnet.
 */
export function demoProject(): Project {
  const p = newProject('Demo - Packaging line 3 (seeded faults)');
  p.site = 'Demo plant';
  const z = (name: string, level: PurdueLevel, sl: SecurityLevel, subnets: string[]): Zone => ({
    id: uid('zn'),
    name,
    level,
    slTarget: sl,
    subnets,
  });
  const cloud = z('Vendor cloud', 5, 1, ['203.0.113.0/24']);
  const corp = z('Corporate IT', 4, 2, ['192.168.20.0/22']); // overlaps HMI zone on purpose
  const dmz = z('Industrial DMZ', 3.5, 3, ['172.16.35.0/24']);
  const ops = z('Site operations', 3, 3, ['10.20.3.0/24']);
  const hmi = z('Line 3 HMI', 2, 3, ['192.168.20.0/24']);
  const plc = z('Line 3 PLCs', 1, 3, ['10.20.1.0/24']);
  p.zones = [cloud, corp, dmz, ops, hmi, plc];

  const n = (zone: Zone, name: string, type: NodeType, ip: string, hosts: ServiceId[] = []): NetNode => ({
    id: uid('nd'),
    zoneId: zone.id,
    name,
    type,
    ip,
    hosts,
  });
  const fwIT = n(dmz, 'FW-DMZ-01', 'firewall', '172.16.35.1');
  const fwOT = n(ops, 'FW-OT-01', 'firewall', '10.20.3.1');
  const gis = n(ops, 'GR-Node', 'server', '10.20.3.10', ['nmx', 'opcua', 'asb']);
  const hist = n(ops, 'Historian', 'historian', '10.20.3.20', ['historian']);
  const hmi1 = n(hmi, 'HMI-L3-01', 'hmi', '192.168.20.31', ['nmx']);
  const plc1 = n(plc, 'PLC-Filler', 'plc', '10.20.1.11', ['modbus']);
  const plc2 = n(plc, 'PLC-Capper', 'plc', '10.20.1.11', ['modbus']); // duplicate IP
  const plc3 = n(plc, 'PLC-Labeler', 'plc', '10.20.2.12', ['modbus']); // outside subnet
  const sw = n(plc, 'SW-L1', 'switch', '');
  const vend = n(cloud, 'Vendor portal', 'cloud', '203.0.113.50');
  p.nodes = [fwIT, fwOT, gis, hist, hmi1, plc1, plc2, plc3, sw, vend];

  const c = (
    name: string,
    from: Zone,
    to: Zone,
    fw: NetNode | undefined,
    req: ServiceId[],
    allowed: PortRange[],
  ): Conduit => ({ id: uid('cd'), name, fromZoneId: from.id, toZoneId: to.id, firewallId: fw?.id, requiredServices: req, allowed });

  p.conduits = [
    c('HMI to PLC control', hmi, plc, fwOT, ['modbus'], [{ from: 502, to: 502 }]),
    c('Platform to HMI', ops, hmi, fwOT, ['nmx', 'opcua', 'asb'], [{ from: 5026, to: 5026 }]),
    c('Historian feed to DMZ', ops, dmz, fwIT, ['historian'], [{ from: 32568, to: 32568 }]),
    c('Remote access', dmz, corp, fwIT, [], [{ from: 3389, to: 3389 }]),
    c('PLC diagnostics to vendor', plc, cloud, undefined, [], [{ from: 443, to: 443 }]),
  ];
  return p;
}
