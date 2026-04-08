import type { EdityConfig, RunCommand } from "@shared/types/project";
import type { DetectedScript } from "@shared/types/ipc";

export function getRunCommands(config: EdityConfig | null): RunCommand[] {
  return config?.runCommands ?? [];
}

export function getDefaultRunCommand(
  config: EdityConfig | null,
): RunCommand | null {
  const commands = getRunCommands(config);
  return commands[0] ?? null;
}

/**
 * Ordered priority for the implicit default when no .edity config exists.
 * Matched against detected scripts by (source, name). First hit wins.
 */
const AUTO_DEFAULT_PRIORITY: Array<{ source: string; name: string }> = [
  { source: "package.json", name: "dev" },
  { source: "package.json", name: "start" },
  { source: "go.mod", name: "go build" },
  { source: "Cargo.toml", name: "cargo build" },
];

/**
 * Picks an implicit default run command from auto-detected project scripts.
 * Returns a RunCommand in terminal mode so the user sees live output when
 * they hit the Run button on a project without a .edity config.
 */
export function pickAutoDefault(
  scripts: DetectedScript[],
): RunCommand | null {
  for (const preferred of AUTO_DEFAULT_PRIORITY) {
    const match = scripts.find(
      (s) => s.source === preferred.source && s.name === preferred.name,
    );
    if (match) {
      return {
        name: match.name,
        command: match.command,
        mode: "terminal",
      };
    }
  }
  return null;
}
