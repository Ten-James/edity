import ReactDOM from "react-dom/client";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "sonner";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    <TooltipProvider>
      <App />
    </TooltipProvider>
    <Toaster
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex items-center gap-2 px-3 py-2.5 text-xs bg-popover text-popover-foreground border border-border ring-1 ring-foreground/10 w-full",
          title: "text-xs font-medium",
          description: "text-xs text-muted-foreground",
          success: "text-green-500 [&>svg]:text-green-500",
          error: "text-red-500 [&>svg]:text-red-500",
          info: "text-primary [&>svg]:text-primary",
          warning: "text-orange-500 [&>svg]:text-orange-500",
        },
      }}
    />
  </ThemeProvider>,
);
