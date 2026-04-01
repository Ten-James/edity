import { useEffect } from "react";
import { AppProvider } from "@/contexts/AppContext";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { CommandPalette } from "@/components/CommandPalette";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useCommands } from "@/hooks/useCommands";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { dispatch } from "@/stores/eventBus";
import "./App.css";

function AppShell() {
  const { paletteOpen, setPaletteOpen, settingsOpen, setSettingsOpen } =
    useCommands();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
        <MainContent />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
  }, []);
  return null;
}

function App() {
  return (
    <AppProvider>
      <StoreInitializer />
      <AppShell />
    </AppProvider>
  );
}

export default App;
