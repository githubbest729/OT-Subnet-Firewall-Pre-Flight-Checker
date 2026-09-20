import { Check, Minus, X } from 'lucide-react';
import { useState } from 'react';
import { addPort, formatPorts, parsePorts, removePort } from '../lib/ports';
import { SERVICES, SERVICE_BY_ID } from '../lib/rules';
import type { Conduit } from '../lib/schema';
import { conduitPortRows, type ValidationResult } from '../lib/validate';
import { useStore } from '../store';
import { Btn, Card, Switch, cx } from './ui';

function status(required: boolean, open: boolean) {
  if (required && !open) return { text: 'Blocked', cls: 'bg-alarm text-white border-ink', row: 'bg-alarm-tint' };
  if (required && open) return { text: 'Open', cls: 'bg-go text-white border-ink', row: '' };
  if (open) return { text: 'Open, unused', cls: 'bg-caution-tint text-caution border-caution', row: '' };
  return { text: 'Not needed', cls: 'bg-white text-ink border-steel-dark', row: '' };
}

function Matrix() {
  const project = useStore((s) => s.project);
  if (project.conduits.length === 0) return null;
  const zone = (id: string) => project.zones.find((z) => z.id === id)?.name ?? '?';
  return (
    <Card className="overflow-x-auto">
      <h2 className="mb-3 text-xl font-bold">Port matrix</h2>
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr>
            <th className="pb-2 pr-3 text-sm font-semibold">Conduit</th>
            {SERVICES.map((s) => (
              <th key={s.id} className="px-1 pb-2 text-center text-sm font-semibold">
                {s.short}
                <br />
                <span className="font-mono">{s.port}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {project.conduits.map((c) => (
            <tr key={c.id} className="border-t border-steel-dark">
              <td className="py-2 pr-3">
                <div className="font-bold">{c.name}</div>
                <div className="text-sm">
                  {zone(c.fromZoneId)} to {zone(c.toZoneId)}
                </div>
              </td>
              {conduitPortRows(c).map((r) => {
                const blocked = r.required && !r.open;
                return (
                  <td key={r.service.id} className="px-1 py-2 text-center">
                    <span
                      role="img"
                      aria-label={status(r.required, r.open).text}
                      className={cx(
                        'inline-grid h-11 w-11 place-items-center rounded-md border-2',
                        blocked && 'border-ink bg-alarm text-white',
                        r.required && r.open && 'border-ink bg-go text-white',
                        !r.required && r.open && 'border-caution bg-caution-tint text-caution',
                        !r.required && !r.open && 'border-steel-dark text-steel-dark',
                      )}
                    >
                      {blocked ? <X strokeWidth={4} /> : r.required || r.open ? <Check strokeWidth={4} /> : <Minus />}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
        <span>
          <X size={14} className="inline text-alarm" strokeWidth={4} /> Required, blocked
        </span>
        <span>
          <Check size={14} className="inline text-go" strokeWidth={4} /> Required, open
        </span>
        <span>
          <Check size={14} className="inline text-caution" strokeWidth={4} /> Open, not required
        </span>
        <span>
          <Minus size={14} className="inline" /> Not used
        </span>
      </p>
    </Card>
  );
}

function ConduitPorts({ c, v }: { c: Conduit; v: ValidationResult }) {
  const zones = useStore((s) => s.project.zones);
  const nodes = useStore((s) => s.project.nodes);
  const update = useStore((s) => s.updateConduit);
  const [draft, setDraft] = useState<string | null>(null);
  const zone = (id: string) => zones.find((z) => z.id === id)?.name ?? '?';
  const fw = nodes.find((n) => n.id === c.firewallId)?.name;
  const rows = conduitPortRows(c);
  const blocked = rows.filter((r) => r.required && !r.open);
  const parsed = parsePorts(draft ?? '');

  const toggleRequired = (id: (typeof SERVICES)[number]['id'], on: boolean) =>
    update(c.id, { requiredServices: on ? [...c.requiredServices, id] : c.requiredServices.filter((x) => x !== id) });
  const toggleOpen = (port: number, on: boolean) => update(c.id, { allowed: on ? addPort(c.allowed, port) : removePort(c.allowed, port) });

  const suggest = () => {
    const hosted = new Set(nodes.filter((n) => n.zoneId === c.toZoneId).flatMap((n) => n.hosts));
    update(c.id, { requiredServices: SERVICES.filter((s) => hosted.has(s.id) || c.requiredServices.includes(s.id)).map((s) => s.id) });
  };
  const openMissing = () => {
    let a = c.allowed;
    for (const r of blocked) a = addPort(a, r.service.port);
    update(c.id, { allowed: a });
  };

  return (
    <Card className={cx(blocked.length > 0 && 'border-alarm')}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold">{c.name}</h3>
          <p className="text-sm font-semibold">
            {zone(c.fromZoneId)} to {zone(c.toZoneId)} via {fw ?? 'no firewall'}
          </p>
        </div>
        {blocked.length > 0 ? (
          <span className="rounded-md border-2 border-ink bg-alarm px-3 py-1 font-bold text-white">{blocked.length} blocked</span>
        ) : (
          <span className="rounded-md border-2 border-go bg-go-tint px-3 py-1 font-bold text-go">All required ports open</span>
        )}
      </div>

      <div className="divide-y divide-steel-dark">
        {rows.map((r) => {
          const st = status(r.required, r.open);
          return (
            <div key={r.service.id} className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 py-3', st.row)}>
              <div className="min-w-56 flex-1">
                <p className="font-bold leading-tight">{r.service.name}</p>
                <p className="font-mono text-sm font-bold">
                  {r.service.port}/{r.service.proto}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-semibold">Needed</span>
                <Switch label={`${r.service.short} needed`} tone="signal" on={r.required} onChange={(on) => toggleRequired(r.service.id, on)} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-semibold">Firewall allows</span>
                <Switch label={`${r.service.short} allowed by firewall`} on={r.open} onChange={(on) => toggleOpen(r.service.port, on)} />
              </div>
              <span className={cx('w-32 rounded-md border-2 px-2 py-2 text-center font-bold', st.cls)}>{st.text}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-semibold" htmlFor={`ports-${c.id}`}>
          All ports the firewall allows (comma list, ranges, or any)
        </label>
        <input
          id={`ports-${c.id}`}
          value={draft ?? formatPorts(c.allowed)}
          onFocus={() => setDraft(formatPorts(c.allowed))}
          onChange={(e) => {
            setDraft(e.target.value);
            const p = parsePorts(e.target.value);
            if (p.invalid.length === 0) update(c.id, { allowed: p.ranges });
          }}
          onBlur={() => setDraft(null)}
          inputMode="numeric"
          className={cx(
            'min-h-12 w-full rounded-md border-2 px-3 font-mono',
            draft !== null && parsed.invalid.length ? 'border-alarm bg-alarm-tint text-alarm' : 'border-ink bg-white',
          )}
          placeholder="502, 5026, 32568"
        />
        {draft !== null && parsed.invalid.length > 0 && (
          <p role="alert" className="mt-1 text-sm font-semibold text-alarm">
            Not a port: {parsed.invalid.join(', ')}. Ports run from 1 to 65535.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn onClick={suggest}>Suggest needed ports from destination devices</Btn>
        <Btn variant="primary" disabled={blocked.length === 0} onClick={openMissing}>
          Add {blocked.length || ''} missing rule{blocked.length === 1 ? '' : 's'}
        </Btn>
      </div>
      {v.byTarget.get(c.id)?.some((f) => f.category === 'port' && f.severity !== 'info' && !(f.id.startsWith('blocked'))) && (
        <ul className="mt-3 space-y-1 text-sm font-semibold">
          {v.byTarget
            .get(c.id)!
            .filter((f) => f.category === 'port' && f.severity !== 'info' && !f.id.startsWith('blocked'))
            .map((f) => (
              <li key={f.id} className={cx('rounded px-2 py-1', f.severity === 'error' ? 'bg-alarm text-white' : 'bg-caution-tint text-caution')}>
                {f.title}
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}

export function Ports({ v }: { v: ValidationResult }) {
  const project = useStore((s) => s.project);
  const setTab = useStore((s) => s.setTab);
  if (project.conduits.length === 0) {
    return (
      <Card className="space-y-3 text-center">
        <p className="text-lg font-semibold">No conduits yet. Ports are checked per conduit.</p>
        <Btn variant="primary" onClick={() => setTab('topology')}>
          Go to topology
        </Btn>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Matrix />
      {project.conduits.map((c) => (
        <ConduitPorts key={c.id} c={c} v={v} />
      ))}
      <p className="text-sm">
        Port list: {SERVICES.map((s) => `${s.short} ${s.port}`).join(', ')}. {Object.keys(SERVICE_BY_ID).length} services checked offline.
      </p>
    </div>
  );
}

