<div align="center">
  <img src="assets/logo.png" alt="xscope0 Router Logo" width="150">
  <h1>xscope0 Router</h1>
  <strong>AI API Proxy Router with Provider Automation</strong>
  <br>
  <a href="https://github.com/xscope0/xScope0-Router">github.com/xscope0/xScope0-Router</a>
</div>
<br>

<p align="center">
  <a href="https://github.com/xscope0/xScope0-Router/releases/latest" target="_blank">
    <img alt="GitHub release" src="https://img.shields.io/github/v/release/xscope0/xScope0-Router">
  </a>
  <a href="https://github.com/xscope0/xScope0-Router/pulls" target="_blank">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs Welcome">
  </a>
  <a href="https://github.com/xscope0/xScope0-Router/blob/main/LICENSE" target="_blank">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
  <a href="https://github.com/xscope0/xScope0-Router/network/members" target="_blank">
    <img src="https://img.shields.io/github/forks/xscope0/xScope0-Router?style=social" alt="GitHub forks">
  </a>
</p>

<div align="center">

| | |
|---|---|
| Dashboard | `http://localhost:20128/dashboard` |
| API Endpoint | `http://localhost:20128/v1` |
| Node.js | `>=18.0.0` |

</div>

---

## Preview

<div align="center">

![Dashboard](assets/preview/preview-1.png)

![API Proxy](assets/preview/preview-2.png)

</div>

---

## Features

**Core**
- Unified API proxy endpoint for multiple AI providers
- Automatic provider failover and rotation
- Account pool management with bulk operations
- SQLite-backed persistent storage
- System tray integration (macOS/Linux/Windows)

**Provider Automation**
- Mimo Code Free + OpenCode Free proxy automation
- Proxy pool selection with auto-rotation (5/10/15 min intervals)
- Automatic rotation on rate-limit or provider errors (incl. Mimo 400/441)
- Provider-wide `Error -> inactive` policy for account providers
- Kiro temporary suspension handling

**Account Management**
- Bulk delete selected accounts
- Bulk delete inactive/deactivated accounts
- Bulk API key import (appends, does not replace same-name accounts)
- Proxy pool force-delete unbinds accounts first

**xscope0 Modifications**
- Custom branding and updated provider icons
- Pi provider setup with fixed local endpoint: `http://localhost:20128/v1`
- TokenSaver path hardened: RTK, Headroom, Caveman, Ponytail flags
- Visible Caveman/Ponytail request logs
- Donate / Remote UI removed

---

## Install

```bash
npm install -g xscope0-modifed-router
9router
```

Or run directly:

```bash
npx xscope0-modifed-router
```

The package exposes both `9router` and `xscope0-router` binaries for compatibility.

---

## Build

```bash
npm install
npm run build
npm pack
```

**Build output:** `xscope0-modifed-router-x.x.x.tgz`

---

## Architecture

```
xScope0-Router/
├── cli.js                 # Entry point, process management, system tray
├── src/
│   └── cli/               # Core CLI modules
├── app/
│   ├── server.js          # Express server, API routes
│   ├── custom-server.js   # Custom HTTP server setup
│   ├── next.config.mjs    # Next.js configuration
│   └── package.json       # App dependencies (React, Next.js)
├── hooks/
│   ├── postinstall.js     # Runtime dependency installation
│   ├── sqliteRuntime.js   # SQLite native module management
│   └── trayRuntime.js     # System tray binary management
├── scripts/
│   └── build-cli.js       # esbuild bundler script
├── assets/
│   ├── logo.png           # App logo
│   └── preview/           # Screenshot assets
├── package.json
└── LICENSE
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `enquirer` | Interactive CLI prompts |
| `node-forge` | Cryptographic operations |
| `node-machine-id` | Device identification |
| `react` / `react-dom` | Dashboard UI |
| `sql.js` / `better-sqlite3` | Database (installed at runtime) |
| `systray2` | System tray (macOS/Linux, installed at runtime) |

Native modules (`sql.js`, `better-sqlite3`, `systray2`) are installed into `~/.9router/runtime/node_modules` by `hooks/postinstall.js` to avoid Windows EBUSY errors during CLI updates.

---

## License

MIT. Original project: [9router](https://github.com/decolua/9router).

---

## Star History

<a href="https://www.star-history.com/?repos=xscope0%2FxScope0-Router&type=Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=xscope0/xScope0-Router&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=xscope0/xScope0-Router&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=xscope0/xScope0-Router&type=Date" />
 </picture>
</a>
