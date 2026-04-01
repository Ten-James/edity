import { useFileContent } from "@/hooks/useFileContent";
import { MonacoEditor } from "@/components/viewer/MonacoEditor";
import { MarkdownViewer } from "@/components/viewer/MarkdownViewer";
import { ImageViewer } from "@/components/viewer/ImageViewer";
import { formatSize } from "@/lib/utils";

function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "mdx";
}

interface FileViewerProps {
  tabId: string;
  filePath: string;
  isActive: boolean;
}

export function FileViewer({ tabId, filePath, isActive }: FileViewerProps) {
  const { content, loading, error } = useFileContent(tabId, filePath);

  return (
    <div
      className="absolute inset-0 flex flex-col bg-background overflow-auto"
      style={{ display: isActive ? "flex" : "none" }}
    >
      {loading && (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Loading...
        </div>
      )}

      {error && (
        <div className="flex flex-1 items-center justify-center text-destructive text-sm">
          {error}
        </div>
      )}

      {!loading && !error && content && (
        <>
          {content.type === "Text" && isMarkdownFile(filePath) && (
            <MarkdownViewer
              tabId={tabId}
              content={content.content}
              filePath={filePath}
            />
          )}

          {content.type === "Text" && !isMarkdownFile(filePath) && (
            <MonacoEditor
              tabId={tabId}
              content={content.content}
              filePath={filePath}
            />
          )}

          {content.type === "Image" && (
            <ImageViewer url={content.url} size={content.size} />
          )}

          {content.type === "Binary" && (
            <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
              Binary file cannot be displayed ({formatSize(content.size)})
            </div>
          )}

          {content.type === "TooLarge" && (
            <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
              File too large to display ({formatSize(content.size)})
            </div>
          )}
        </>
      )}
    </div>
  );
}
