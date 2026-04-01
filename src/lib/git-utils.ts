export function statusColor(code: string): string {
  switch (code) {
    case "M":
      return "text-orange-400";
    case "A":
      return "text-green-400";
    case "D":
      return "text-red-400";
    case "R":
      return "text-blue-400";
    case "?":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function relPath(fullPath: string, projectPath: string): string {
  return fullPath.startsWith(projectPath + "/")
    ? fullPath.slice(projectPath.length + 1)
    : fullPath;
}
