import { AlertOctagon, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { parseCidr, overlap, type SubnetInfo } from '../lib/netmath';
import { useStore } from '../store';
import { Btn, Card, Field, Select, TextInput, cx } from './ui';

function BitBar({ prefix }: { prefix: number }) {
  return (
    <div>
      <div className="flex flex-wrap gap-x-3 gap-y-2" aria-hidden>
        {[0, 1, 2, 3].map((o) => (
          <div key={o} className="flex gap-[3px]">
            {Array.from({ length: 8 }, (_, b) => {
              const i = o * 8 + b;
              return <span key={b} className={cx('h-6 w-3 rounded-[2px] border border-ink', i < prefix ? 'bg-ink' : 'bg-signal')} />;
            })}
          </div>
        ))}
      </div>
      <p className="mt-1 text-sm">
        <span className="mr-1 inline-block h-3 w-3 border border-ink bg-ink align-middle" /> {prefix} network bits
        <span className="ml-3 mr-1 inline-block h-3 w-3 border border-ink bg-signal align-middle" /> {32 - prefix} host bits
      </p>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-steel-dark py-2 last:border-0">
    <dt className="text-sm font-semibold">{k}</dt>
    <dd className="font-mono text-lg font-bold">{v}</dd>
  </div>
);

function AddToZone({ cidr }: { cidr: string }) {
  const zones = useStore((s) => s.project.zones);
  const updateZone = useStore((s) => s.updateZone);
  const [zoneId, setZoneId] = useState('');
  const chosen = zones.find((z) => z.id === zoneId);
  if (zones.length === 0) return null;
  return (
    <div className="mt-4 flex gap-2">
      <Select aria-label="Zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
        <option value="">Add to zone...</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </Select>
      <Btn
        disabled={!chosen || chosen.subnets.includes(cidr)}
        onClick={() => chosen && updateZone(chosen.id, { subnets: [...chosen.subnets, cidr] })}
      >
        {chosen?.subnets.includes(cidr) ? 'Added' : 'Add'}
      </Btn>
    </div>
  );
}

function NetCard({ title, hint, value, onChange }: { title: string; hint: string; value: string; onChange: (v: string) => void }) {
  const r = parseCidr(value);
  const i: SubnetInfo | null = r.ok ? r.info : null;
  return (
    <Card>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mb-3 text-sm">{hint}</p>
      <Field label="Address / CIDR or address + mask" error={r.ok ? null : value.trim() ? r.error : null}>
        <TextInput
          mono
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          invalid={!r.ok && value.trim() !== ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="192.168.10.0/24"
        />
      </Field>
      {i && (
        <div className="mt-4 space-y-4">
          {i.hostBitsSet && (
            <p className="rounded bg-caution-tint px-3 py-2 text-sm font-semibold text-caution">
              {i.ip} is a host address. The network is {i.cidr}.
            </p>
          )}
          <BitBar prefix={i.prefix} />
          <dl>
            <Row k="Network" v={i.cidr} />
            <Row k="Subnet mask" v={i.mask} />
            <Row k="Wildcard" v={i.wildcard} />
            <Row k="Broadcast" v={i.prefix >= 31 ? 'n/a' : i.broadcast} />
            <Row k="First usable" v={i.firstUsable} />
            <Row k="Last usable" v={i.lastUsable} />
            <Row k="Usable hosts" v={i.usableHosts.toLocaleString()} />
            <Row k="Address type" v={i.range === 'RFC1918' ? 'Private (RFC 1918)' : i.range} />
          </dl>
          {i.range === 'public' && (
            <p className="rounded bg-caution-tint px-3 py-2 text-sm font-semibold text-caution">
              Public address space. Confirm this range is really owned by the site.
            </p>
          )}
          <AddToZone cidr={i.cidr} />
        </div>
      )}
    </Card>
  );
}

export function Calculator() {
  const calc = useStore((s) => s.calc);
  const setCalc = useStore((s) => s.setCalc);
  const a = parseCidr(calc.it);
  const b = parseCidr(calc.ot);
  const o = a.ok && b.ok ? overlap(a.info, b.info) : null;

  return (
    <div className="space-y-4">
      {o &&
        (o.kind === 'none' ? (
          <div role="status" className="flex items-center gap-3 rounded-lg border-2 border-go bg-go-tint p-4 text-go">
            <CheckCircle2 size={36} className="shrink-0" />
            <div>
              <p className="text-xl font-bold">No overlap</p>
              <p className="font-semibold">IT and OT ranges are separate.</p>
            </div>
          </div>
        ) : (
          <div role="alert" className="flex items-center gap-3 rounded-lg border-2 border-ink bg-alarm p-4 text-white">
            <AlertOctagon size={40} className="shrink-0" />
            <div>
              <p className="text-2xl font-bold">IT / OT overlap</p>
              <p className="font-mono text-lg font-bold">
                {o.sharedFrom} - {o.sharedTo}
              </p>
              <p className="font-semibold">
                {o.sharedCount?.toLocaleString()} shared addresses.{' '}
                {o.kind === 'identical'
                  ? 'The two ranges are identical.'
                  : o.kind === 'a-contains-b'
                    ? 'The IT range fully contains the OT range.'
                    : 'The OT range fully contains the IT range.'}{' '}
                Re-address one side or put NAT on the conduit.
              </p>
            </div>
          </div>
        ))}
      <div className="grid gap-4 md:grid-cols-2">
        <NetCard title="Corporate IT network" hint="Level 4 / 5 range from the IT team." value={calc.it} onChange={(v) => setCalc('it', v)} />
        <NetCard title="OT production network" hint="Level 0 - 3 range you are about to connect." value={calc.ot} onChange={(v) => setCalc('ot', v)} />
      </div>
    </div>
  );
}
