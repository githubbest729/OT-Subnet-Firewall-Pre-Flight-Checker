import { create } from 'zustand';
import type { PurdueLevel, NodeType } from './lib/rules';
import { LEVEL_META } from './lib/rules';
import { db, demoProject, newProject, uid, type Conduit, type NetNode, type Project, type Zone } from './lib/schema';

export type Tab = 'calc' | 'topology' | 'ports' | 'dashboard' | 'export';
export type EditorSection = 'zones' | 'nodes' | 'conduits';

interface ProjectStub {
  id: string;
  name: string;
  updatedAt: number;
}

interface Store {
  ready: boolean;
  saveState: 'saved' | 'saving' | 'memory-only';
  project: Project;
  projects: ProjectStub[];

  calc: { it: string; ot: string };
  setCalc: (k: 'it' | 'ot', v: string) => void;
  tab: Tab;
  section: EditorSection;
  focusId: string | null;
  setTab: (t: Tab) => void;
  focus: (section: EditorSection, id: string) => void;

  init: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  createProject: () => Promise<void>;
  loadDemo: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  patchProject: (patch: Partial<Pick<Project, 'name' | 'site' | 'engineer'>>) => void;
  addZone: (level: PurdueLevel) => string;
  updateZone: (id: string, patch: Partial<Zone>) => void;
  removeZone: (id: string) => void;
  addNode: (zoneId: string, type?: NodeType) => string;
  updateNode: (id: string, patch: Partial<NetNode>) => void;
  removeNode: (id: string) => void;
  addConduit: (fromZoneId?: string, toZoneId?: string) => string;
  updateConduit: (id: string, patch: Partial<Conduit>) => void;
  removeConduit: (id: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>()((set, get) => {
  const persist = () => {
    set({ saveState: 'saving' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const p = get().project;
        await db.projects.put(p);
        await db.meta.put({ key: 'lastProject', value: p.id });
        set({ saveState: 'saved', projects: await listProjects() });
      } catch {
        set({ saveState: 'memory-only' });
      }
    }, 250);
  };

  const listProjects = async (): Promise<ProjectStub[]> =>
    (await db.projects.orderBy('updatedAt').reverse().toArray()).map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));

  const mutate = (recipe: (p: Project) => void) => {
    const p = structuredClone(get().project);
    recipe(p);
    p.updatedAt = Date.now();
    set({ project: p });
    persist();
  };

  const adopt = async (p: Project) => {
    set({ project: p, tab: 'topology', section: 'zones', focusId: null });
    try {
      await db.projects.put(p);
      await db.meta.put({ key: 'lastProject', value: p.id });
      set({ projects: await listProjects(), saveState: 'saved' });
    } catch {
      set({ saveState: 'memory-only' });
    }
  };

  return {
    ready: false,
    saveState: 'saved',
    project: newProject(),
    projects: [],
    calc: { it: '192.168.20.0/22', ot: '192.168.20.0/24' },
    setCalc: (k, v) => set((st) => ({ calc: { ...st.calc, [k]: v } })),
    tab: 'topology',
    section: 'zones',
    focusId: null,
    setTab: (tab) => set({ tab }),
    focus: (section, id) => set({ tab: 'topology', section, focusId: id }),

    init: async () => {
      try {
        if ((await db.projects.count()) === 0) await db.projects.put(demoProject());
        const last = await db.meta.get('lastProject');
        const p = (last && (await db.projects.get(last.value))) || (await db.projects.orderBy('updatedAt').last());
        set({ project: p ?? demoProject(), projects: await listProjects(), ready: true, saveState: 'saved' });
      } catch {
        set({ project: demoProject(), ready: true, saveState: 'memory-only' });
      }
    },
    openProject: async (id) => {
      try {
        const p = await db.projects.get(id);
        if (p) await adopt(p);
      } catch {
        /* keep current project */
      }
    },
    createProject: () => adopt(newProject()),
    loadDemo: () => adopt(demoProject()),
    deleteProject: async (id) => {
      try {
        await db.projects.delete(id);
        const rest = await listProjects();
        if (get().project.id === id) await adopt(rest.length ? (await db.projects.get(rest[0].id))! : newProject());
        else set({ projects: rest });
      } catch {
        /* ignore */
      }
    },

    patchProject: (patch) => mutate((p) => Object.assign(p, patch)),

    addZone: (level) => {
      const id = uid('zn');
      mutate((p) =>
        p.zones.push({
          id,
          name: (LEVEL_META.get(level)?.label ?? 'Zone').replace(/^Level [\d.]+ - /, ''),
          level,
          slTarget: level >= 4 ? 2 : 3,
          subnets: [],
        }),
      );
      return id;
    },
    updateZone: (id, patch) => mutate((p) => void Object.assign(p.zones.find((z) => z.id === id) ?? {}, patch)),
    removeZone: (id) =>
      mutate((p) => {
        const gone = new Set(p.nodes.filter((n) => n.zoneId === id).map((n) => n.id));
        p.zones = p.zones.filter((z) => z.id !== id);
        p.nodes = p.nodes.filter((n) => n.zoneId !== id);
        p.conduits = p.conduits
          .filter((c) => c.fromZoneId !== id && c.toZoneId !== id)
          .map((c) => (c.firewallId && gone.has(c.firewallId) ? { ...c, firewallId: undefined } : c));
      }),

    addNode: (zoneId, type = 'server') => {
      const id = uid('nd');
      mutate((p) => p.nodes.push({ id, zoneId, name: `New ${type}`, type, ip: '', hosts: [] }));
      return id;
    },
    updateNode: (id, patch) => mutate((p) => void Object.assign(p.nodes.find((n) => n.id === id) ?? {}, patch)),
    removeNode: (id) =>
      mutate((p) => {
        p.nodes = p.nodes.filter((n) => n.id !== id);
        for (const c of p.conduits) if (c.firewallId === id) c.firewallId = undefined;
      }),

    addConduit: (fromZoneId, toZoneId) => {
      const id = uid('cd');
      mutate((p) =>
        p.conduits.push({
          id,
          name: 'New conduit',
          fromZoneId: fromZoneId ?? p.zones[0]?.id ?? '',
          toZoneId: toZoneId ?? p.zones[1]?.id ?? p.zones[0]?.id ?? '',
          requiredServices: [],
          allowed: [],
        }),
      );
      return id;
    },
    updateConduit: (id, patch) => mutate((p) => void Object.assign(p.conduits.find((c) => c.id === id) ?? {}, patch)),
    removeConduit: (id) => mutate((p) => void (p.conduits = p.conduits.filter((c) => c.id !== id))),
  };
});
