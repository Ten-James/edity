import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconPlugConnected, IconLoader2 } from "@tabler/icons-react";
import type { ConnectionConfig, DataProviderType } from "@shared/types/data";

interface ConnectionFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: ConnectionConfig) => Promise<void>;
  onTest: (
    config: ConnectionConfig,
  ) => Promise<{ ok: boolean; error?: string }>;
  projectId: string;
  initial?: ConnectionConfig | null;
}

export function ConnectionForm({
  open,
  onClose,
  onSave,
  onTest,
  projectId,
  initial,
}: ConnectionFormProps) {
  const [type, setType] = useState<DataProviderType>(initial?.type ?? "redis");
  const [name, setName] = useState(initial?.name ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  // Redis fields
  const [host, setHost] = useState(
    initial?.type === "redis" ? initial.host : "localhost",
  );
  const [port, setPort] = useState(
    initial?.type === "redis" ? String(initial.port) : "6379",
  );
  const [password, setPassword] = useState(
    initial?.type === "redis" ? (initial.password ?? "") : "",
  );
  const [db, setDb] = useState(
    initial?.type === "redis" ? String(initial.db ?? 0) : "0",
  );

  // SQLite fields
  const [filePath, setFilePath] = useState(
    initial?.type === "sqlite" ? initial.filePath : "",
  );

  // Reset form state each time the dialog opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setType(initial?.type ?? "redis");
      setName(initial?.name ?? "");
      setHost(initial?.type === "redis" ? initial.host : "localhost");
      setPort(initial?.type === "redis" ? String(initial.port) : "6379");
      setPassword(initial?.type === "redis" ? (initial.password ?? "") : "");
      setDb(initial?.type === "redis" ? String(initial.db ?? 0) : "0");
      setFilePath(initial?.type === "sqlite" ? initial.filePath : "");
      setTestResult(null);
      setTesting(false);
    }
  }

  function buildConfig(): ConnectionConfig {
    const id = initial?.id ?? crypto.randomUUID();
    if (type === "redis") {
      return {
        id,
        name,
        projectId,
        type: "redis",
        host,
        port: Number(port),
        password: password || undefined,
        db: Number(db),
      };
    }
    return { id, name, projectId, type: "sqlite", filePath };
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await onTest(buildConfig());
    setTestResult(result);
    setTesting(false);
  }

  async function handleSave() {
    await onSave(buildConfig());
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit Connection" : "New Connection"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Database"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Type</label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as DataProviderType);
                setTestResult(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="redis">Redis</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "redis" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Host</label>
                  <Input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Port</label>
                  <Input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="6379"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="(optional)"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">
                  Database
                </label>
                <Input
                  value={db}
                  onChange={(e) => setDb(e.target.value)}
                  placeholder="0"
                />
              </div>
            </>
          )}

          {type === "sqlite" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">File Path</label>
              <Input
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/path/to/database.sqlite3"
              />
            </div>
          )}

          {testResult && (
            <div
              className={`text-xs px-3 py-2 rounded-md ${testResult.ok ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}
            >
              {testResult.ok
                ? "Connection successful"
                : `Failed: ${testResult.error}`}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTest}
            disabled={testing || !name}
          >
            {testing ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : (
              <IconPlugConnected size={14} />
            )}
            Test
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!name || (type === "sqlite" && !filePath)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
