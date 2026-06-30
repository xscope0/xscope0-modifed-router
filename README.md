<div align="center">
  <img src="assets/logo.png" alt="xscope0 Router" width="120">
  <h1>xscope0 Router</h1>
  <p><strong>AI API proxy engine with provider failover, token compression, and circuit breaking.</strong></p>
  <p>A local proxy server that sits between your CLI tool and AI providers. It translates request formats, rotates accounts when rate-limited, compresses tokens to save costs, and fails over to the next provider when one goes down. No telemetry. No external servers. Everything runs on your machine.</p>
  <p>Works with Claude Code, Codex, Cursor, Cline, OpenCode, and any OpenAI-compatible client. Supports Kimchi, AgentRouter, GitHub Copilot, Gemini, OpenRouter, NVIDIA, and more.</p>

  <a href="https://github.com/xscope0/xScope0-Router/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/xscope0/xScope0-Router?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/pulls"><img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/xscope0/xScope0-Router?style=flat-square"></a>

  <br><br>

  <a href="docs/id.md">🇮🇩 Bahasa Indonesia</a> · <a href="docs/vi.md">🇻🇳 Tiếng Việt</a> · <a href="docs/zh.md">🇨🇳 中文</a> · <a href="docs/ja.md">🇯🇵 日本語</a> · <a href="docs/ru.md">🇷🇺 Русский</a>
</div>

---

<div align="center">
  <img src="assets/preview/preview-2.png" alt="Dashboard" width="32%">
  <img src="assets/preview/preview-3.png" alt="Providers" width="32%">
  <img src="assets/preview/preview-4.png" alt="Settings" width="32%">
</div>

---

## How It Works

```
┌─────────────────┐
│    Your CLI     │  Claude Code, Codex, Cursor, Cline, OpenCode...
│      Tool       │
└────────┬────────┘
         │ POST http://localhost:20128/v1/chat/completions
         ↓
┌─────────────────────────────────────────────────────────────┐
│                     VansRoute Engine                        │
│                                                             │
│   1. Auth & ACL check          (cached API key validation)  │
│   2. Circuit Breaker           (skip dead proxy buckets)    │
│   3. Account Semaphore         (queue if at concurrency cap)│
│   4. Token Compression         (RTK / Caveman / Ponytail)   │
│   5. Format Translation        (OpenAI ↔ Claude ↔ Gemini)   │
│   6. Param Stripping           (Kimchi CLI-aligned)         │
│   7. Executor                  (upstream via proxy if set)  │
│   8. Response Translation      (back to client format)      │
│                                                             │
│   On success: clearProviderFailure() + clearAccountError    │
│   On error:   recordProviderFailure() → breaker counts      │
│               markAccountUnavailable() → try next account   │
│               Kimchi quota? → deactivate until month end    │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Kimchi              (5 CLI models, quota auto-reactivation)
         ├─→ AgentRouter         ($200 free credits, passthrough)
         ├─→ GitHub Copilot      (subscription tier)
         ├─→ Gemini / OpenCode   (free tier)
         ├─→ OpenRouter / NVIDIA (pay-per-token)
         └─→ Combo               (fallback / round-robin / fusion / capacity)
```

---

## Providers

| Provider | Auth | Models | Notes |
|----------|------|--------|-------|
| **Kimchi** | OAuth | 5 CLI models | Quota auto-reactivation at month end |
| **AgentRouter** | API key | All | $200 free credits, direct passthrough |
| **GitHub Copilot** | OAuth | Copilot models | Subscription tier |
| **Gemini CLI** | OAuth | Gemini family | Free tier |
| **OpenCode** | OAuth | Multiple | Free tier |
| **OpenRouter** | API key | 100+ models | Pay-per-token |
| **NVIDIA** | API key | NIM endpoints | Pay-per-token |
| **Combo** | — | Aggregated | Fallback / round-robin / fusion / capacity |

---

## Install

```bash
npm install -g xscope0-modifed-router
xscope0-router
```

```bash
# or just run directly
npx xscope0-modifed-router
```

| Endpoint | URL |
|----------|-----|
| **Dashboard** | `http://localhost:20128/dashboard` |
| **API** | `http://localhost:20128/v1` |
| **Health** | `http://localhost:20128/health` |

---

## Features

**Routing Engine**
- Circuit breaker per provider bucket (auto-skip dead pools)
- Account semaphore (concurrency cap per provider)
- Format translation between OpenAI / Claude / Gemini / Kiro protocols
- Kimchi CLI-aligned parameter stripping
- Proxy pool support (HTTP/SOCKS5, auto-rotate on errors)

**Token Management**
- RTK compression (request token kiln)
- Caveman mode (ultra-compressed prompts)
- Ponytail mode (minimal output)
- Visible request logs for Caveman / Ponytail in dashboard

**Account Pool**
- Bulk import API keys (appends, never replaces)
- Bulk delete selected / inactive / deactivated
- Provider-wide `Error → inactive` policy
- Proxy force-delete unbinds accounts first
- Kiro temporary suspension handling

**xscope0 Build**
- Custom branding and provider icons
- Pi provider endpoint: `http://localhost:20128/v1`
- Donate / Remote UI removed

---

## Architecture

```
xScope0-Router/
├── cli.js                   # Entry, process mgmt, system tray
├── src/cli/                 # Core engine modules
├── app/
│   ├── server.js            # Express API server
│   ├── custom-server.js     # HTTP server setup
│   └── next.config.mjs      # Dashboard (Next.js)
├── hooks/
│   ├── postinstall.js       # Runtime dep installation
│   ├── sqliteRuntime.js     # SQLite native modules
│   └── trayRuntime.js       # System tray binary
├── scripts/
│   └── build-cli.js         # esbuild bundler
├── assets/
│   ├── logo.png
│   └── preview/
└── package.json
```

---

## Build

```bash
git clone https://github.com/xscope0/xScope0-Router.git
cd xScope0-Router
npm install
npm run build
npm pack
```

**Requirements:** Node.js >= 18.0.0

**Runtime deps** (auto-installed by `postinstall.js`):
- `sql.js` / `better-sqlite3` → `~/.9router/runtime/node_modules`
- `systray2` (macOS/Linux only) → `~/.9router/runtime/node_modules`

---

## License

MIT — Original project: [9router](https://github.com/decolua/9router)

---

<div align="center">
  <sub>Built by <a href="https://github.com/xscope0">xscope0</a></sub>
</div>
