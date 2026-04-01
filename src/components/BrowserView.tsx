import { useEffect, useRef, useState, useCallback } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconRefresh,
  IconCode,
  IconCopy,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconReload,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppContext } from "@/contexts/AppContext";

interface BrowserViewProps {
  tabId: string;
  isActive: boolean;
  initialUrl: string;
}

interface WebviewElement {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  loadURL: (url: string) => void;
  openDevTools: () => void;
  getURL: () => string;
  addEventListener: (event: string, handler: (e: unknown) => void) => void;
  removeEventListener: (event: string, handler: (e: unknown) => void) => void;
}

export function BrowserView({ tabId, isActive, initialUrl }: BrowserViewProps) {
  const webviewRef = useRef<HTMLElement>(null);
  const [urlInput, setUrlInput] = useState(initialUrl);
  const { updateTabTitle, updateBrowserUrl } = useAppContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const getWebview = useCallback((): WebviewElement | null => {
    return webviewRef.current as unknown as WebviewElement | null;
  }, []);

  useEffect(() => {
    const webview = getWebview();
    if (!webview) return;

    const handleNavigate = (e: unknown) => {
      const url = (e as { url: string }).url;
      if (url) {
        setUrlInput(url);
        updateBrowserUrl(tabId, url);
      }
    };

    const handleTitleUpdate = (e: unknown) => {
      const title = (e as { title: string }).title;
      if (title) {
        updateTabTitle(tabId, title);
      }
    };

    const handleContextMenu = (e: unknown) => {
      const params = (e as { params: { x: number; y: number } }).params;
      const el = webviewRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setMenuPos({ x: rect.left + params.x, y: rect.top + params.y });
        setMenuOpen(true);
      }
    };

    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    webview.addEventListener("page-title-updated", handleTitleUpdate);
    webview.addEventListener("context-menu", handleContextMenu);

    return () => {
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      webview.removeEventListener("page-title-updated", handleTitleUpdate);
      webview.removeEventListener("context-menu", handleContextMenu);
    };
  }, [tabId, updateTabTitle, updateBrowserUrl, getWebview]);

  const navigate = useCallback(
    (url: string) => {
      let normalized = url.trim();
      if (
        !normalized.startsWith("http://") &&
        !normalized.startsWith("https://")
      ) {
        normalized = `https://${normalized}`;
      }
      setUrlInput(normalized);
      getWebview()?.loadURL(normalized);
    },
    [getWebview],
  );

  const goBack = useCallback(() => getWebview()?.goBack(), [getWebview]);
  const goForward = useCallback(() => getWebview()?.goForward(), [getWebview]);
  const reload = useCallback(() => getWebview()?.reload(), [getWebview]);

  const openDevTools = useCallback(() => {
    getWebview()?.openDevTools();
  }, [getWebview]);

  const copyUrl = useCallback(() => {
    const webview = getWebview();
    if (webview) navigator.clipboard.writeText(webview.getURL());
  }, [getWebview]);

  return (
    <div
      className="absolute inset-0 flex flex-col bg-background"
      style={{ display: isActive ? "flex" : "none" }}
    >
      <div className="flex h-10 items-center gap-1 px-2 border-b border-border bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={goBack}
        >
          <IconArrowLeft size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={goForward}
        >
          <IconArrowRight size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={reload}
        >
          <IconRefresh size={14} />
        </Button>
        <Input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate(urlInput);
          }}
          className="flex-1 h-7 text-xs"
          placeholder="Enter URL..."
        />
      </div>

      <webview
        ref={webviewRef as React.RefObject<never>}
        src={initialUrl}
        style={{ flex: 1 }}
      />

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <span
            className="fixed w-0 h-0"
            style={{ left: menuPos.x, top: menuPos.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          <DropdownMenuItem onClick={goBack}>
            <IconArrowBackUp size={14} />
            Back
          </DropdownMenuItem>
          <DropdownMenuItem onClick={goForward}>
            <IconArrowForwardUp size={14} />
            Forward
          </DropdownMenuItem>
          <DropdownMenuItem onClick={reload}>
            <IconReload size={14} />
            Reload
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copyUrl}>
            <IconCopy size={14} />
            Copy URL
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openDevTools}>
            <IconCode size={14} />
            Open DevTools
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
