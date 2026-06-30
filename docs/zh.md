<div align="center">
  <img src="../assets/logo.png" alt="xscope0 Router" width="120">
  <h1>xscope0 Router</h1>
  <p><strong>AI API 代理引擎，支持提供商故障转移、Token 压缩和断路器。</strong></p>
  <p>本地代理服务器，位于 CLI 工具和 AI 提供商之间。翻译请求格式，轮换受限账户，压缩 Token 以节省成本，当某个提供商宕机时自动切换到下一个。无遥测数据。无外部服务器。一切运行在你的机器上。</p>
  <p>兼容 Claude Code、Codex、Cursor、Cline、OpenCode 及任何 OpenAI 兼容客户端。支持 Kimchi、AgentRouter、GitHub Copilot、Gemini、OpenRouter、NVIDIA 等。</p>

  <a href="https://github.com/xscope0/xScope0-Router/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/xscope0/xScope0-Router?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/pulls"><img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square"></a>

  <br><br>

  <a href="../README.md">🇬🇧 English</a> · <a href="id.md">🇮🇩 Bahasa Indonesia</a> · <a href="vi.md">🇻🇳 Tiếng Việt</a> · <a href="ja.md">🇯🇵 日本語</a> · <a href="ru.md">🇷🇺 Русский</a>
</div>

---

<div align="center">
  <img src="../assets/preview/preview-2.png" alt="仪表板" width="32%">
  <img src="../assets/preview/preview-3.png" alt="提供商" width="32%">
  <img src="../assets/preview/preview-settings.png" alt="设置" width="32%">
</div>

---

## 工作原理

```
┌─────────────────┐
│    你的 CLI      │  Claude Code, Codex, Cursor, Cline, OpenCode...
│      工具        │
└────────┬────────┘
         │ POST http://localhost:20128/v1/chat/completions
         ↓
┌─────────────────────────────────────────────────────────────┐
│                     VansRoute 引擎                          │
│                                                             │
│   1. 认证 & ACL 检查         (缓存 API Key 验证)            │
│   2. 断路器                  (跳过失效代理桶)                │
│   3. 账户信号量              (并发上限时排队)                │
│   4. Token 压缩              (RTK / Caveman / Ponytail)     │
│   5. 格式翻译                (OpenAI ↔ Claude ↔ Gemini)     │
│   6. 参数剥离                (对齐 Kimchi CLI)              │
│   7. 执行器                  (通过代理转发到上游)            │
│   8. 响应翻译                (转换回客户端格式)              │
│                                                             │
│   成功: clearProviderFailure() + clearAccountError          │
│   失败: recordProviderFailure() → 断路计数                  │
│         markAccountUnavailable() → 尝试下一个账户           │
│         Kimchi 配额用尽? → 停用至月底                       │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Kimchi              (5 个 CLI 模型，配额月底自动恢复)
         ├─→ AgentRouter         ($200 免费额度，直通)
         ├─→ GitHub Copilot      (订阅层级)
         ├─→ Gemini / OpenCode   (免费层级)
         ├─→ OpenRouter / NVIDIA (按 Token 计费)
         └─→ Combo               (降级 / 轮询 / 融合 / 容量)
```

---

## 提供商

| 提供商 | 认证 | 模型 | 备注 |
|--------|------|------|------|
| **Kimchi** | OAuth | 5 个 CLI 模型 | 配额月底自动恢复 |
| **AgentRouter** | API key | 全部 | $200 免费额度，直通 |
| **GitHub Copilot** | OAuth | Copilot 模型 | 订阅层级 |
| **Gemini CLI** | OAuth | Gemini 系列 | 免费层级 |
| **OpenCode** | OAuth | 多种 | 免费层级 |
| **OpenRouter** | API key | 100+ 模型 | 按 Token 计费 |
| **NVIDIA** | API key | NIM 端点 | 按 Token 计费 |
| **Combo** | — | 聚合 | 降级 / 轮询 / 融合 / 容量 |

---

## 安装

```bash
npm install -g xscope0-modifed-router
xscope0-router
```

```bash
# 或直接运行
npx xscope0-modifed-router
```

| 端点 | URL |
|------|-----|
| **仪表板** | `http://localhost:20128/dashboard` |
| **API** | `http://localhost:20128/v1` |
| **健康检查** | `http://localhost:20128/health` |

---

## 功能

**路由引擎**
- 每个提供商桶的断路器（自动跳失效池）
- 账户信号量（每提供商并发上限）
- OpenAI / Claude / Gemini / Kiro 协议间格式翻译
- 对齐 Kimchi CLI 的参数剥离
- 代理池支持（HTTP/SOCKS5，错误时自动轮换）

**Token 管理**
- RTK 压缩（request token kiln）
- Caveman 模式（超压缩提示词）
- Ponytail 模式（最小输出）
- Caveman / Ponytail 请求日志在仪表板可见

**账户池**
- 批量导入 API Key（追加，不替换）
- 批量删除已选 / 不活跃 / 已停用账户
- 提供商级 `Error → 停用` 策略
- 强制删除代理时先解除账户绑定
- Kiro 临时挂起处理

**xscope0 构建**
- 自定义品牌和提供商图标
- Pi 提供商端点：`http://localhost:20128/v1`
- 移除捐赠 / 远程 UI

---

## 架构

```
xScope0-Router/
├── cli.js                   # 入口、进程管理、系统托盘
├── src/cli/                 # 核心引擎模块
├── app/
│   ├── server.js            # Express API 服务器
│   ├── custom-server.js     # HTTP 服务器配置
│   └── next.config.mjs      # 仪表板 (Next.js)
├── hooks/
│   ├── postinstall.js       # 运行时依赖安装
│   ├── sqliteRuntime.js     # SQLite 原生模块
│   └── trayRuntime.js       # 系统托盘二进制
├── scripts/
│   └── build-cli.js         # esbuild 打包器
├── assets/
│   ├── logo.png
│   └── preview/
└── package.json
```

---

## 构建

```bash
git clone https://github.com/xscope0/xScope0-Router.git
cd xScope0-Router
npm install
npm run build
npm pack
```

**要求:** Node.js >= 18.0.0

**运行时依赖**（由 `postinstall.js` 自动安装）:
- `sql.js` / `better-sqlite3` → `~/.9router/runtime/node_modules`
- `systray2`（仅 macOS/Linux）→ `~/.9router/runtime/node_modules`

---

## 许可证

MIT — 原始项目: [9router](https://github.com/decolua/9router)

---

<div align="center">
  <sub>由 <a href="https://github.com/xscope0">xscope0</a> 构建</sub>
</div>
