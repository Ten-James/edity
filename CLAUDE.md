## Project Overview

Edity is an Electron desktop app — a multi-project terminal, file editor, and git management IDE. React frontend (Vite dev server on port 1420) communicates with Electron main process via IPC.

Always write clean code and ensure if its possible one component per file, no more than 800 lines per file and typesafety at any moment.


## Tech Stack

- **Renderer**: React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4, shadcn/ui (radix-lyra style, tabler icons)
- **Editor**: Monaco Editor + Shiki for syntax highlighting
- **Terminal**: xterm.js + node-pty
- **Main process**: Electron 35 (`electron/main.js` — plain JS, not TypeScript)
- **React Compiler** enabled via babel-plugin-react-compiler

## Architecture

**State management**: Single React Context (`src/contexts/AppContext.tsx`) holds all global state — projects, tabs, git state, Claude status. No external state library.

**IPC bridge**: `electron/preload.js` exposes `window.electron` API. `src/lib/ipc.ts` wraps it. All Electron main process handlers are in `electron/main.js` (~37 IPC handlers for terminal, file, git, and project operations).

**Per-project isolation**: Each project has its own tabs, terminal PTYs, file tree, git state, and run command config. Projects stored in `~/.config/edity/projects.json`.

**Tab types**: terminal, file, browser, git — dispatched by `src/components/layout/MainContent.tsx`.

**Git integration**: All git commands run via `execFileSync` in the Electron main process, exposed through IPC. UI state managed by `src/hooks/useGitState.ts`.

**Claude Code integration**: Detects Claude via OSC title sequences in PTY output. Installs hooks into `~/.claude/settings.json` on startup. Status tracked per-tab via files in `~/.config/edity/claude-status/`.


## Data Persistence

All persistent app data goes in `~/.config/edity/`, not in the project directory. Per-project config lives in `.edity` file at each project's root.
