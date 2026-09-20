/**
 * STEP 2 - Validation rule set.
 * Ports below follow the project specification. Confirm them against the
 * firewall documentation for the AVEVA System Platform version installed on site;
 * add site-specific services to SERVICES and the whole app picks them up.
 */

export type ServiceId = 'modbus' | 'opcua' | 'nmx' | 'historian' | 'asb';

export interface ServiceRule {
  id: ServiceId;
  short: string;
  name: string;
  port: number;
  proto: 'TCP' | 'UDP';
  vendor: 'Industrial' | 'AVEVA';
  purpose: string;
  /** Which node types normally listen on this service (used for suggestions). */
  hostedBy: NodeType[];
}

export type NodeType =
  | 'plc'
  | 'hmi'
  | 'server'
  | 'historian'
  | 'switch'
  | 'router'
  | 'firewall'
  | 'cloud';

export const SERVICES: readonly ServiceRule[] = [
  {
    id: 'modbus',
    short: 'Modbus/TCP',
    name: 'Modbus/TCP',
    port: 502,
    proto: 'TCP',
    vendor: 'Industrial',
    purpose: 'PLC / RTU register access',
    hostedBy: ['plc'],
  },
  {
    id: 'opcua',
    short: 'OPC UA',
    name: 'AVEVA OPC UA Server / Platform Common Services',
    port: 48031,
    proto: 'TCP',
    vendor: 'AVEVA',
    purpose: 'OPC UA endpoint and Platform Common Services',
    hostedBy: ['server', 'hmi'],
  },
  {
    id: 'nmx',
    short: 'NMXSVC',
    name: 'AVEVA NMXSVC / Platform Communications',
    port: 5026,
    proto: 'TCP',
    vendor: 'AVEVA',
    purpose: 'Platform-to-platform messaging (galaxy, engines, IDE)',
    hostedBy: ['server', 'hmi'],
  },
  {
    id: 'historian',
    short: 'Historian RT',
    name: 'AVEVA Historian real-time service',
    port: 32568,
    proto: 'TCP',
    vendor: 'AVEVA',
    purpose: 'Real-time tag data to and from Historian',
    hostedBy: ['historian'],
  },
  {
    id: 'asb',
    short: 'ASB auth',
    name: 'AVEVA ASBAuthentication Service',
    port: 808,
    proto: 'TCP',
    vendor: 'AVEVA',
    purpose: 'Authentication for Application Server Bus services',
    hostedBy: ['server'],
  },
];

export const SERVICE_BY_ID: Record<ServiceId, ServiceRule> = Object.fromEntries(
  SERVICES.map((s) => [s.id, s]),
) as Record<ServiceId, ServiceRule>;

export const SERVICE_BY_PORT: Map<number, ServiceRule> = new Map(SERVICES.map((s) => [s.port, s]));

/** Ports that should never cross an OT/IT boundary without a written exception. */
export const RISKY_PORTS: Record<number, string> = {
  21: 'FTP sends credentials in clear text',
  23: 'Telnet sends credentials in clear text',
  135: 'Windows RPC endpoint mapper',
  139: 'NetBIOS session service',
  445: 'SMB file sharing, common ransomware path',
  3389: 'Remote Desktop, needs a jump host in the DMZ',
  5900: 'VNC, often unauthenticated',
};

/* ---------- IEC 62443 / Purdue model ---------- */

export type PurdueLevel = 0 | 1 | 2 | 3 | 3.5 | 4 | 5;

export interface LevelMeta {
  level: PurdueLevel;
  label: string;
  domain: 'OT' | 'DMZ' | 'IT';
}

/** Top-to-bottom order used for the map and for adjacency checks. */
export const LEVELS: readonly LevelMeta[] = [
  { level: 5, label: 'Level 5 - Enterprise / Cloud', domain: 'IT' },
  { level: 4, label: 'Level 4 - Site business (corporate IT)', domain: 'IT' },
  { level: 3.5, label: 'Level 3.5 - Industrial DMZ', domain: 'DMZ' },
  { level: 3, label: 'Level 3 - Site operations', domain: 'OT' },
  { level: 2, label: 'Level 2 - Area supervisory (HMI)', domain: 'OT' },
  { level: 1, label: 'Level 1 - Basic control (PLC)', domain: 'OT' },
  { level: 0, label: 'Level 0 - Process / field I/O', domain: 'OT' },
];

export const LEVEL_META = new Map(LEVELS.map((l) => [l.level, l]));

export function levelIndex(level: PurdueLevel): number {
  return LEVELS.findIndex((l) => l.level === level);
}

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  plc: 'PLC',
  hmi: 'HMI / workstation',
  server: 'Server',
  historian: 'Historian',
  switch: 'Switch',
  router: 'Router',
  firewall: 'Firewall',
  cloud: 'Cloud / internet',
};
