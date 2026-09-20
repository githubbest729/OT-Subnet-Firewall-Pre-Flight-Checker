import { Cloud, Cpu, Database, Monitor, Network, Router, Server, Shield, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { LEVELS, type NodeType } from '../lib/rules';
import type { Conduit, NetNode, Project, Zone } from '../lib/schema';
import type { Finding } from '../lib/validate';

export const NODE_ICON: Record<NodeType, LucideIcon> = {
  plc: Cpu,
  hmi: Monitor,
  server: Server,
  historian: Database,
  switch: Network,
  router: Router,
  firewall: Shield,
  cloud: Cloud,
};

const BAND_NAME: Record<number, string> = {
  5: 'Enterprise',
  4: 'Site IT',
  3.5: 'DMZ',
  3: 'Site ops',
  2: 'Supervisory',
  1: 'Control',
  0: 'Field',
};

const LABEL_W = 92;
const PAD = 20;
const TILE_W = 92;
const TILE_H = 76;
const TILE_GAP = 8;
const ZONE_HEAD = 62;
const BAND_PAD = 30;
const ZONE_GAP = 44;

interface Box {
  band: number;
  zone: Zone;
  x: number;
  y: number;
  w: number;
  h: number;
  nodes: NetNode[];
}

function layout(p: Project) {
  const boxes = new Map<string, Box>();
  const bands: { level: number; y: number; h: number }[] = [];
  let y = PAD;
  let maxW = 0;
  for (const meta of LEVELS) {
    const zones = p.zones.filter((z) => z.level === meta.level);
    if (!zones.length) continue;
    const sized = zones.map((zone) => {
      const nodes = p.nodes.filter((n) => n.zoneId === zone.id);
      const cols = Math.min(Math.max(nodes.length, 1), 3);
      const rows = Math.max(1, Math.ceil(nodes.length / 3));
      return {
        zone,
        nodes,
        w: Math.max(250, TILE_GAP + cols * (TILE_W + TILE_GAP)),
        h: ZONE_HEAD + rows * (TILE_H + TILE_GAP) + TILE_GAP,
      };
    });
    const bh = Math.max(...sized.map((s) => s.h)) + BAND_PAD * 2;
    let x = LABEL_W + PAD;
    for (const s of sized) {
      boxes.set(s.zone.id, { band: bands.length, zone: s.zone, x, y: y + BAND_PAD, w: s.w, h: s.h, nodes: s.nodes });
      x += s.w + ZONE_GAP;
    }
    bands.push({ level: meta.level, y, h: bh });
    maxW = Math.max(maxW, x - ZONE_GAP + PAD);
    y += bh;
  }
  return { boxes, bands, right: maxW, width: Math.max(maxW, 720), height: Math.max(y + PAD, 200) };
}

type Tone = 'error' | 'warning' | 'ok';
const worst = (list: Finding[] | undefined): Tone =>
  list?.some((f) => f.severity === 'error') ? 'error' : list?.some((f) => f.severity === 'warning') ? 'warning' : 'ok';
const TONE_COLOR: Record<Tone, string> = { error: '#c40a26', warning: '#8a4f00', ok: '#0a7a3c' };

interface Route {
  c: Conduit;
  d: string;
  mx: number;
  my: number;
}

function routes(p: Project, boxes: Map<string, Box>, right: number): { list: Route[]; lanes: number } {
  // spread conduits that share a zone edge so lines do not stack on top of each other
  const ends = new Map<string, string[]>();
  const push = (key: string, id: string) => ends.set(key, [...(ends.get(key) ?? []), id]);
  const usable = p.conduits.filter((c) => c.fromZoneId !== c.toZoneId && boxes.has(c.fromZoneId) && boxes.has(c.toZoneId));
  const side = (c: Conduit, which: 'from' | 'to') => {
    const a = boxes.get(c.fromZoneId)!;
    const b = boxes.get(c.toZoneId)!;
    if (a.y === b.y) return 'top';
    const down = a.y < b.y;
    return which === 'from' ? (down ? 'bottom' : 'top') : down ? 'top' : 'bottom';
  };
  for (const c of usable) {
    push(`${c.fromZoneId}:${side(c, 'from')}`, c.id);
    push(`${c.toZoneId}:${side(c, 'to')}`, c.id);
  }
  const offset = (zoneId: string, s: string, id: string) => {
    const list = ends.get(`${zoneId}:${s}`) ?? [id];
    return (list.indexOf(id) - (list.length - 1) / 2) * 22;
  };

  // conduits that skip Purdue levels run down a lane to the right of the zones,
  // so they never pass behind (and appear to touch) an intermediate zone
  const longIds = usable.filter((c) => Math.abs(boxes.get(c.fromZoneId)!.band - boxes.get(c.toZoneId)!.band) > 1).map((c) => c.id);

  const list = usable.map((c): Route => {
    const a = boxes.get(c.fromZoneId)!;
    const b = boxes.get(c.toZoneId)!;
    const lane = longIds.indexOf(c.id);
    if (lane >= 0) {
      const down = a.band < b.band;
      const laneX = right + 6 + lane * 32;
      const ax = a.x + a.w / 2 + offset(a.zone.id, side(c, 'from'), c.id);
      const bx = b.x + b.w / 2 + offset(b.zone.id, side(c, 'to'), c.id);
      const ay = down ? a.y + a.h : a.y;
      const by = down ? b.y : b.y + b.h;
      const y1 = down ? ay + 14 : ay - 14;
      const y2 = down ? by - 14 : by + 14;
      return { c, d: `M${ax} ${ay} V${y1} H${laneX} V${y2} H${bx} V${by}`, mx: laneX, my: (y1 + y2) / 2 + (lane % 2 ? 40 : -40) };
    }
    if (a.y === b.y) {
      const ax = a.x + a.w / 2 + offset(a.zone.id, 'top', c.id);
      const bx = b.x + b.w / 2 + offset(b.zone.id, 'top', c.id);
      const top = a.y - 18 - (Math.abs(a.x - b.x) > 500 ? 8 : 0);
      return { c, d: `M${ax} ${a.y} L${ax} ${top} L${bx} ${top} L${bx} ${b.y}`, mx: (ax + bx) / 2, my: top };
    }
    const down = a.y < b.y;
    const ax = a.x + a.w / 2 + offset(a.zone.id, side(c, 'from'), c.id);
    const ay = down ? a.y + a.h : a.y;
    const bx = b.x + b.w / 2 + offset(b.zone.id, side(c, 'to'), c.id);
    const by = down ? b.y : b.y + b.h;
    const m = (ay + by) / 2;
    return { c, d: `M${ax} ${ay} C${ax} ${m} ${bx} ${m} ${bx} ${by}`, mx: (ax + bx) / 2, my: m };
  });
  return { list, lanes: longIds.length };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '\u2026' : s);
const DOMAIN_FILL = { IT: '#dbe6f4', DMZ: '#ffe9a0', OT: '#e9edf0' } as const;

interface Props {
  project: Project;
  byTarget: Map<string, Finding[]>;
  focusId: string | null;
  onZone: (id: string) => void;
  onNode: (id: string) => void;
  onConduit: (id: string) => void;
}

export function TopologyMap({ project, byTarget, focusId, onZone, onNode, onConduit }: Props) {
  const L = useMemo(() => layout(project), [project]);
  const { list: R, lanes } = useMemo(() => routes(project, L.boxes, L.right), [project, L]);
  const width = Math.max(L.width, L.right + 50 + lanes * 32);

  if (project.zones.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border-2 border-dashed border-ink bg-white p-6 text-center">
        <p className="max-w-sm text-lg font-semibold">The map is empty. Add a zone below to place it on its Purdue level.</p>
      </div>
    );
  }

  const zoneDomainOf = (z: Zone) => LEVELS.find((l) => l.level === z.level)?.domain ?? 'OT';
  const zoneName = (id: string) => project.zones.find((z) => z.id === id)?.name ?? '';

  return (
    <div className="overflow-auto rounded-lg border-2 border-ink bg-white" style={{ maxHeight: '72vh' }}>
      <svg
        role="img"
        aria-label="Network zone and conduit map"
        width={width}
        height={L.height}
        viewBox={`0 0 ${width} ${L.height}`}
        className="block max-w-none"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <defs>
          {(['error', 'warning', 'ok'] as Tone[]).map((t) => (
            <marker key={t} id={`arrow-${t}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill={TONE_COLOR[t]} />
            </marker>
          ))}
        </defs>

        {/* Purdue bands */}
        {L.bands.map((b, i) => (
          <g key={b.level}>
            <rect x={0} y={b.y} width={width} height={b.h} fill={i % 2 ? '#f5f7f8' : '#ffffff'} />
            <rect x={0} y={b.y} width={LABEL_W} height={b.h} fill="#14181c" />
            <text x={LABEL_W / 2} y={b.y + b.h / 2 - 2} textAnchor="middle" fill="#ffc400" fontSize={26} fontWeight={800}>
              {`L${b.level}`}
            </text>
            <text x={LABEL_W / 2} y={b.y + b.h / 2 + 20} textAnchor="middle" fill="#ffffff" fontSize={13} fontWeight={600}>
              {BAND_NAME[b.level]}
            </text>
          </g>
        ))}

        {/* conduit lines */}
        {R.map(({ c, d }) => {
          const tone = worst(byTarget.get(c.id));
          const sel = focusId === c.id;
          return (
            <g key={c.id} onClick={() => onConduit(c.id)} style={{ cursor: 'pointer' }}>
              <path d={d} fill="none" stroke="transparent" strokeWidth={28} />
              {sel && <path d={d} fill="none" stroke="#ffc400" strokeWidth={13} />}
              <path
                d={d}
                fill="none"
                stroke={TONE_COLOR[tone]}
                strokeWidth={tone === 'error' ? 5 : 4}
                strokeDasharray={tone === 'error' ? '10 6' : undefined}
                markerEnd={`url(#arrow-${tone})`}
              />
            </g>
          );
        })}

        {/* zones and nodes */}
        {[...L.boxes.values()].map(({ zone, x, y, w, h, nodes }) => {
          const list = byTarget.get(zone.id);
          const errs = list?.filter((f) => f.severity === 'error').length ?? 0;
          const sel = focusId === zone.id;
          return (
            <g key={zone.id}>
              {sel && <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx={12} fill="#ffc400" />}
              <rect x={x} y={y} width={w} height={h} rx={8} fill="#ffffff" stroke={errs ? '#c40a26' : '#14181c'} strokeWidth={errs ? 5 : 3} />
              <g onClick={() => onZone(zone.id)} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y} width={w} height={ZONE_HEAD - 6} rx={8} fill={DOMAIN_FILL[zoneDomainOf(zone)]} />
                <text x={x + 12} y={y + 24} fontSize={16} fontWeight={800} fill="#14181c">
                  {clip(zone.name, 26)}
                </text>
                <text x={x + 12} y={y + 44} fontSize={12.5} fill="#14181c" fontFamily="var(--font-mono)">
                  {`SL${zone.slTarget}  ${zone.subnets.length ? clip(zone.subnets.join(' '), 28) : 'no subnet'}`}
                </text>
                {errs > 0 && (
                  <g>
                    <circle cx={x + w - 6} cy={y + 2} r={14} fill="#c40a26" stroke="#fff" strokeWidth={2} />
                    <text x={x + w - 6} y={y + 7.5} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={800}>
                      {errs}
                    </text>
                  </g>
                )}
              </g>
              {nodes.map((n, i) => {
                const col = i % 3;
                const row = Math.floor(i / 3);
                const nx = x + TILE_GAP + col * (TILE_W + TILE_GAP);
                const ny = y + ZONE_HEAD + row * (TILE_H + TILE_GAP);
                const bad = worst(byTarget.get(n.id)) === 'error';
                const Icon = NODE_ICON[n.type];
                return (
                  <g key={n.id} onClick={() => onNode(n.id)} style={{ cursor: 'pointer' }}>
                    {focusId === n.id && <rect x={nx - 4} y={ny - 4} width={TILE_W + 8} height={TILE_H + 8} rx={10} fill="#ffc400" />}
                    <rect
                      x={nx}
                      y={ny}
                      width={TILE_W}
                      height={TILE_H}
                      rx={7}
                      fill={bad ? '#fde3e7' : '#ffffff'}
                      stroke={bad ? '#c40a26' : '#14181c'}
                      strokeWidth={bad ? 4 : 2}
                    />
                    <Icon x={nx + TILE_W / 2 - 13} y={ny + 6} size={26} strokeWidth={2.2} color={bad ? '#c40a26' : '#14181c'} />
                    <text x={nx + TILE_W / 2} y={ny + 50} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#14181c">
                      {clip(n.name, 12)}
                    </text>
                    <text x={nx + TILE_W / 2} y={ny + 66} textAnchor="middle" fontSize={11} fill={bad ? '#c40a26' : '#14181c'} fontFamily="var(--font-mono)">
                      {n.ip || 'no ip'}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* conduit labels sit on top so they stay tappable */}
        {R.map(({ c, mx, my }) => {
          const tone = worst(byTarget.get(c.id));
          const text = clip(c.name, 22);
          const w = text.length * 7 + 22;
          return (
            <g key={c.id} onClick={() => onConduit(c.id)} style={{ cursor: 'pointer' }} aria-label={`${c.name}: ${zoneName(c.fromZoneId)} to ${zoneName(c.toZoneId)}`}>
              <rect x={mx - w / 2} y={my - 14} width={w} height={28} rx={14} fill={tone === 'error' ? '#c40a26' : '#ffffff'} stroke={TONE_COLOR[tone]} strokeWidth={3} />
              <text x={mx} y={my + 5} textAnchor="middle" fontSize={12.5} fontWeight={800} fill={tone === 'error' ? '#ffffff' : '#14181c'}>
                {text}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
