import { useFileContent } from "@/hooks/useFileContent";
import { TextFileViewer } from "@/components/viewer/TextFileViewer";
import { ImageViewer } from "@/components/viewer/ImageViewer";
import { formatSize } from "@/lib/utils";

interface FileViewerProps {
  tabId: string;
  filePath: string;
  isActive: boolean;
}

export function FileViewer({ tabId, filePath, isActive }: FileViewerProps) {
  const { content, loading, error } = useFileContent(tabId, filePath);

  return (
    <div
      className="absolute inset-0 flex flex-col bg-background"
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
          {content.type === "Text" && (
            <TextFileViewer
              content={content.content}
              filePath={filePath}
            />
          )}

          {content.type === "Image" && (
            <ImageViewer
              dataUrl={content.data_url}
              size={content.size}
            />
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
