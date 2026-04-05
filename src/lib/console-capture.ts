const MAX_ENTRIES = 5000;

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

const buffer: LogEntry[] = [];

function stringify(val: unknown): string {
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function capture(level: string, original: (...args: unknown[]) => void, args: unknown[]): void {
  original.apply(console, args);
  const message = args.map(stringify).join(" ");
  if (buffer.length >= MAX_ENTRIES) buffer.shift();
  buffer.push({ timestamp: new Date().toISOString(), level, message });
}

const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);
const origInfo = console.info.bind(console);

console.log = (...args: unknown[]) => capture("LOG", origLog, args);
console.warn = (...args: unknown[]) => capture("WARN", origWarn, args);
console.error = (...args: unknown[]) => capture("ERROR", origError, args);
console.info = (...args: unknown[]) => capture("INFO", origInfo, args);

export function getConsoleLog(): string {
  return buffer
    .map((e) => `${e.timestamp}  ${e.level.padEnd(5)}  ${e.message}`)
    .join("\n");
}
