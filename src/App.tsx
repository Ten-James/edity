import { AppProvider } from "@/contexts/AppContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import "./App.css";

function App() {
  return (
    <AppProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <MainContent />
      </div>
    </AppProvider>
  );
}

export default App;
