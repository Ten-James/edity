import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dispatch } from "@/stores/eventBus";
import { useProjectStore } from "@/stores/projectStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { findLeafByPaneId, firstLeaf } from "@/lib/paneTree";
import { setPendingReveal } from "@/lib/editor-reveal";
import {
  IconFile,
  IconSearch,
  IconListDetails,
  IconBinaryTree,
} from "@tabler/icons-react";
import {
  searchFiles,
  searchContent,
  cancelContentSearch,
  searchWorkspaceSymbols,
  searchBufferSymbols,
} from "./modes";
import type {
  FuzzyMode,
  FuzzyResult,
  FuzzyFileResult,
  FuzzyContentResult,
  FuzzySymbolResult,
} from "./types";

const MODES: Array<{
  id: FuzzyMode;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  placeholder: string;
}> = [
  {
    id: "files",
    label: "Files",
    shortcut: "Cmd+P",
    icon: IconFile,
    placeholder: "Search files by name…",
  },
  {
    id: "content",
    label: "Content",
    shortcut: "Cmd+F",
    icon: IconSearch,
    placeholder: "Grep across all files…",
  },
  {
    id: "symbols",
    label: "Symbols",
    shortcut: "@",
    icon: IconListDetails,
    placeholder: "Workspace symbol via LSP…",
  },
  {
    id: "buffer",
    label: "Buffer",
    shortcut: "#",
    icon: IconBinaryTree,
    placeholder: "Symbols in current file…",
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Persist the last used mode across dialog invocations so repeat Cmd+Shift+P
// uses the one the user was last in.
let lastMode: FuzzyMode = "files";

function getActiveFilePath(): string | null {
  const proj = useProjectStore.getState().activeProject;
  if (!proj) return null;
  const state = useLayoutStore.getState().projectPanes.get(proj.id);
  if (!state) return null;
  const leaf =
    findLeafByPaneId(state.root, state.focusedPaneId) ?? firstLeaf(state.root);
  if (!leaf) return null;
  const activeTabId = leaf.pane.activeTabId;
  const tab = leaf.pane.tabs.find((t) => t.id === activeTabId);
  if (!tab || tab.type !== "file") return null;
  return tab.filePath;
}

export function FuzzyFinder({ open, onOpenChange }: Props) {
  const activeProject = useProjectStore((s) => s.activeProject);
  const [mode, setMode] = useState<FuzzyMode>(lastMode);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FuzzyResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const latestQueryRef = useRef("");

  // Reset state when the dialog opens; keep the last mode.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      // Focus the input after Radix commits the content to the DOM.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      cancelContentSearch();
    }
  }, [open]);

  useEffect(() => {
    lastMode = mode;
    setQuery("");
    setResults([]);
    setSelectedIdx(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [mode]);

  // Run the search whenever query or mode changes, debounced.
  useEffect(() => {
    if (!open || !activeProject) return;
    latestQueryRef.current = query;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        let hits: FuzzyResult[] = [];
        switch (mode) {
          case "files":
            hits = await searchFiles(activeProject.path, query);
            break;
          case "content":
            hits = await searchContent(activeProject.path, query);
            break;
          case "symbols":
            hits = await searchWorkspaceSymbols(
              activeProject.id,
              activeProject.path,
              query,
            );
            break;
          case "buffer": {
            const file = getActiveFilePath();
            if (file) {
              hits = await searchBufferSymbols(activeProject.id, file, query);
            }
            break;
          }
        }
        // Ignore stale responses if the user kept typing.
        if (latestQueryRef.current !== query) return;
        setResults(hits);
        setSelectedIdx(0);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [query, mode, open, activeProject]);

  // Scroll the active result into view.
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-idx="${selectedIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx, results]);

  function openResult(result: FuzzyResult) {
    if (result.kind === "file") {
      dispatch({ type: "tab-open-file", filePath: result.path });
    } else if (result.kind === "content" || result.kind === "symbol") {
      // Pre-register the reveal so new mounts pick it up; also dispatch an
      // event so an already-open editor reacts. One of the two wins.
      setPendingReveal(result.path, result.line, result.column);
      dispatch({ type: "tab-open-file", filePath: result.path });
      dispatch({
        type: "editor-reveal-position",
        filePath: result.path,
        line: result.line,
        column: result.column,
      });
    }
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[selectedIdx];
      if (r) openResult(r);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const curIdx = MODES.findIndex((m) => m.id === mode);
      const next = MODES[(curIdx + (e.shiftKey ? -1 : 1) + MODES.length) % MODES.length];
      setMode(next.id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[20%] translate-y-0 sm:max-w-2xl p-0 gap-0"
        showCloseButton={false}
      >
        {/* Mode tabs */}
        <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
                mode === m.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <m.icon size={12} />
              <span>{m.label}</span>
            </button>
          ))}
          <div className="ml-auto text-[10px] text-muted-foreground">
            Tab to switch · Enter to open · Esc to close
          </div>
        </div>

        {/* Search input */}
        <div className="px-2 py-2 border-b border-border/40">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={MODES.find((m) => m.id === mode)?.placeholder}
            className="h-8 text-xs"
          />
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          className="max-h-[60vh] min-h-[10rem] overflow-y-auto"
        >
          {loading && results.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {query ? "No results" : renderEmptyHint(mode)}
            </div>
          ) : (
            results.map((r, i) => (
              <ResultRow
                key={`${r.kind}-${i}`}
                result={r}
                active={i === selectedIdx}
                index={i}
                onHover={() => setSelectedIdx(i)}
                onClick={() => openResult(r)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function renderEmptyHint(mode: FuzzyMode): string {
  switch (mode) {
    case "files":
      return "Start typing a file name…";
    case "content":
      return "Type to grep across all files…";
    case "symbols":
      return "Type to search workspace symbols (requires running LSP)…";
    case "buffer":
      return "Type to filter symbols in the active file…";
  }
}

interface ResultRowProps {
  result: FuzzyResult;
  active: boolean;
  index: number;
  onHover: () => void;
  onClick: () => void;
}

function ResultRow({ result, active, index, onHover, onClick }: ResultRowProps) {
  const rowClass = cn(
    "cursor-pointer border-l-2 px-3 py-1.5 text-xs transition-colors",
    active
      ? "border-primary bg-accent/50 text-foreground"
      : "border-transparent text-muted-foreground hover:bg-accent/30",
  );
  return (
    <div
      data-idx={index}
      className={rowClass}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      {result.kind === "file" && <FileResultRow result={result} />}
      {result.kind === "content" && <ContentResultRow result={result} />}
      {result.kind === "symbol" && <SymbolResultRow result={result} />}
    </div>
  );
}

function highlightIndices(text: string, indices: number[]): React.ReactNode {
  if (!indices.length) return text;
  const parts: React.ReactNode[] = [];
  const set = new Set(indices);
  let buf = "";
  let inMatch = false;
  let matchBuf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (set.has(i)) {
      if (!inMatch && buf) {
        parts.push(buf);
        buf = "";
      }
      inMatch = true;
      matchBuf += ch;
    } else {
      if (inMatch) {
        parts.push(
          <span key={`m-${i}`} className="font-semibold text-primary">
            {matchBuf}
          </span>,
        );
        matchBuf = "";
        inMatch = false;
      }
      buf += ch;
    }
  }
  if (matchBuf) {
    parts.push(
      <span key="m-last" className="font-semibold text-primary">
        {matchBuf}
      </span>,
    );
  }
  if (buf) parts.push(buf);
  return parts;
}

function FileResultRow({ result }: { result: FuzzyFileResult }) {
  const basename = result.relPath.split("/").pop() ?? result.relPath;
  const dir = result.relPath.slice(0, result.relPath.length - basename.length);
  return (
    <div className="flex items-baseline gap-2">
      <IconFile size={12} className="shrink-0" />
      <span className="font-medium">
        {highlightIndices(basename, result.matchIndices.map((i) => i - dir.length).filter((i) => i >= 0))}
      </span>
      <span className="truncate text-[10px] opacity-70">{dir}</span>
    </div>
  );
}

function ContentResultRow({ result }: { result: FuzzyContentResult }) {
  const preview = result.preview.trim();
  const maxLen = 120;
  const displayed = preview.length > maxLen ? preview.slice(0, maxLen) + "…" : preview;
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
        <IconSearch size={12} className="shrink-0" />
        <span className="truncate">{result.relPath}</span>
        <span className="text-[10px] opacity-60">:{result.line}:{result.column}</span>
      </div>
      <div className="ml-5 mt-0.5 truncate font-mono text-[11px] opacity-80">
        {highlightContentMatches(displayed, result.matchRanges)}
      </div>
    </div>
  );
}

function highlightContentMatches(
  text: string,
  ranges: Array<{ start: number; end: number }>,
): React.ReactNode {
  if (!ranges.length) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(
      <span key={`r-${r.start}`} className="font-semibold text-primary">
        {text.slice(r.start, r.end)}
      </span>,
    );
    cursor = r.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function SymbolResultRow({ result }: { result: FuzzySymbolResult }) {
  return (
    <div className="flex items-baseline gap-2">
      <IconListDetails size={12} className="shrink-0" />
      <span className="font-medium">{result.name}</span>
      {result.containerName && (
        <span className="text-[10px] opacity-60">{result.containerName}</span>
      )}
      <span className="ml-auto truncate text-[10px] opacity-60">
        {result.relPath}:{result.line}
      </span>
    </div>
  );
}
