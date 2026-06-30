<div align="center">
  <img src="../assets/logo.png" alt="xscope0 Router" width="120">
  <h1>xscope0 Router</h1>
  <p><strong>Mesin proxy AI dengan failover provider, kompresi token, dan circuit breaking.</strong></p>
  <p>Server proxy lokal yang berada di antara tool CLI dan provider AI. Menerjemahkan format request, memutar akun saat rate-limited, mengompresi token untuk menghemat biaya, dan beralih ke provider berikutnya saat satu mati. Tidak ada telemetry. Tidak ada server eksternal. Semua berjalan di mesin Anda.</p>
  <p>Bekerja dengan Claude Code, Codex, Cursor, Cline, OpenCode, dan klien kompatibel OpenAI lainnya. Mendukung Kimchi, AgentRouter, GitHub Copilot, Gemini, OpenRouter, NVIDIA, dan lainnya.</p>

  <a href="https://github.com/xscope0/xScope0-Router/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/xscope0/xScope0-Router?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/pulls"><img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square"></a>

  <br><br>

  <a href="../README.md">🇬🇧 English</a> · <a href="vi.md">🇻🇳 Tiếng Việt</a> · <a href="zh.md">🇨🇳 中文</a> · <a href="ja.md">🇯🇵 日本語</a> · <a href="ru.md">🇷🇺 Русский</a>
</div>

---

<div align="center">
  <img src="../assets/preview/preview-2.png" alt="Dashboard" width="32%">
  <img src="../assets/preview/preview-3.png" alt="Provider" width="32%">
  <img src="../assets/preview/preview-4.png" alt="Pengaturan" width="32%">
</div>

---

## Cara Kerja

```
┌─────────────────┐
│    Tool CLI     │  Claude Code, Codex, Cursor, Cline, OpenCode...
│      Anda       │
└────────┬────────┘
         │ POST http://localhost:20128/v1/chat/completions
         ↓
┌─────────────────────────────────────────────────────────────┐
│                     VansRoute Engine                        │
│                                                             │
│   1. Cek Auth & ACL         (validasi API key di-cache)     │
│   2. Circuit Breaker        (lewati bucket proxy mati)      │
│   3. Account Semaphore      (antre jika cap concurrency)    │
│   4. Kompresi Token         (RTK / Caveman / Ponytail)      │
│   5. Terjemahan Format      (OpenAI ↔ Claude ↔ Gemini)      │
│   6. Stripping Parameter    (sesuai Kimchi CLI)             │
│   7. Executor               (upstream via proxy jika ada)   │
│   8. Terjemahan Response    (kembali ke format klien)       │
│                                                             │
│   Sukses: clearProviderFailure() + clearAccountError        │
│   Gagal:  recordProviderFailure() → hitungan breaker        │
│           markAccountUnavailable() → coba akun berikutnya   │
│           Kuota Kimchi? → nonaktifkan sampai akhir bulan    │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Kimchi              (5 model CLI, reaktivasi kuota otomatis)
         ├─→ AgentRouter         ($200 kredit gratis, passthrough)
         ├─→ GitHub Copilot      (tier berlangganan)
         ├─→ Gemini / OpenCode   (tier gratis)
         ├─→ OpenRouter / NVIDIA (bayar per token)
         └─→ Combo               (fallback / round-robin / fusion / kapasitas)
```

---

## Provider

| Provider | Autentikasi | Model | Catatan |
|----------|-------------|-------|---------|
| **Kimchi** | OAuth | 5 model CLI | Reaktivasi kuota otomatis di akhir bulan |
| **AgentRouter** | API key | Semua | $200 kredit gratis, passthrough langsung |
| **GitHub Copilot** | OAuth | Model Copilot | Tier berlangganan |
| **Gemini CLI** | OAuth | Keluarga Gemini | Tier gratis |
| **OpenCode** | OAuth | Berbagai | Tier gratis |
| **OpenRouter** | API key | 100+ model | Bayar per token |
| **NVIDIA** | API key | Endpoint NIM | Bayar per token |
| **Combo** | — | Agregat | Fallback / round-robin / fusion / kapasitas |

---

## Instalasi

```bash
npm install -g xscope0-modifed-router
xscope0-router
```

```bash
# atau jalankan langsung
npx xscope0-modifed-router
```

| Endpoint | URL |
|----------|-----|
| **Dashboard** | `http://localhost:20128/dashboard` |
| **API** | `http://localhost:20128/v1` |
| **Health** | `http://localhost:20128/health` |

---

## Fitur

**Mesin Routing**
- Circuit breaker per bucket provider (lewati pool mati secara otomatis)
- Semaphore akun (batas concurrency per provider)
- Terjemahan format antara protokol OpenAI / Claude / Gemini / Kiro
- Stripping parameter sesuai Kimchi CLI
- Dukungan pool proxy (HTTP/SOCKS5, rotasi otomatis saat error)

**Manajemen Token**
- Kompresi RTK (request token kiln)
- Mode Caveman (prompt ultra-terkompresi)
- Mode Ponytail (output minimal)
- Log request Caveman / Ponytail terlihat di dashboard

**Pool Akun**
- Impor API key massal (menambah, tidak mengganti)
- Hapus massal akun terpilih / tidak aktif / dinonaktifkan
- Kebijakan provider `Error → tidak aktif`
- Hapus paksa proxy membatalkan ikatan akun terlebih dahulu
- Penanganan penangguhan sementara Kiro

**Build xscope0**
- Branding kustom dan ikon provider
- Endpoint provider Pi: `http://localhost:20128/v1`
- UI Donasi / Remote dihapus

---

## Arsitektur

```
xScope0-Router/
├── cli.js                   # Entry, manajemen proses, system tray
├── src/cli/                 # Modul mesin inti
├── app/
│   ├── server.js            # Server API Express
│   ├── custom-server.js     # Setup HTTP server
│   └── next.config.mjs      # Dashboard (Next.js)
├── hooks/
│   ├── postinstall.js       # Instalasi dep runtime
│   ├── sqliteRuntime.js     # Modul native SQLite
│   └── trayRuntime.js       # Binary system tray
├── scripts/
│   └── build-cli.js         # Bundler esbuild
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

**Persyaratan:** Node.js >= 18.0.0

**Dep runtime** (diinstal otomatis oleh `postinstall.js`):
- `sql.js` / `better-sqlite3` → `~/.9router/runtime/node_modules`
- `systray2` (macOS/Linux saja) → `~/.9router/runtime/node_modules`

---

## Lisensi

MIT — Proyek asli: [9router](https://github.com/decolua/9router)

---

<div align="center">
  <sub>Dibuat oleh <a href="https://github.com/xscope0">xscope0</a></sub>
</div>
