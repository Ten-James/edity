import { useEffect, useState } from "react";
import { invoke, listen } from "@/lib/ipc";

export function useTopBar() {
  const [homedir, setHomedir] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    invoke<string>("get_homedir").then(setHomedir);
    let unlisten: (() => void) | undefined;
    listen<boolean>("fullscreen-changed", (e) =>
      setIsFullscreen(e.payload),
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  function formatProjectPath(path: string): string {
    if (homedir && path.startsWith(homedir)) {
      return "~" + path.slice(homedir.length);
    }
    return path;
  }

  return { isFullscreen, formatProjectPath };
}
