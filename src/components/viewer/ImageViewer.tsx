import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { IconPlus, IconMinus } from "@tabler/icons-react";
import { formatSize } from "@/lib/utils";

const MIN_SCALE = 0.1;
const MAX_SCALE = 32;
const ZOOM_SENSITIVITY = 0.002;
const ZOOM_BUTTON_FACTOR = 1.5;

interface ImageViewerProps {
  url: string;
  size: number;
}

export function ImageViewer({ url, size }: ImageViewerProps) {
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef({ x: 0, y: 0 });
  const translateStartRef = useRef({ x: 0, y: 0 });
  const translateRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const initializedRef = useRef(false);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setDimensions(null);
    initializedRef.current = false;
  }, [url]);

  const centerImage = () => {
    if (!dimensions || !containerRef.current) {
      setTranslate({ x: 0, y: 0 });
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setTranslate({
      x: (rect.width - dimensions.width) / 2,
      y: (rect.height - dimensions.height) / 2,
    });
  };

  useEffect(() => {
    if (!dimensions || !containerRef.current || initializedRef.current) return;
    initializedRef.current = true;
    centerImage();
  }, [dimensions]);

  const resetZoom = () => {
    setScale(1);
    centerImage();
  };

  const zoomAt = (centerX: number, centerY: number, newScale: number) => {
    setScale((prevScale) => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
      const ratio = clamped / prevScale;
      setTranslate((prev) => ({
        x: centerX - ratio * (centerX - prev.x),
        y: centerY - ratio * (centerY - prev.y),
      }));
      return clamped;
    });
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const delta = -e.deltaY * ZOOM_SENSITIVITY;

    zoomAt(cursorX, cursorY, scaleRef.current * (1 + delta));
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY };
    translateStartRef.current = { ...translateRef.current };
  };

  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      setTranslate({
        x: translateStartRef.current.x + (e.clientX - panStartRef.current.x),
        y: translateStartRef.current.y + (e.clientY - panStartRef.current.y),
      });
    };

    const handleMouseUp = () => setIsPanning(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPanning]);

  const zoomByButton = (direction: 1 | -1) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const factor =
      direction === 1 ? ZOOM_BUTTON_FACTOR : 1 / ZOOM_BUTTON_FACTOR;
    zoomAt(rect.width / 2, rect.height / 2, scale * factor);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onDoubleClick={resetZoom}
      >
        <div
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          <img
            src={url}
            alt="Preview"
            className="max-w-none"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              setDimensions({
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-xs text-muted-foreground shrink-0">
        <span>{formatSize(size)}</span>
        {dimensions && (
          <span>
            {dimensions.width} x {dimensions.height}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => zoomByButton(-1)}
          >
            <IconMinus size={14} />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={resetZoom}
            className="px-1.5 text-xs text-muted-foreground hover:text-foreground tabular-nums min-w-[3.5rem] text-center"
          >
            {Math.round(scale * 100)}%
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => zoomByButton(1)}
          >
            <IconPlus size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
