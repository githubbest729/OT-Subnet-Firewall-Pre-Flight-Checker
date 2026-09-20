import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store';
import type { Finding, Severity, ValidationResult } from '../lib/validate';
import { FindingCard, cx } from './ui';

const FILTERS: { id: 'all' | Severity; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Blocking' },
  { id: 'warning', label: 'Warnings' },
  { id: 'info', label: 'Notes' },
];

export function FindingsList({ v, compact }: { v: ValidationResult; compact?: boolean }) {
  const focus = useStore((s) => s.focus);
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const list = v.findings.filter((f) => filter === 'all' || f.severity === filter);
  const open = (f: Finding) => f.target && focus(f.target.kind === 'zone' ? 'zones' : f.target.kind === 'node' ? 'nodes' : 'conduits', f.target.id);
  const project = useStore((s) => s.project);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter findings">
        {FILTERS.map((f) => {
          const n = f.id === 'all' ? v.findings.length : v.counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cx('min-h-12 rounded-md border-2 border-ink px-3 font-bold', filter === f.id ? 'bg-ink text-white' : 'bg-white')}
            >
              {f.label} {n}
            </button>
          );
        })}
      </div>
      {list.length === 0 && (
        <p className="rounded-lg border-2 border-go bg-go-tint p-3 font-semibold text-go">
          {project.zones.length === 0 ? 'Nothing to check yet. Add zones on the Topology tab.' : 'No findings in this category.'}
        </p>
      )}
      <div className={cx('space-y-3', compact && 'max-h-[calc(100vh-14rem)] overflow-y-auto pr-1')}>
        {list.map((f) => (
          <FindingCard key={f.id} f={f} onOpen={open} />
        ))}
      </div>
    </div>
  );
}

export function StatusBanner({ v, empty }: { v: ValidationResult; empty: boolean }) {
  if (empty)
    return (
      <div className="rounded-lg border-2 border-ink bg-white p-4">
        <p className="text-2xl font-bold">Nothing to check yet</p>
        <p className="font-semibold">Add zones, devices and conduits to run the pre-flight checks.</p>
      </div>
    );
  return v.approved ? (
    <div role="status" className="flex items-center gap-4 rounded-lg border-2 border-ink bg-go p-4 text-white">
      <CheckCircle2 size={44} className="shrink-0" />
      <div>
        <p className="text-2xl font-bold">Clear to connect</p>
        <p className="font-semibold">
          No blocking faults. {v.counts.warning} warning{v.counts.warning === 1 ? '' : 's'} to review.
        </p>
      </div>
    </div>
  ) : (
    <div role="alert" className="flex items-center gap-4 rounded-lg border-2 border-ink bg-alarm p-4 text-white">
      <ShieldAlert size={44} className="shrink-0" />
      <div>
        <p className="text-2xl font-bold">Do not connect cables yet</p>
        <p className="font-semibold">
          {v.counts.error} blocking fault{v.counts.error === 1 ? '' : 's'}, {v.counts.warning} warning{v.counts.warning === 1 ? '' : 's'}.
        </p>
      </div>
    </div>
  );
}

export function Dashboard({ v }: { v: ValidationResult }) {
  const empty = useStore((s) => s.project.zones.length === 0);
  return (
    <div className="space-y-4">
      <StatusBanner v={v} empty={empty} />
      <FindingsList v={v} />
    </div>
  );
}

