import { AlertOctagon, CheckCircle2, ClipboardCheck, Calculator as CalcIcon, FileDown, FolderOpen, Network, Plug, Plus, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Calculator } from './components/Calculator';
import { Dashboard, FindingsList } from './components/Dashboard';
import { ExportView } from './components/ExportView';
import { Ports } from './components/Ports';
import { Topology } from './components/Topology';
import { Btn, DeleteBtn, cx } from './components/ui';
import { validateProject } from './lib/validate';
import { useStore, type Tab } from './store';

const TABS: { id: Tab; label: string; icon: typeof CalcIcon }[] = [
  { id: 'calc', label: 'Subnets', icon: CalcIcon },
  { id: 'topology', label: 'Topology', icon: Network },
  { id: 'ports', label: 'Ports', icon: Plug },
  { id: 'dashboard', label: 'Pre-flight', icon: ClipboardCheck },
  { id: 'export', label: 'Export', icon: FileDown },
];

function ProjectsSheet({ onClose }: { onClose: () => void }) {
  const { projects, project, openProject, createProject, loadDemo, deleteProject } = useStore();
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center bg-ink/70 p-4" role="dialog" aria-modal="true" aria-label="Projects" onClick={onClose}>
      <div className="mt-8 w-full max-w-xl rounded-lg border-2 border-ink bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Projects on this device</h2>
          <button type="button" aria-label="Close" className="grid h-12 w-12 place-items-center rounded-md border-2 border-ink" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => void createProject().then(onClose)}>
            <Plus size={18} /> New project
          </Btn>
          <Btn onClick={() => void loadDemo().then(onClose)}>Load demo</Btn>
        </div>
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className={cx('flex items-center gap-2 rounded-md border-2 p-2', p.id === project.id ? 'border-ink bg-signal/30' : 'border-steel-dark')}>
              <button type="button" className="min-h-12 flex-1 text-left" onClick={() => void openProject(p.id).then(onClose)}>
                <span className="block font-bold">{p.name || 'Untitled'}</span>
                <span className="text-sm">{new Date(p.updatedAt).toLocaleString()}</span>
              </button>
              {p.id !== project.id && <DeleteBtn label="Delete" onConfirm={() => void deleteProject(p.id)} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  const { ready, init, project, tab, setTab, saveState } = useStore();
  const [sheet, setSheet] = useState(false);
  const v = useMemo(() => validateProject(project), [project]);

  useEffect(() => {
    void init();
    void navigator.storage?.persist?.(); // ask the browser not to evict field data
  }, [init]);

  if (!ready) return <div className="grid h-screen place-items-center text-xl font-bold">Loading...</div>;

  const empty = project.zones.length === 0;
  const portErrors = v.findings.filter((f) => f.category === 'port' && f.severity === 'error').length;
  const badge = (id: Tab) => (id === 'dashboard' ? v.counts.error : id === 'ports' ? portErrors : 0);

  return (
    <div className="min-h-screen pb-24">
      <header className="no-print sticky top-0 z-40 bg-ink text-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-signal text-ink">
            <ShieldCheck size={30} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight">OT subnet and firewall pre-flight</p>
            <button type="button" onClick={() => setSheet(true)} className="flex min-h-12 max-w-full items-center gap-2 text-left text-sm font-semibold text-white/90 underline-offset-4 hover:underline">
              <FolderOpen size={18} className="shrink-0" />
              <span className="truncate">{project.name || 'Untitled'}</span>
              <span className={cx('shrink-0 rounded px-1.5 text-xs font-bold', saveState === 'memory-only' ? 'bg-alarm text-white' : 'bg-white/20')}>
                {saveState === 'saved' ? 'Saved on device' : saveState === 'saving' ? 'Saving' : 'Not saved: storage blocked'}
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setTab('dashboard')}
            aria-label="Open pre-flight results"
            className={cx(
              'flex min-h-14 items-center gap-2 rounded-md border-2 border-white px-4 font-bold',
              empty ? 'bg-white/10 text-white' : v.approved ? 'bg-go text-white' : 'lamp-alarm bg-alarm text-white',
            )}
          >
            {empty ? (
              'No zones yet'
            ) : v.approved ? (
              <>
                <CheckCircle2 /> Clear to connect
              </>
            ) : (
              <>
                <AlertOctagon /> {v.counts.error} blocking
              </>
            )}
            {!empty && v.counts.warning > 0 && <span className="rounded bg-white px-1.5 text-sm text-ink">{v.counts.warning} warn</span>}
          </button>
        </div>
        <div className="hazard" />
      </header>

      <nav className="no-print sticky top-[calc(4.75rem+10px)] z-30 border-b-2 border-ink bg-steel" aria-label="Sections">
        <div className="mx-auto grid max-w-[1500px] grid-cols-5 gap-2 px-4 py-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const n = badge(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}
                className={cx(
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-ink px-1 text-sm font-bold sm:flex-row sm:gap-2 sm:text-base',
                  tab === t.id ? 'bg-signal' : 'bg-white',
                )}
              >
                <Icon size={22} />
                {t.label}
                {n > 0 && (
                  <span className="absolute -right-1 -top-2 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-alarm px-1 text-xs font-bold text-white">{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-[1500px] gap-4 p-4 xl:grid xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          {tab === 'calc' && <Calculator />}
          {tab === 'topology' && <Topology v={v} />}
          {tab === 'ports' && <Ports v={v} />}
          {tab === 'dashboard' && <Dashboard v={v} />}
          {tab === 'export' && <ExportView v={v} />}
        </div>
        {(tab === 'calc' || tab === 'topology' || tab === 'ports') && (
          <aside className="no-print mt-4 hidden xl:sticky xl:top-44 xl:mt-0 xl:block xl:self-start" aria-label="Live pre-flight results">
            <h2 className="mb-2 text-xl font-bold">Live results</h2>
            <FindingsList v={v} compact />
          </aside>
        )}
      </main>

      {sheet && <ProjectsSheet onClose={() => setSheet(false)} />}
    </div>
  );
}
