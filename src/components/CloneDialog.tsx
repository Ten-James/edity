import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { invoke } from "@/lib/ipc";
import { dispatch } from "@/stores/eventBus";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import type { Project } from "@shared/types/project";

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Extract "repo" from "git@github.com:foo/repo.git", "https://…/repo.git", etc. */
function deriveLocalName(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const match = trimmed.match(/([^/:]+?)(?:\.git)?$/);
  return match?.[1] ?? "";
}

export function CloneDialog({ open, onOpenChange }: CloneDialogProps) {
  const defaultSrcFolder = useSettingsStore(
    (s) => s.settings.defaultSrcFolder,
  );
  const [homedir, setHomedir] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [parentFolder, setParentFolder] = useState("");
  const [localName, setLocalName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    invoke<string>("get_homedir").then(setHomedir);
  }, []);

  useEffect(() => {
    if (!open) return;
    setRemoteUrl("");
    setLocalName("");
    setNameTouched(false);
    setParentFolder(defaultSrcFolder ?? (homedir ? `${homedir}/src` : ""));
  }, [open, defaultSrcFolder, homedir]);

  function handleUrlChange(value: string) {
    setRemoteUrl(value);
    if (!nameTouched) setLocalName(deriveLocalName(value));
  }

  async function handleBrowse() {
    const result = await invoke<{ canceled: boolean; filePaths: string[] }>(
      "show-open-dialog",
      { properties: ["openDirectory", "createDirectory"] },
    );
    if (!result.canceled && result.filePaths[0]) {
      setParentFolder(result.filePaths[0]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = remoteUrl.trim();
    const parent = parentFolder.trim();
    const name = localName.trim();
    if (!url || !parent || !name) return;

    setLoading(true);
    try {
      const clone = await invoke<
        { ok: true; path: string } | { ok: false; error: string }
      >("git_clone", {
        parentDir: parent,
        folderName: name,
        remoteUrl: url,
      });

      if (!clone.ok) {
        toast.error(`Clone failed: ${clone.error}`);
        return;
      }

      const project = await invoke<Project>("add_project", {
        name,
        path: clone.path,
      });
      useProjectStore.setState((s) => ({
        projects: [...s.projects, project],
        activeProject: project,
        projectStack: [project.id],
      }));
      useProjectStore.getState()._loadConfig(project);
      dispatch({ type: "project-switch", projectId: project.id });
      toast.success(`Cloned ${name}`);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    !loading &&
    remoteUrl.trim().length > 0 &&
    parentFolder.trim().length > 0 &&
    localName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clone Repository</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Remote URL</span>
            <Input
              value={remoteUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="git@github.com:user/repo.git"
              autoFocus
              disabled={loading}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Parent folder</span>
            <div className="flex gap-2">
              <Input
                value={parentFolder}
                onChange={(e) => setParentFolder(e.target.value)}
                placeholder="/Users/you/src"
                disabled={loading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleBrowse}
                disabled={loading}
              >
                Browse…
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Local name</span>
            <Input
              value={localName}
              onChange={(e) => {
                setLocalName(e.target.value);
                setNameTouched(true);
              }}
              placeholder="repo"
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {loading ? "Cloning…" : "Clone"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
