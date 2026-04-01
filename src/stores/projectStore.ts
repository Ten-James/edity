import { create } from "zustand";
import { dispatch, subscribe } from "./eventBus";
import { invoke } from "@/lib/ipc";
import { toast } from "sonner";
import type { Project, EdityConfig } from "@shared/types/project";

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  edityConfigs: Map<string, EdityConfig | null>;

  _init: () => Promise<void>;
  _loadConfig: (project: Project) => Promise<void>;
  _saveConfig: (config: EdityConfig, projectPath: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  edityConfigs: new Map(),

  _init: async () => {
    try {
      const projects = await invoke<Project[]>("get_projects");
      set({ projects });
      for (const p of projects) {
        get()._loadConfig(p);
      }
    } catch {
      /* ignore */
    }
  },

  _loadConfig: async (project) => {
    try {
      const config = await invoke<EdityConfig | null>("read_edity_config", {
        projectPath: project.path,
      });
      set((s) => {
        const next = new Map(s.edityConfigs);
        next.set(project.id, config);
        return { edityConfigs: next };
      });
    } catch {
      set((s) => {
        const next = new Map(s.edityConfigs);
        next.set(project.id, null);
        return { edityConfigs: next };
      });
    }
  },

  _saveConfig: async (config, projectPath) => {
    try {
      await invoke("write_edity_config", { projectPath, config });
      const project = get().projects.find((p) => p.path === projectPath);
      if (project) {
        set((s) => {
          const next = new Map(s.edityConfigs);
          next.set(project.id, config);
          return { edityConfigs: next };
        });
        dispatch({
          type: "project-config-saved",
          projectId: project.id,
          config,
        });
      }
      toast.success("Configuration saved");
    } catch {
      toast.error("Failed to save configuration");
    }
  },
}));

// Event listener
subscribe((event) => {
  switch (event.type) {
    case "project-switch": {
      const project = useProjectStore
        .getState()
        .projects.find((p) => p.id === event.projectId);
      if (project) {
        useProjectStore.setState({ activeProject: project });
      }
      break;
    }

    case "project-add": {
      (async () => {
        try {
          const result = await invoke<{
            canceled: boolean;
            filePaths: string[];
          }>("show-open-dialog", { properties: ["openDirectory"] });
          if (result.canceled || result.filePaths.length === 0) return;

          const selected = result.filePaths[0];
          const folderName =
            selected.split("/").filter(Boolean).pop() ?? "Project";
          const project = await invoke<Project>("add_project", {
            name: folderName,
            path: selected,
          });

          useProjectStore.setState((s) => ({
            projects: [...s.projects, project],
            activeProject: project,
          }));
          useProjectStore.getState()._loadConfig(project);
          // Notify other stores (layoutStore will create panes)
          dispatch({ type: "project-switch", projectId: project.id });
        } catch {
          /* ignore */
        }
      })();
      break;
    }

    case "project-remove": {
      (async () => {
        try {
          await invoke("remove_project", { id: event.projectId });
          useProjectStore.setState((s) => {
            const projects = s.projects.filter((p) => p.id !== event.projectId);
            const activeProject =
              s.activeProject?.id === event.projectId
                ? (projects[0] ?? null)
                : s.activeProject;
            const edityConfigs = new Map(s.edityConfigs);
            edityConfigs.delete(event.projectId);
            return { projects, activeProject, edityConfigs };
          });
        } catch {
          /* ignore */
        }
      })();
      break;
    }

    case "project-reorder": {
      useProjectStore.setState((s) => {
        const next = [...s.projects];
        const [moved] = next.splice(event.fromIndex, 1);
        next.splice(event.toIndex, 0, moved);
        invoke("reorder_projects", { ids: next.map((p) => p.id) }).catch(
          () => {},
        );
        return { projects: next };
      });
      break;
    }
  }
});
