import * as path from "path";

export const MAX_TEXT_SIZE = 5 * 1024 * 1024;
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const IMAGE_MIMES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
};

export function detectMime(filePath: string): string | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return IMAGE_MIMES[ext] || null;
}
