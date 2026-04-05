import { useEffect, useState, useRef, useCallback } from "react";
import { invoke, listen } from "@/lib/ipc";

export type FileContent =
  | { type: "Text"; content: string; size: number }
  | { type: "Image"; url: string; mime: string; size: number }
  | { type: "Binary"; size: number }
  | { type: "TooLarge"; size: number };

export function useFileContent(tabId: string, filePath: string) {
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedRef = useRef(false);
  const bustRef = useRef(0);

  const fetchContent = useCallback(async () => {
    try {
      if (!hasFetchedRef.current) {
        setLoading(true);
      }
      setError(null);
      const result = await invoke<FileContent>("read_file_content", {
        path: filePath,
      });
      if (result.type === "Image") {
        bustRef.current += 1;
        result.url = `${result.url}?v=${bustRef.current}`;
      }
      setContent(result);
    } catch (e) {
      setError(String(e));
    } finally {
      hasFetchedRef.current = true;
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    hasFetchedRef.current = false;
    bustRef.current = 0;
    fetchContent();
  }, [fetchContent]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    async function setup() {
      try {
        await invoke("watch_file", { tabId, path: filePath });
      } catch {
        // File may not exist yet
      }

      if (cancelled) return;

      unlisten = await listen(`file-changed-${tabId}`, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          fetchContent();
        }, 300);
      });
    }

    setup();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      invoke("unwatch_file", { tabId }).catch(() => {});
    };
  }, [tabId, filePath, fetchContent]);

  return { content, loading, error };
}
