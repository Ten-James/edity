import type { EdityConfig, RunCommand } from "@shared/types/project";

export function getRunCommands(config: EdityConfig | null): RunCommand[] {
  return config?.runCommands ?? [];
}

export function getDefaultRunCommand(
  config: EdityConfig | null,
): RunCommand | null {
  const commands = getRunCommands(config);
  return commands[0] ?? null;
}
