import { useEffect } from "react";
import { useRemoteAccessStore } from "@/stores/remoteAccessStore";
import { Button } from "@/components/ui/button";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconCopy,
  IconUsers,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface RemoteAccessViewProps {
  isActive: boolean;
}

export function RemoteAccessView({ isActive }: RemoteAccessViewProps) {
  const { running, starting, serverUrl, qrDataUrl, connectedClients, start, stop, refreshStatus } =
    useRemoteAccessStore();

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleToggle = async () => {
    try {
      if (running) {
        await stop();
      } else {
        await start();
      }
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleCopyUrl = () => {
    if (serverUrl) {
      navigator.clipboard.writeText(serverUrl);
      toast.success("URL copied");
    }
  };

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col bg-background",
        !isActive && "hidden",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleToggle}
          disabled={starting}
          className={running ? "text-green-400" : "text-muted-foreground"}
        >
          {running ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
        </Button>

        <span className="text-xs font-medium">Remote Access</span>

        {running && serverUrl && (
          <button
            onClick={handleCopyUrl}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-mono bg-muted px-1.5 py-0.5"
          >
            <IconCopy size={10} />
            {serverUrl}
          </button>
        )}

        {!running && !starting && (
          <span className="text-[10px] text-muted-foreground">Server stopped</span>
        )}

        {starting && (
          <span className="text-[10px] text-muted-foreground">Starting...</span>
        )}

        <div className="flex-1" />

        {running && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <IconUsers size={12} />
            {connectedClients}
          </span>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        {!running && !starting && (
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <p className="text-sm text-muted-foreground">
              Start the server to access your terminals from a mobile device.
            </p>
            <Button onClick={handleToggle} variant="default">
              <IconPlayerPlay size={16} />
              Start Remote Access
            </Button>
          </div>
        )}

        {starting && (
          <p className="text-sm text-muted-foreground">Starting server...</p>
        )}

        {running && qrDataUrl && (
          <div className="flex flex-col items-center gap-6 p-8">
            <img
              src={qrDataUrl}
              alt="QR Code"
              className="w-64 h-64 rounded-lg border border-border bg-white p-2"
            />

            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Scan with your phone to open the terminal
              </p>

              {serverUrl && (
                <button
                  onClick={handleCopyUrl}
                  className="font-mono text-xs text-primary hover:underline cursor-pointer"
                >
                  {serverUrl}
                </button>
              )}

              <p className="text-xs text-muted-foreground mt-2">
                {connectedClients === 0
                  ? "No clients connected"
                  : `${connectedClients} client${connectedClients > 1 ? "s" : ""} connected`}
              </p>
            </div>

            <Button onClick={handleToggle} variant="outline" size="sm">
              <IconPlayerStop size={14} />
              Stop Server
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
