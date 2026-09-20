import { ArrowLeftRight, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ipToInt, parseCidr } from '../lib/netmath';
import { conduitPortRows, type ValidationResult } from '../lib/validate';
import { LEVELS, NODE_TYPE_LABEL, SERVICES, type NodeType, type PurdueLevel } from '../lib/rules';
import { useStore, type EditorSection } from '../store';
import { TopologyMap } from './TopologyMap';
import { Btn, Card, Chip, DeleteBtn, Field, InlineFindings, Segmented, Select, TextInput } from './ui';

const levelTag = (l: PurdueLevel) => `L${l}`;

function useScrollTo(id: string | null) {
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    return () => clearTimeout(t);
  }, [id]);
}

/* ---------------- zones ---------------- */

function ZoneCard({ id, v }: { id: string; v: ValidationResult }) {
  const zone = useStore((s) => s.project.zones.find((z) => z.id === id))!;
  const focusId = useStore((s) => s.focusId);
  const update = useStore((s) => s.updateZone);
  const remove = useStore((s) => s.removeZone);
  const [draft, setDraft] = useState('');
  const parsed = draft.trim() ? parseCidr(draft) : null;

  const add = () => {
    if (!parsed || !parsed.ok) return;
    if (!zone.subnets.includes(parsed.info.cidr)) update(id, { subnets: [...zone.subnets, parsed.info.cidr] });
    setDraft('');
  };

  return (
    <Card id={`item-${id}`} highlight={focusId === id} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Zone name">
          <TextInput value={zone.name} onChange={(e) => update(id, { name: e.target.value })} />
        </Field>
        <Field label="Purdue level">
          <Select value={String(zone.level)} onChange={(e) => update(id, { level: Number(e.target.value) as PurdueLevel })}>
            {LEVELS.map((l) => (
              <option key={l.level} value={l.level}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div>
        <span className="mb-1 block text-sm font-semibold">Target security level (IEC 62443 SL-T)</span>
        <Segmented
          label="Security level target"
          value={zone.slTarget}
          onChange={(x) => update(id, { slTarget: x })}
          options={[1, 2, 3, 4].map((n) => ({ value: n as 1 | 2 | 3 | 4, label: `SL ${n}` }))}
        />
      </div>

      <div>
        <span className="mb-1 block text-sm font-semibold">Subnets</span>
        <ul className="mb-2 space-y-2">
          {zone.subnets.length === 0 && <li className="text-sm">No subnets yet.</li>}
          {zone.subnets.map((s) => {
            const r = parseCidr(s);
            return (
              <li key={s} className={`flex items-center justify-between gap-2 rounded-md border-2 px-3 py-1 ${r.ok ? 'border-ink' : 'border-alarm bg-alarm-tint'}`}>
                <div>
                  <span className="font-mono text-lg font-bold">{s}</span>
                  <span className="ml-3 text-sm">
                    {r.ok ? `${r.info.usableHosts.toLocaleString()} hosts, ${r.info.firstUsable} to ${r.info.lastUsable}` : r.error}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-md border-2 border-ink bg-white"
                  onClick={() => update(id, { subnets: zone.subnets.filter((x) => x !== s) })}
                >
                  <X />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <TextInput
            mono
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="10.20.1.0/24"
            aria-label="New subnet"
            value={draft}
            invalid={!!parsed && !parsed.ok}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Btn variant="primary" disabled={!parsed || !parsed.ok} onClick={add}>
            <Plus size={18} /> Add
          </Btn>
        </div>
        {parsed && !parsed.ok && <p className="mt-1 text-sm font-semibold text-alarm">{parsed.error}</p>}
      </div>

      <InlineFindings list={v.byTarget.get(id)} />
      <div className="flex justify-end">
        <DeleteBtn label="Delete zone" onConfirm={() => remove(id)} />
      </div>
    </Card>
  );
}

/* ---------------- nodes ---------------- */

function NodeCard({ id, v }: { id: string; v: ValidationResult }) {
  const node = useStore((s) => s.project.nodes.find((n) => n.id === id))!;
  const zones = useStore((s) => s.project.zones);
  const focusId = useStore((s) => s.focusId);
  const update = useStore((s) => s.updateNode);
  const remove = useStore((s) => s.removeNode);
  const bad = (node.ip.trim() !== '' && ipToInt(node.ip.trim()) === null) || !!v.byTarget.get(id)?.some((f) => f.severity === 'error' && f.category === 'address');

  return (
    <Card id={`item-${id}`} highlight={focusId === id} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Device name">
          <TextInput value={node.name} onChange={(e) => update(id, { name: e.target.value })} />
        </Field>
        <Field label="IPv4 address">
          <TextInput
            mono
            inputMode="decimal"
            placeholder="10.20.1.11"
            value={node.ip}
            invalid={bad}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => update(id, { ip: e.target.value })}
          />
        </Field>
        <Field label="Device type">
          <Select value={node.type} onChange={(e) => update(id, { type: e.target.value as NodeType })}>
            {(Object.keys(NODE_TYPE_LABEL) as NodeType[]).map((t) => (
              <option key={t} value={t}>
                {NODE_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Zone">
          <Select value={node.zoneId} onChange={(e) => update(id, { zoneId: e.target.value })}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {levelTag(z.level)} {z.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <span className="mb-1 block text-sm font-semibold">Services this device listens on</span>
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <Chip
              key={s.id}
              on={node.hosts.includes(s.id)}
              onClick={() => update(id, { hosts: node.hosts.includes(s.id) ? node.hosts.filter((h) => h !== s.id) : [...node.hosts, s.id] })}
            >
              {s.short} {s.port}
            </Chip>
          ))}
        </div>
      </div>
      <InlineFindings list={v.byTarget.get(id)} />
      <div className="flex justify-end">
        <DeleteBtn label="Delete device" onConfirm={() => remove(id)} />
      </div>
    </Card>
  );
}

/* ---------------- conduits ---------------- */

function ConduitCard({ id, v }: { id: string; v: ValidationResult }) {
  const conduit = useStore((s) => s.project.conduits.find((c) => c.id === id))!;
  const zones = useStore((s) => s.project.zones);
  const nodes = useStore((s) => s.project.nodes);
  const focusId = useStore((s) => s.focusId);
  const update = useStore((s) => s.updateConduit);
  const remove = useStore((s) => s.removeConduit);
  const setTab = useStore((s) => s.setTab);
  const firewalls = nodes.filter((n) => n.type === 'firewall');
  const rows = conduitPortRows(conduit).filter((r) => r.required || r.open);

  return (
    <Card id={`item-${id}`} highlight={focusId === id} className="space-y-4">
      <Field label="Conduit name">
        <TextInput value={conduit.name} onChange={(e) => update(id, { name: e.target.value })} />
      </Field>
      <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
        <Field label="From (initiates traffic)">
          <Select value={conduit.fromZoneId} onChange={(e) => update(id, { fromZoneId: e.target.value })}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {levelTag(z.level)} {z.name}
              </option>
            ))}
          </Select>
        </Field>
        <Btn aria-label="Swap direction" onClick={() => update(id, { fromZoneId: conduit.toZoneId, toZoneId: conduit.fromZoneId })}>
          <ArrowLeftRight size={20} />
        </Btn>
        <Field label="To (listens)">
          <Select value={conduit.toZoneId} onChange={(e) => update(id, { toZoneId: e.target.value })}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {levelTag(z.level)} {z.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Enforcing firewall">
          <Select value={conduit.firewallId ?? ''} onChange={(e) => update(id, { firewallId: e.target.value || undefined })}>
            <option value="">None assigned</option>
            {firewalls.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({zones.find((z) => z.id === n.zoneId)?.name ?? '?'})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note or approved exception">
          <TextInput value={conduit.note ?? ''} onChange={(e) => update(id, { note: e.target.value })} />
        </Field>
      </div>

      <div>
        <span className="mb-1 block text-sm font-semibold">Ports</span>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length === 0 && <span className="text-sm">No services required and no ports open.</span>}
          {rows.map((r) => {
            const blocked = r.required && !r.open;
            return (
              <span
                key={r.service.id}
                className={`rounded-md border-2 px-2 py-1 font-mono text-sm font-bold ${blocked ? 'border-ink bg-alarm text-white' : r.required ? 'border-go bg-go-tint text-go' : 'border-caution bg-caution-tint text-caution'}`}
              >
                {r.service.port} {blocked ? 'blocked' : r.required ? 'open' : 'open, unused'}
              </span>
            );
          })}
          <Btn onClick={() => setTab('ports')}>Edit ports</Btn>
        </div>
      </div>

      <InlineFindings list={v.byTarget.get(id)} />
      <div className="flex justify-end">
        <DeleteBtn label="Delete conduit" onConfirm={() => remove(id)} />
      </div>
    </Card>
  );
}

/* ---------------- view ---------------- */

export function Topology({ v }: { v: ValidationResult }) {
  const project = useStore((s) => s.project);
  const section = useStore((s) => s.section);
  const focusId = useStore((s) => s.focusId);
  const focus = useStore((s) => s.focus);
  const addZone = useStore((s) => s.addZone);
  const addNode = useStore((s) => s.addNode);
  const addConduit = useStore((s) => s.addConduit);
  const loadDemo = useStore((s) => s.loadDemo);
  const [level, setLevel] = useState<PurdueLevel>(2);
  const [nodeZone, setNodeZone] = useState('');
  useScrollTo(focusId);

  const setSection = (s: EditorSection) => useStore.setState({ section: s, focusId: null });
  const counts = useMemo(
    () => ({ zones: project.zones.length, nodes: project.nodes.length, conduits: project.conduits.length }),
    [project.zones.length, project.nodes.length, project.conduits.length],
  );

  return (
    <div className="space-y-4">
      <TopologyMap
        project={project}
        byTarget={v.byTarget}
        focusId={focusId}
        onZone={(id) => focus('zones', id)}
        onNode={(id) => focus('nodes', id)}
        onConduit={(id) => focus('conduits', id)}
      />
      <p className="text-sm">Tap a zone, device or conduit on the map to edit it. Red outlines and dashed lines are blocking faults.</p>

      <Segmented
        label="Editor section"
        value={section}
        onChange={setSection}
        options={[
          { value: 'zones', label: `Zones (${counts.zones})` },
          { value: 'nodes', label: `Devices (${counts.nodes})` },
          { value: 'conduits', label: `Conduits (${counts.conduits})` },
        ]}
      />

      {section === 'zones' && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-end gap-3">
            <Field label="New zone at level" className="min-w-64 flex-1">
              <Select value={String(level)} onChange={(e) => setLevel(Number(e.target.value) as PurdueLevel)}>
                {LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Btn variant="primary" onClick={() => focus('zones', addZone(level))}>
              <Plus size={18} /> Add zone
            </Btn>
            {project.zones.length === 0 && <Btn onClick={loadDemo}>Load demo project</Btn>}
          </Card>
          {project.zones.length === 0 && (
            <p className="px-1 text-lg font-semibold">Start by adding the zones that exist on site, one per Purdue level.</p>
          )}
          {[...project.zones]
            .sort((a, b) => b.level - a.level)
            .map((z) => (
              <ZoneCard key={z.id} id={z.id} v={v} />
            ))}
        </div>
      )}

      {section === 'nodes' && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-end gap-3">
            <Field label="Add device to zone" className="min-w-64 flex-1">
              <Select value={nodeZone || project.zones[0]?.id || ''} onChange={(e) => setNodeZone(e.target.value)} disabled={project.zones.length === 0}>
                {project.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {levelTag(z.level)} {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Btn variant="primary" disabled={project.zones.length === 0} onClick={() => focus('nodes', addNode(nodeZone || project.zones[0].id))}>
              <Plus size={18} /> Add device
            </Btn>
          </Card>
          {project.zones.length === 0 && <p className="px-1 font-semibold">Add a zone first, then place devices in it.</p>}
          {project.nodes.map((n) => (
            <NodeCard key={n.id} id={n.id} v={v} />
          ))}
        </div>
      )}

      {section === 'conduits' && (
        <div className="space-y-4">
          <Card className="flex items-center justify-between gap-3">
            <p className="font-semibold">A conduit is the allowed path between two zones.</p>
            <Btn variant="primary" disabled={project.zones.length < 2} onClick={() => focus('conduits', addConduit())}>
              <Plus size={18} /> Add conduit
            </Btn>
          </Card>
          {project.zones.length < 2 && <p className="px-1 font-semibold">You need at least two zones to draw a conduit.</p>}
          {project.conduits.map((c) => (
            <ConduitCard key={c.id} id={c.id} v={v} />
          ))}
        </div>
      )}
    </div>
  );
}
