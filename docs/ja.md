<div align="center">
  <img src="../assets/logo.png" alt="xscope0 Router" width="120">
  <h1>xscope0 Router</h1>
  <p><strong>プロバイダーのフェイルオーバー、トークン圧縮、サーキットブレーカーを備えたAI APIプロキシエンジン。</strong></p>
  <p>CLIツールとAIプロバイダーの間に位置するローカルプロキシサーバー。リクエスト形式を変換し、レート制限時にアカウントをローテーションし、コスト削減のためにトークンを圧縮し、プロバイダーがダウンした場合に次のプロバイダーにフェイルオーバーします。テレメトリなし。外部サーバーなし。すべてあなたのマシンで実行。</p>
  <p>Claude Code、Codex、Cursor、Cline、OpenCode、およびOpenAI互換クライアントで動作。Kimchi、AgentRouter、GitHub Copilot、Gemini、OpenRouter、NVIDIAなどをサポート。</p>

  <a href="https://github.com/xscope0/xScope0-Router/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/xscope0/xScope0-Router?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/pulls"><img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square"></a>

  <br><br>

  <a href="../README.md">🇬🇧 English</a> · <a href="id.md">🇮🇩 Bahasa Indonesia</a> · <a href="vi.md">🇻🇳 Tiếng Việt</a> · <a href="zh.md">🇨🇳 中文</a> · <a href="ru.md">🇷🇺 Русский</a>
</div>

---

<div align="center">
  <img src="../assets/preview/preview-2.png" alt="ダッシュボード" width="32%">
  <img src="../assets/preview/preview-3.png" alt="プロバイダー" width="32%">
  <img src="../assets/preview/preview-4.png" alt="設定" width="32%">
</div>

---

## 仕組み

```
┌─────────────────┐
│  あなたのCLI    │  Claude Code, Codex, Cursor, Cline, OpenCode...
│     ツール       │
└────────┬────────┘
         │ POST http://localhost:20128/v1/chat/completions
         ↓
┌─────────────────────────────────────────────────────────────┐
│                     VansRoute エンジン                      │
│                                                             │
│   1. 認証 & ACL チェック     (キャッシュされたAPIキー検証)   │
│   2. サーキットブレーカー     (デッドプロキシバケットをスキップ) │
│   3. アカウントセマフォア     (同時実行上限でキュー)         │
│   4. トークン圧縮            (RTK / Caveman / Ponytail)     │
│   5. 形式変換                (OpenAI ↔ Claude ↔ Gemini)     │
│   6. パラメータ除去          (Kimchi CLI対応)               │
│   7. エグゼキュータ          (プロキシ経由でアップストリーム) │
│   8. レスポンス変換          (クライアント形式に変換)        │
│                                                             │
│   成功時: clearProviderFailure() + clearAccountError        │
│   エラー: recordProviderFailure() → ブレーカーカウント       │
│           markAccountUnavailable() → 次のアカウントを試行   │
│           Kimchiクォータ? → 月末まで無効化                  │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Kimchi              (5つのCLIモデル、クォータ自動再活性化)
         ├─→ AgentRouter         ($200無料クレジット、パススルー)
         ├─→ GitHub Copilot      (サブスクリプション層)
         ├─→ Gemini / OpenCode   (無料層)
         ├─→ OpenRouter / NVIDIA (トークン単位課金)
         └─→ Combo               (フォールバック/ラウンドロビン/フュージョン/容量)
```

---

## プロバイダー

| プロバイダー | 認証 | モデル | 備考 |
|-------------|------|--------|------|
| **Kimchi** | OAuth | 5つのCLIモデル | 月末クォータ自動再活性化 |
| **AgentRouter** | APIキー | すべて | $200無料クレジット、直接パススルー |
| **GitHub Copilot** | OAuth | Copilotモデル | サブスクリプション層 |
| **Gemini CLI** | OAuth | Geminiファミリー | 無料層 |
| **OpenCode** | OAuth | 複数 | 無料層 |
| **OpenRouter** | APIキー | 100以上のモデル | トークン単位課金 |
| **NVIDIA** | APIキー | NIMエンドポイント | トークン単位課金 |
| **Combo** | — | 集約 | フォールバック/ラウンドロビン/フュージョン/容量 |

---

## インストール

```bash
npm install -g xscope0-modifed-router
xscope0-router
```

```bash
# または直接実行
npx xscope0-modifed-router
```

| エンドポイント | URL |
|---------------|-----|
| **ダッシュボード** | `http://localhost:20128/dashboard` |
| **API** | `http://localhost:20128/v1` |
| **ヘルスチェック** | `http://localhost:20128/health` |

---

## 機能

**ルーティングエンジン**
- プロバイダーバケットごとのサーキットブレーカー（デッドプールを自動スキップ）
- アカウントセマフォア（プロバイダーごとの同時実行制限）
- OpenAI / Claude / Gemini / Kiro プロトコル間の形式変換
- Kimchi CLI対応パラメータ除去
- プロキシプールサポート（HTTP/SOCKS5、エラー時に自動ローテーション）

**トークン管理**
- RTK圧縮（request token kiln）
- Cavemanモード（超圧縮プロンプト）
- Ponytailモード（最小出力）
- Caveman / Ponytailリクエストログをダッシュボードで表示

**アカウントプール**
- APIキーの一括インポート（追加、置換なし）
- 選択済み/非アクティブ/無効化されたアカウントの一括削除
- プロバイダー全体の`Error → 非アクティブ`ポリシー
- プロキシ強制削除時にアカウントのバインドを先に解除
- Kiro一時停止処理

**xscope0ビルド**
- カスタムブランディングとプロバイダーアイコン
- Piプロバイダーエンドポイント: `http://localhost:20128/v1`
- 寄付/リモートUI削除済み

---

## アーキテクチャ

```
xScope0-Router/
├── cli.js                   # エントリー、プロセス管理、システムトレイ
├── src/cli/                 # コアエンジンモジュール
├── app/
│   ├── server.js            # Express APIサーバー
│   ├── custom-server.js     # HTTPサーバーセットアップ
│   └── next.config.mjs      # ダッシュボード (Next.js)
├── hooks/
│   ├── postinstall.js       # ランタイム依存関係のインストール
│   ├── sqliteRuntime.js     # SQLiteネイティブモジュール
│   └── trayRuntime.js       # システムトレイバイナリ
├── scripts/
│   └── build-cli.js         # esbuildバンドラー
├── assets/
│   ├── logo.png
│   └── preview/
└── package.json
```

---

## ビルド

```bash
git clone https://github.com/xscope0/xScope0-Router.git
cd xScope0-Router
npm install
npm run build
npm pack
```

**要件:** Node.js >= 18.0.0

**ランタイム依存関係**（`postinstall.js`により自動インストール）:
- `sql.js` / `better-sqlite3` → `~/.9router/runtime/node_modules`
- `systray2`（macOS/Linuxのみ）→ `~/.9router/runtime/node_modules`

---

## ライセンス

MIT — オリジナルプロジェクト: [9router](https://github.com/decolua/9router)

---

<div align="center">
  <sub><a href="https://github.com/xscope0">xscope0</a> が構築</sub>
</div>
