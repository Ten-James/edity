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

interface ContextMenuState {
  x: number;
  y: number;
}

export function BrowserView({ tabId, isActive, initialUrl }: BrowserViewProps) {
  const webviewRef = useRef<HTMLElement>(null);
  const [urlInput, setUrlInput] = useState(initialUrl);
  const { updateTabTitle, updateBrowserUrl } = useAppContext();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(
    null,
  );
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const getWebview = useCallback((): WebviewElement | null => {
    return webviewRef.current as unknown as WebviewElement | null;
  }, []);

  // Set up webview event listeners
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
      // Get webview's bounding rect to position menu relative to container
      const el = webviewRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setContextMenu({
          x: rect.left + params.x,
          y: rect.top + params.y,
        });
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

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

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
  const goForward = useCallback(
    () => getWebview()?.goForward(),
    [getWebview],
  );
  const reload = useCallback(() => getWebview()?.reload(), [getWebview]);

  const openDevTools = useCallback(() => {
    getWebview()?.openDevTools();
    setContextMenu(null);
  }, [getWebview]);

  const copyUrl = useCallback(() => {
    const webview = getWebview();
    if (webview) {
      navigator.clipboard.writeText(webview.getURL());
    }
    setContextMenu(null);
  }, [getWebview]);

  return (
    <div
      className="absolute inset-0 flex flex-col bg-background"
      style={{ display: isActive ? "flex" : "none" }}
    >
      {/* Browser toolbar */}
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

      {/* Chromium webview */}
      <webview
        ref={webviewRef as React.RefObject<never>}
        src={initialUrl}
        style={{ flex: 1 }}
      />

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              goBack();
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            <IconArrowBackUp size={14} />
            Back
          </button>
          <button
            onClick={() => {
              goForward();
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            <IconArrowForwardUp size={14} />
            Forward
          </button>
          <button
            onClick={() => {
              reload();
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            <IconReload size={14} />
            Reload
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={copyUrl}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            <IconCopy size={14} />
            Copy URL
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={openDevTools}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            <IconCode size={14} />
            Open DevTools
          </button>
        </div>
      )}
    </div>
  );
}
