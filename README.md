<p align="center">
  <img src="icon.png" width="128" height="128" alt="Edity logo">
</p>

<h1 align="center">Edity</h1>

<p align="center">
  A desktop IDE that combines a terminal, code editor, git client, web browser, and Claude Code integration in one app.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="Platform">
  <img src="https://img.shields.io/badge/electron-35-47848F?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-ISC-green" alt="License">
</p>

---

<p align="center">
  <img src="img/screen1.png" width="800" alt="Edity — editor and terminal">
</p>

<p align="center">
  <img src="img/screen2.png" width="800" alt="Edity — git integration">
</p>

---

## Features

### Multi-Project Workspace

- Work on multiple projects simultaneously with isolated state per project
- Each project gets its own tabs, terminals, file tree, and git context
- Custom project colors and acronyms for quick identification
- Configurable run commands per project (terminal or background mode)

### Terminal

- Full terminal emulator powered by xterm.js and node-pty
- Multiple terminal tabs per project
- Foreground process detection with dynamic tab titles
- Light/dark theme sync

### Code Editor

- Monaco Editor with TypeScript/JavaScript intellisense
- Automatic `tsconfig.json` / `jsconfig.json` detection
- Type definitions loaded from `node_modules` for autocomplete
- Custom light and dark themes
- Shiki syntax highlighting for read-only file viewing
- Image viewer with zoom, pan, and dimension info

### Git Client

- **Changes** — stage, unstage, and discard files with status indicators
- **Commits** — write commit messages and commit staged changes
- **History** — scrollable log with branch graph visualization
- **Diff viewer** — unified diffs with syntax highlighting, binary detection, new/deleted file markers
- **Branches** — create, switch, delete branches; view remote tracking info
- **Push / Pull / Fetch** — one-click operations with ahead/behind indicators in the top bar

### Claude Code Integration

- Automatic detection of Claude Code sessions in the terminal via OSC escape sequences
- Installs hooks into `~/.claude/settings.json` on startup
- Per-tab status tracking (working, idle, notification)
- Microphone passthrough for Claude Code voice mode

### Split Panes & Tabs

- Horizontal or vertical split panes (resizable)
- Tab types: terminal, file, browser, git
- Pin tabs, move tabs between panes
- Dirty file indicator for unsaved changes

### Built-in Browser

- Webview-based browser tab with URL bar
- Back / forward / reload navigation
- DevTools support

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 35 |
| Frontend | React 19, TypeScript 5.9, Vite 8 |
| Styling | Tailwind CSS 4, shadcn/ui (Radix UI) |
| Editor | Monaco Editor, Shiki |
| Terminal | xterm.js, node-pty |
| Icons | Tabler Icons |
| Optimization | React Compiler (babel plugin) |

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
git clone https://github.com/your-username/edity.git
cd edity
npm install
npm run rebuild   # rebuild native modules (node-pty) for Electron
```

### Development

```bash
npm run dev
```

Starts the Vite dev server on port 1420 and launches Electron with hot reload.

### Build & Package

```bash
npm run build      # compile TypeScript + bundle with Vite
npm run package    # build + create .dmg for macOS
```

The packaged app will be in the `release/` directory.

## Project Structure

```
edity/
├── electron/
│   ├── main.js          # Electron main process + IPC handlers
│   ├── preload.js       # Context bridge (window.electronAPI)
│   └── claude-hook.sh   # Claude Code status hook script
├── src/
│   ├── components/
│   │   ├── layout/      # Sidebar, TopBar, FileTree, TabBar, MainContent
│   │   ├── git/         # GitView, Changes, Commit, Log, Branches, Diff
│   │   ├── viewer/      # MonacoEditor, TextFileViewer, ImageViewer
│   │   └── ui/          # shadcn/ui components
│   ├── contexts/        # AppContext (global state)
│   ├── hooks/           # useTabManager, useGitState, useFileContent, useTheme
│   ├── lib/             # IPC wrapper, git-graph, diff-parser, shiki, utils
│   └── types/           # TypeScript type definitions
├── icon.png
├── package.json
└── CLAUDE.md
```

## Data Storage

All persistent data is stored in `~/.config/edity/`:

| File | Purpose |
|------|---------|
| `projects.json` | List of registered projects |
| `claude-status/` | Per-session Claude Code status files |
| `claude-hook.sh` | Hook script for Claude integration |

Per-project configuration is stored in `.edity` at each project's root.

## License

All rights reserved to Jakub Indrák
