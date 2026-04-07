import { useEffect, useState } from "react";
import { invoke } from "@/lib/ipc";
import type { DetectedScript } from "@shared/types/ipc";

export function useScriptDetection(projectPath: string | undefined) {
  const [detectedScripts, setDetectedScripts] = useState<DetectedScript[]>([]);

  // Clear stale results when the project path changes or unsets.
  const [prevProjectPath, setPrevProjectPath] = useState(projectPath);
  if (projectPath !== prevProjectPath) {
    setPrevProjectPath(projectPath);
    setDetectedScripts([]);
  }

  useEffect(() => {
    if (!projectPath) return;
    invoke<DetectedScript[]>("detect_project_scripts", { projectPath })
      .then(setDetectedScripts)
      .catch(() => setDetectedScripts([]));
  }, [projectPath]);

  return detectedScripts;
}
