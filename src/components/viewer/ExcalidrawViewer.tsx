import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  BinaryFiles,
  AppState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { toast } from "sonner";
import { invoke } from "@/lib/ipc";
import { dispatch } from "@/stores/eventBus";
import { useSettingsStore } from "@/stores/settingsStore";

interface ExcalidrawViewerProps {
  tabId: string;
  filePath: string;
  content: string;
}

function parseScene(content: string): ExcalidrawInitialDataState | null {
  if (!content.trim()) return null;
  try {
    const data = JSON.parse(content);
    return {
      elements: data.elements ?? [],
      appState: data.appState ?? {},
      files: data.files ?? {},
      scrollToContent: true,
    };
  } catch {
    return null;
  }
}

export function ExcalidrawViewer({
  tabId,
  filePath,
  content,
}: ExcalidrawViewerProps) {
  const mode = useSettingsStore((s) => s.mode);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const savedContentRef = useRef(content);
  const dirtyRef = useRef(false);
  const [initialData] = useState(() => parseScene(content));
  const [parseError] = useState(() => {
    if (!content.trim()) return null;
    try {
      JSON.parse(content);
      return null;
    } catch (e) {
      return String(e);
    }
  });

  function serializeCurrent(
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ): string {
    return serializeAsJSON(elements, appState, files, "local");
  }

  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      const serialized = serializeCurrent(elements, appState, files);
      const nextDirty = serialized !== savedContentRef.current;
      if (nextDirty !== dirtyRef.current) {
        dirtyRef.current = nextDirty;
        dispatch({ type: "tab-set-dirty", tabId, dirty: nextDirty });
      }
    },
    [tabId],
  );

  const handleSave = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();
    const serialized = serializeCurrent(elements, appState, files);
    try {
      const result = await invoke<{ ok: boolean; error?: string }>(
        "write_file",
        { path: filePath, content: serialized },
      );
      if (result.ok) {
        savedContentRef.current = serialized;
        dirtyRef.current = false;
        dispatch({ type: "tab-set-dirty", tabId, dirty: false });
        toast.success("Drawing saved");
      } else {
        toast.error(result.error ?? "Failed to save drawing");
      }
    } catch {
      toast.error("Failed to save drawing");
    }
  }, [filePath, tabId]);

  // Keep savedContentRef in sync when the file is reloaded externally from
  // disk (via the useFileContent watcher). Only sync in when the editor is
  // clean — otherwise we would clobber the user's unsaved edits.
  useEffect(() => {
    if (dirtyRef.current) return;
    savedContentRef.current = content;
    const api = apiRef.current;
    if (!api) return;
    const parsed = parseScene(content);
    if (!parsed) return;
    api.updateScene({
      elements: (parsed.elements ?? []) as OrderedExcalidrawElement[],
    });
  }, [content]);

  // Ctrl/Cmd+S save shortcut — scoped to the Excalidraw canvas container so
  // it only fires when the user is actually interacting with this tab.
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
      }
    }
    el.addEventListener("keydown", onKeyDown, true);
    return () => el.removeEventListener("keydown", onKeyDown, true);
  }, [handleSave]);

  if (parseError) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive text-sm p-4">
        Invalid Excalidraw file: {parseError}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0 min-w-0">
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        theme={mode === "dark" ? "dark" : "light"}
      />
    </div>
  );
}
