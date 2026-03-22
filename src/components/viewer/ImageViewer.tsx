import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatSize } from "@/lib/utils";

interface ImageViewerProps {
  dataUrl: string;
  size: number;
}

export function ImageViewer({ dataUrl, size }: ImageViewerProps) {
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="flex items-center justify-center p-8 min-h-full">
          <img
            src={dataUrl}
            alt="Preview"
            className="max-w-full object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              setDimensions({
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }}
          />
        </div>
      </ScrollArea>

      <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-xs text-muted-foreground shrink-0">
        <span>{formatSize(size)}</span>
        {dimensions && (
          <span>
            {dimensions.width} x {dimensions.height}
          </span>
        )}
      </div>
    </div>
  );
}
