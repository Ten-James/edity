import { useEffect, useState } from "react";
import { invoke } from "@/lib/ipc";
import type { DetectedScript } from "@shared/types/ipc";

export function useScriptDetection(projectPath: string | undefined) {
  const [detectedScripts, setDetectedScripts] = useState<DetectedScript[]>([]);

  useEffect(() => {
    if (!projectPath) {
      setDetectedScripts([]);
      return;
    }
    invoke<DetectedScript[]>("detect_project_scripts", { projectPath })
      .then(setDetectedScripts)
      .catch(() => setDetectedScripts([]));
  }, [projectPath]);

  return detectedScripts;
}
