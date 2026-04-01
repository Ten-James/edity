import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const CONFIG_DIR = path.join(os.homedir(), ".config", "edity");
const LOG_PATH = path.join(CONFIG_DIR, "edity-dev.log");
const MODULE_PAD = 16;

let stream: fs.WriteStream | null = null;
const origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function stringify(val: unknown): string {
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function formatLine(level: string, mod: string, args: unknown[]): string {
  const ts = new Date().toISOString();
  const lvl = level.padEnd(5);
  const modStr = mod.padEnd(MODULE_PAD);
  const msg = args.map(stringify).join(" ");
  return `${ts}  ${lvl}  ${modStr} | ${msg}`;
}

function writeLine(level: string, mod: string, args: unknown[]): void {
  const line = formatLine(level, mod, args);
  if (stream) stream.write(line + "\n");
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export function createLogger(mod: string): Logger {
  if (!isDev) {
    return {
      info: (...args: unknown[]) => origConsole.log(`[${mod}]`, ...args),
      warn: (...args: unknown[]) => origConsole.warn(`[${mod}]`, ...args),
      error: (...args: unknown[]) => origConsole.error(`[${mod}]`, ...args),
      debug: () => {},
    };
  }
  return {
    info(...args: unknown[]) {
      origConsole.log(`[${mod}]`, ...args);
      writeLine("INFO", mod, args);
    },
    warn(...args: unknown[]) {
      origConsole.warn(`[${mod}]`, ...args);
      writeLine("WARN", mod, args);
    },
    error(...args: unknown[]) {
      origConsole.error(`[${mod}]`, ...args);
      writeLine("ERROR", mod, args);
    },
    debug(...args: unknown[]) {
      writeLine("DEBUG", mod, args);
    },
  };
}

export function setupDevLogger(): void {
  if (!isDev) return;

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  stream = fs.createWriteStream(LOG_PATH, { flags: "w" });

  // Intercept console methods to also write to file
  console.log = (...args: unknown[]) => {
    origConsole.log(...args);
    writeLine("INFO", "console", args);
  };
  console.warn = (...args: unknown[]) => {
    origConsole.warn(...args);
    writeLine("WARN", "console", args);
  };
  console.error = (...args: unknown[]) => {
    origConsole.error(...args);
    writeLine("ERROR", "console", args);
  };
}

export function flushAndClose(): void {
  if (!stream) return;
  stream.end();
  stream = null;
  origConsole.log(`[logger] Dev log written to: ${LOG_PATH}`);
}
