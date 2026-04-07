import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconX, IconCheck } from "@tabler/icons-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Chromium's Local Font Access API — not in TypeScript lib yet.
interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}
interface WindowWithFonts {
  queryLocalFonts?: () => Promise<FontData[]>;
}

// Curated developer / monospace fonts. Shown at the top of the mono picker
// even if they are not installed — the font stack fallback handles missing ones
// gracefully, so users can quickly try one they have installed.
const DEV_FONTS = [
  "Fira Code",
  "JetBrains Mono",
  "Cascadia Code",
  "Cascadia Mono",
  "Source Code Pro",
  "Hack",
  "IBM Plex Mono",
  "Inconsolata",
  "Ubuntu Mono",
  "DejaVu Sans Mono",
  "Monaco",
  "Menlo",
  "Consolas",
  "SF Mono",
];

// Cache of monospace detection results across picker instances.
const monoCache = new Map<string, boolean>();

function isMonospaced(family: string): boolean {
  const cached = monoCache.get(family);
  if (cached !== undefined) return cached;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      monoCache.set(family, false);
      return false;
    }
    // Measure the target font.
    ctx.font = `16px "${family}", monospace`;
    const wI = ctx.measureText("i").width;
    const wM = ctx.measureText("M").width;
    const wW = ctx.measureText("W").width;
    const result =
      Math.abs(wI - wM) < 1 && Math.abs(wM - wW) < 1 && Math.abs(wI - wW) < 1;
    monoCache.set(family, result);
    return result;
  } catch {
    monoCache.set(family, false);
    return false;
  }
}

interface FontPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  monoOnly?: boolean;
  placeholder?: string;
}

interface FontRow {
  family: string;
  label: string;
  dev?: boolean;
}

export function FontPicker({
  value,
  onChange,
  monoOnly = false,
  placeholder = "System default",
}: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMono, setFilterMono] = useState(monoOnly);
  const loadStartedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const supportsLocalFonts = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof (window as unknown as WindowWithFonts).queryLocalFonts ===
        "function",
    [],
  );

  useEffect(() => {
    if (!open || loadStartedRef.current || !supportsLocalFonts) return;
    loadStartedRef.current = true;
    setLoading(true);
    const query = (window as unknown as WindowWithFonts).queryLocalFonts;
    if (!query) {
      setLoading(false);
      return;
    }
    query()
      .then((data) => {
        const families = Array.from(new Set(data.map((f) => f.family))).sort(
          (a, b) => a.localeCompare(b),
        );
        setSystemFonts(families);
      })
      .catch(() => {
        setSystemFonts([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, supportsLocalFonts]);

  // Reset search when closing.
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const rows = useMemo<FontRow[]>(() => {
    const q = search.trim().toLowerCase();
    const system = systemFonts ?? [];
    const systemSet = new Set(system.map((s) => s.toLowerCase()));

    // Dev fonts section: shown at top when no filter or matches search.
    const devRows: FontRow[] = DEV_FONTS.filter((f) => {
      if (filterMono && systemSet.has(f.toLowerCase()) && !isMonospaced(f)) {
        return false;
      }
      if (q && !f.toLowerCase().includes(q)) return false;
      return true;
    }).map((f) => ({ family: f, label: f, dev: true }));

    // All system fonts, minus ones already shown in dev section.
    const devSet = new Set(DEV_FONTS.map((f) => f.toLowerCase()));
    const systemRows: FontRow[] = system
      .filter((f) => {
        if (devSet.has(f.toLowerCase())) return false;
        if (filterMono && !isMonospaced(f)) return false;
        if (q && !f.toLowerCase().includes(q)) return false;
        return true;
      })
      .map((f) => ({ family: f, label: f }));

    return [...devRows, ...systemRows];
  }, [systemFonts, search, filterMono]);

  // Reset scroll when search changes.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [search, filterMono]);

  const triggerLabel = value ?? placeholder;

  // Fallback UI: plain text input + curated datalist.
  if (!supportsLocalFonts) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={value ?? ""}
          placeholder={placeholder}
          list="font-picker-curated"
          className="h-8 text-xs"
          style={value ? { fontFamily: `"${value}"` } : undefined}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v === "" ? null : v);
          }}
        />
        <datalist id="font-picker-curated">
          {DEV_FONTS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        {value !== null && (
          <button
            type="button"
            aria-label="Reset to default"
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-border text-muted-foreground hover:bg-accent"
            onClick={() => onChange(null)}
          >
            <IconX className="size-3.5" />
          </button>
        )}
      </div>
    );
  }

  function handlePick(family: string | null) {
    onChange(family);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center justify-between border border-border bg-input/30 px-2.5 text-xs hover:bg-accent",
            value ? "text-foreground" : "text-muted-foreground",
          )}
          style={value ? { fontFamily: `"${value}"` } : undefined}
        >
          <span className="truncate">{triggerLabel}</span>
          <IconChevronDown className="ml-2 size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="flex w-[320px] flex-col gap-0 overflow-hidden p-0"
        align="start"
      >
        <div className="border-b p-1.5">
          <Input
            autoFocus
            placeholder="Search fonts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        {monoOnly && (
          <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
            <Checkbox
              id="font-picker-mono-only"
              checked={filterMono}
              onCheckedChange={(v) => setFilterMono(v === true)}
            />
            <label
              htmlFor="font-picker-mono-only"
              className="cursor-pointer text-xs text-muted-foreground"
            >
              Monospaced only
            </label>
          </div>
        )}
        <div
          ref={listRef}
          className="max-h-[320px] overflow-y-auto scrollbar-thin"
        >
          {loading && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Loading fonts...
            </div>
          )}
          {!loading && (
            <div className="flex flex-col py-1">
              <FontItem
                label="System default"
                muted
                selected={value === null}
                onClick={() => handlePick(null)}
              />
              {rows.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No fonts found.
                </div>
              )}
              {rows.map((row, idx) => {
                const prev = rows[idx - 1];
                const showDivider =
                  idx > 0 && Boolean(prev?.dev) !== Boolean(row.dev);
                return (
                  <div key={row.family}>
                    {showDivider && <div className="my-1 h-px bg-border" />}
                    <FontItem
                      label={row.label}
                      family={row.family}
                      selected={value === row.family}
                      onClick={() => handlePick(row.family)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FontItemProps {
  label: string;
  family?: string;
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
}

function FontItem({ label, family, selected, muted, onClick }: FontItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-accent",
        muted && "text-muted-foreground",
      )}
      style={family ? { fontFamily: `"${family}"` } : undefined}
    >
      <span className="truncate">{label}</span>
      {selected && <IconCheck className="ml-2 size-3.5 shrink-0" />}
    </button>
  );
}
