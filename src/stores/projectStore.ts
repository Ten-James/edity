import { create } from "zustand";
import { dispatch, subscribe } from "./eventBus";
import { invoke } from "@/lib/ipc";
import { toast } from "sonner";
import type { Project, EdityConfig } from "@shared/types/project";

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  /**
   * Horizontal stack of projects visible in MainContent.
   * Invariant: when non-empty, `activeProject.id` is always a member.
   * Ephemeral — not persisted across app restarts.
   */
  projectStack: string[];
  edityConfigs: Map<string, EdityConfig | null>;

  _init: () => Promise<void>;
  _loadConfig: (project: Project) => Promise<void>;
  _saveConfig: (config: EdityConfig, projectPath: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  projectStack: [],
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
      useProjectStore.setState((s) => {
        const project = s.projects.find((p) => p.id === event.projectId);
        if (!project) return s;
        // If project is already in the stack, just change focus and leave the
        // stack as-is. If not, collapse the stack to just this one project
        // (matches the "switch to project" mental model for non-stack clicks).
        const inStack = s.projectStack.includes(project.id);
        return {
          activeProject: project,
          projectStack: inStack ? s.projectStack : [project.id],
        };
      });
      break;
    }

    case "project-stack-add": {
      useProjectStore.setState((s) => {
        const project = s.projects.find((p) => p.id === event.projectId);
        if (!project) return s;
        const inStack = s.projectStack.includes(project.id);
        return {
          activeProject: project,
          projectStack: inStack
            ? s.projectStack
            : [...s.projectStack, project.id],
        };
      });
      break;
    }

    case "project-stack-remove": {
      useProjectStore.setState((s) => {
        const stack = s.projectStack;
        const idx = stack.indexOf(event.projectId);
        if (idx === -1 || stack.length <= 1) return s;
        const nextStack = [...stack.slice(0, idx), ...stack.slice(idx + 1)];
        // If the removed project was focused, shift focus to the neighbor on
        // the left; fall back to the one that took its place (right).
        let activeProject = s.activeProject;
        if (s.activeProject?.id === event.projectId) {
          const neighborId = nextStack[Math.max(0, idx - 1)];
          activeProject =
            s.projects.find((p) => p.id === neighborId) ?? activeProject;
        }
        return { projectStack: nextStack, activeProject };
      });
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
            projectStack: [project.id],
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
            const projectStack = s.projectStack.filter(
              (id) => id !== event.projectId,
            );
            let activeProject = s.activeProject;
            if (s.activeProject?.id === event.projectId) {
              const fallbackId = projectStack[0];
              activeProject =
                projects.find((p) => p.id === fallbackId) ??
                projects[0] ??
                null;
            }
            // Keep the invariant: if a project remains but stack is empty
            // (e.g., the removed project was the only one in the stack),
            // make sure the new activeProject is reflected in the stack.
            const finalStack =
              projectStack.length === 0 && activeProject
                ? [activeProject.id]
                : projectStack;
            const edityConfigs = new Map(s.edityConfigs);
            edityConfigs.delete(event.projectId);
            return {
              projects,
              activeProject,
              projectStack: finalStack,
              edityConfigs,
            };
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
