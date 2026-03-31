import { AppProvider } from "@/contexts/AppContext";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { CommandPalette } from "@/components/CommandPalette";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useCommands } from "@/hooks/useCommands";
import "./App.css";

function AppShell() {
  const { paletteOpen, setPaletteOpen, settingsOpen, setSettingsOpen, commandCtx } = useCommands();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
        <MainContent />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commandCtx={commandCtx} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

export default App;
