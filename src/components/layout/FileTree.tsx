import {
  IconFile,
  IconFolderPlus,
  IconFilePlus,
  IconTrash,
  IconCopy,
  IconCursorText,
  IconFolder,
  IconEyeOff,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useFileTree, type GitFilter } from "@/hooks/useFileTree";
import { FileTreeNode } from "./FileTreeNode";

const GIT_FILTERS: { value: GitFilter; label: string; color: string }[] = [
  { value: "all", label: "All", color: "text-foreground" },
  { value: "M", label: "M", color: "text-orange-400" },
  { value: "A", label: "A", color: "text-green-400" },
  { value: "D", label: "D", color: "text-red-400" },
  { value: "?", label: "?", color: "text-muted-foreground" },
];

export function FileTree() {
  const tree = useFileTree();

  const menuOpen = tree.contextMenu !== null;

  return (
    <div className="flex h-full w-[260px] flex-col bg-background shrink-0">
      <div className="flex items-center h-8 px-1.5 border-b border-border shrink-0">
        <Input
          placeholder="Filter files..."
          value={tree.filter}
          onChange={(e) => tree.setFilter(e.target.value)}
          className="h-6 text-xs"
        />
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div
          className="p-1 min-h-full"
          onClick={tree.handleBackgroundClick}
          onContextMenu={tree.handleBackgroundContextMenu}
        >
          {tree.entries.map((entry) => (
            <FileTreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              filter={tree.filter}
              searchMatch={tree.searchMatch}
              gitStatusMap={tree.gitStatusMap}
              projectPath={tree.activeProject?.path ?? ""}
              refreshSignal={tree.refreshSignal}
              selectedPaths={tree.selectedPaths}
              showIgnored={tree.showIgnored}
              onSelect={tree.handleSelect}
              onContextMenu={tree.handleContextMenuOpen}
            />
          ))}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-border">
        {GIT_FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? null
              : tree.gitCounts[f.value as keyof typeof tree.gitCounts];
          const isActive = tree.gitFilter === f.value;
          return (
            <Button
              key={f.value}
              variant="ghost"
              size="xs"
              onClick={() => tree.setGitFilter(f.value)}
              className={cn(
                "flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono transition-colors h-auto",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
                f.color,
              )}
            >
              {f.label}
              {count != null && count > 0 && (
                <span className="text-[9px] opacity-70">{count}</span>
              )}
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => tree.setShowIgnored((v) => !v)}
          title={
            tree.showIgnored ? "Hiding gitignored files" : "Showing all files"
          }
          className={cn(
            "ml-auto p-0.5 h-auto transition-colors",
            tree.showIgnored
              ? "text-accent-foreground bg-accent"
              : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          <IconEyeOff size={12} />
        </Button>
      </div>

      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          if (!open) tree.setContextMenu(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <span
            className="fixed w-0 h-0"
            style={{
              left: tree.contextMenu?.x ?? 0,
              top: tree.contextMenu?.y ?? 0,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          {tree.contextMenu && !tree.contextMenu.entry.is_dir && (
            <DropdownMenuItem onSelect={tree.handleOpenFile}>
              <IconFile size={14} />
              Open
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => tree.handleNewEntry("file")}>
            <IconFilePlus size={14} />
            New File
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => tree.handleNewEntry("directory")}>
            <IconFolderPlus size={14} />
            New Folder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={tree.handleRenameStart}>
            <IconCursorText size={14} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={tree.handleCopyPath}>
            <IconCopy size={14} />
            Copy Path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={tree.handleDelete}
            className="text-red-400 focus:text-red-400"
          >
            <IconTrash size={14} />
            Delete
            {tree.selectedPaths.size > 1 ? ` (${tree.selectedPaths.size})` : ""}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={tree.creating !== null}
        onOpenChange={(open) => {
          if (!open) tree.setCreating(null);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {tree.creating?.type === "file" ? (
                <IconFile size={16} />
              ) : (
                <IconFolder size={16} />
              )}
              New {tree.creating?.type === "file" ? "file" : "folder"} in{" "}
              {tree.creating?.parentDir.split("/").pop()}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              tree.handleCreateSubmit();
            }}
          >
            <Input
              autoFocus
              value={tree.creating?.name ?? ""}
              onChange={(e) =>
                tree.setCreating((prev) =>
                  prev ? { ...prev, name: e.target.value } : null,
                )
              }
              placeholder={
                tree.creating?.type === "file" ? "filename.ext" : "folder name"
              }
              className="h-7 text-xs"
            />
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={tree.renaming !== null}
        onOpenChange={(open) => {
          if (!open) tree.setRenaming(null);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconCursorText size={16} />
              Rename
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              tree.handleRenameSubmit();
            }}
          >
            <Input
              autoFocus
              value={tree.renaming?.name ?? ""}
              onChange={(e) =>
                tree.setRenaming((prev) =>
                  prev ? { ...prev, name: e.target.value } : null,
                )
              }
              className="h-7 text-xs"
            />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
