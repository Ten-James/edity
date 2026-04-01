import { useState, useEffect, useRef } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import { MonacoEditor } from "./MonacoEditor";
import { Button } from "@/components/ui/button";
import { IconEye, IconCode } from "@tabler/icons-react";

interface MarkdownViewerProps {
  tabId: string;
  content: string;
  filePath: string;
}

export function MarkdownViewer({
  tabId,
  content,
  filePath,
}: MarkdownViewerProps) {
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    setMode((m) => (m === "preview" ? "edit" : "preview"));
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "v") {
        e.preventDefault();
        toggle();
      }
    }

    const el = containerRef.current;
    if (el) {
      el.addEventListener("keydown", handleKeyDown);
      return () => el.removeEventListener("keydown", handleKeyDown);
    }
  }, [toggle]);

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col overflow-hidden"
      tabIndex={-1}
    >
      <div className="flex items-center justify-end border-b border-border px-2 py-0.5 shrink-0 bg-background">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={toggle}
          title={mode === "preview" ? "Edit Markdown" : "Preview Markdown"}
        >
          {mode === "preview" ? <IconCode size={14} /> : <IconEye size={14} />}
        </Button>
      </div>

      {mode === "preview" ? (
        <MarkdownPreview content={content} filePath={filePath} />
      ) : (
        <MonacoEditor tabId={tabId} content={content} filePath={filePath} />
      )}
    </div>
  );
}
