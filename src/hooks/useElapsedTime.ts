import { useEffect, useState } from "react";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

/**
 * Track elapsed wall-clock time while `isRunning` is true.
 * Returns a human-readable string like "5s" or "2m 13s", or empty when idle.
 */
export function useElapsedTime(isRunning: boolean): string {
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (isRunning && !startTime) {
      setStartTime(Date.now());
    } else if (!isRunning && startTime) {
      setStartTime(null);
    }
  }, [isRunning, startTime]);

  useEffect(() => {
    if (!startTime) {
      setElapsed("");
      return;
    }
    const tick = () => setElapsed(formatElapsed(Date.now() - startTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return elapsed;
}
