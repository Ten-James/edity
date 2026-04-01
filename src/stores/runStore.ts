import { create } from "zustand";
import { dispatch, subscribe } from "./eventBus";
import { invoke, listen } from "@/lib/ipc";
import { toast } from "sonner";
import { useProjectStore } from "./projectStore";
import { getDefaultRunCommand } from "@/lib/run-commands";

interface RunState {
  runningProjects: Map<string, Set<string>>;
  _exitListeners: Map<string, () => void>;
}

export const useRunStore = create<RunState>(() => ({
  runningProjects: new Map(),
  _exitListeners: new Map(),
}));

subscribe((event) => {
  switch (event.type) {
    case "run-start": {
      const proj = useProjectStore.getState().activeProject;
      if (!proj) break;
      const config = useProjectStore.getState().edityConfigs.get(proj.id) ?? null;
      const cmd = event.command ?? getDefaultRunCommand(config);
      if (!cmd) break;

      if (cmd.mode === "background") {
        const commandId = cmd.name;
        const key = `${proj.id}:${commandId}`;

        // Clean up previous listener
        useRunStore.getState()._exitListeners.get(key)?.();

        invoke("run_project_command", {
          projectId: proj.id,
          command: cmd.command,
          cwd: proj.path,
          commandId,
        }).then(() => {
          useRunStore.setState((s) => {
            const next = new Map(s.runningProjects);
            const set = new Set(next.get(proj.id) ?? []);
            set.add(commandId);
            next.set(proj.id, set);
            return { runningProjects: next };
          });
          toast.success(`Started: ${cmd.name}`);

          listen(`project-run-exit-${key}`, () => {
            useRunStore.setState((s) => {
              const next = new Map(s.runningProjects);
              const set = new Set(next.get(proj.id) ?? []);
              set.delete(commandId);
              if (set.size === 0) next.delete(proj.id);
              else next.set(proj.id, set);
              const listeners = new Map(s._exitListeners);
              listeners.delete(key);
              return { runningProjects: next, _exitListeners: listeners };
            });
          }).then((cleanup) => {
            useRunStore.setState((s) => {
              const listeners = new Map(s._exitListeners);
              listeners.set(key, cleanup);
              return { _exitListeners: listeners };
            });
          });
        });
      } else {
        dispatch({ type: "tab-create-terminal", initialCommand: cmd.command });
      }
      break;
    }

    case "run-stop": {
      const proj = useProjectStore.getState().activeProject;
      if (!proj) break;

      if (event.commandId) {
        const key = `${proj.id}:${event.commandId}`;
        useRunStore.getState()._exitListeners.get(key)?.();
        invoke("kill_project_command", { projectId: proj.id, commandId: event.commandId });
        useRunStore.setState((s) => {
          const next = new Map(s.runningProjects);
          const set = new Set(next.get(proj.id) ?? []);
          set.delete(event.commandId!);
          if (set.size === 0) next.delete(proj.id);
          else next.set(proj.id, set);
          const listeners = new Map(s._exitListeners);
          listeners.delete(key);
          return { runningProjects: next, _exitListeners: listeners };
        });
        toast.success(`Stopped: ${event.commandId}`);
      } else {
        const running = useRunStore.getState().runningProjects.get(proj.id);
        if (running) {
          for (const id of running) {
            useRunStore.getState()._exitListeners.get(`${proj.id}:${id}`)?.();
          }
        }
        invoke("kill_project_command", { projectId: proj.id });
        useRunStore.setState((s) => {
          const next = new Map(s.runningProjects);
          next.delete(proj.id);
          return { runningProjects: next };
        });
        toast.success("All processes stopped");
      }
      break;
    }
  }
});
