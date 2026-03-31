export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface EdityConfig {
  acronym?: string;
  color?: string;
  runCommand?: string;
  runMode?: "terminal" | "background";
}
