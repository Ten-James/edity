import { useEffect, useRef, useState } from "react";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

/**
 * Track elapsed wall-clock time while `isRunning` is true.
 * Returns a human-readable string like "5s" or "2m 13s", or empty when idle.
 */
export function useElapsedTime(isRunning: boolean): string {
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!isRunning) return;

    startRef.current = Date.now();
    const tick = () =>
      setElapsed(formatElapsed(Date.now() - startRef.current!));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Derive the displayed value so callers see "" the moment isRunning flips off.
  return isRunning ? elapsed : "";
}
