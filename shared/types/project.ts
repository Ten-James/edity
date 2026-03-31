export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface RunCommand {
  name: string;
  command: string;
  mode: "terminal" | "background";
}

export interface EdityConfig {
  acronym?: string;
  color?: string;
  runCommands?: RunCommand[];
}
