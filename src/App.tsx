import { useEffect } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { CommandPalette } from "@/components/CommandPalette";
import { SettingsDialog } from "@/components/SettingsDialog";
import { WorktreeDialog } from "@/components/WorktreeDialog";
import { FuzzyFinder } from "@/components/FuzzyFinder/FuzzyFinder";
import { useCommands } from "@/hooks/useCommands";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useGitStore } from "@/stores/gitStore";
import { useClaudeStore } from "@/stores/claudeStore";
import { dispatch } from "@/stores/eventBus";
import "@/stores/mcpStore"; // side-effect: registers MCP IPC listeners
import "@/stores/worktreeEffect"; // side-effect: handles worktree-create events
import "./App.css";

function AppShell() {
  const {
    paletteOpen,
    setPaletteOpen,
    settingsOpen,
    setSettingsOpen,
    worktreeOpen,
    setWorktreeOpen,
    fuzzyFinderOpen,
    setFuzzyFinderOpen,
  } = useCommands();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 w-screen overflow-hidden">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
        <MainContent />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <WorktreeDialog open={worktreeOpen} onOpenChange={setWorktreeOpen} />
      <FuzzyFinder open={fuzzyFinderOpen} onOpenChange={setFuzzyFinderOpen} />
    </div>
  );
}

function StoreInitializer() {
  useEffect(() => {
    useSettingsStore.getState()._loadFromDisk();
    useProjectStore
      .getState()
      ._init()
      .then(() => {
        const { projects } = useProjectStore.getState();
        const { settings } = useSettingsStore.getState();
        const defaultProject = settings.defaultProjectId
          ? projects.find((p) => p.id === settings.defaultProjectId)
          : null;
        const initial = defaultProject ?? projects[0] ?? null;
        if (initial) {
          dispatch({ type: "project-switch", projectId: initial.id });
        }
      });

    useGitStore.getState().startPolling();
    useClaudeStore.getState().startPolling();
    return () => {
      useGitStore.getState().stopPolling();
      useClaudeStore.getState().stopPolling();
    };
  }, []);
  return null;
}

function App() {
  return (
    <>
      <StoreInitializer />
      <AppShell />
    </>
  );
}

export default App;
