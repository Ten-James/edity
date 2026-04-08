import { URI } from "vscode-uri";

// Stable file path → file:// URI conversion. Renderer-safe (doesn't depend
// on Node URL). vscode-uri normalizes Windows drive letters which servers
// like rust-analyzer are picky about.

export function pathToUri(filePath: string): string {
  return URI.file(filePath).toString();
}

export function uriToPath(uri: string): string {
  return URI.parse(uri).fsPath;
}
