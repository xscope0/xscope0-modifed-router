<div align="center">
  <img src="../assets/logo.png" alt="xscope0 Router" width="120">
  <h1>xscope0 Router</h1>
  <p><strong>Cơ chế proxy AI với chuyển đổi dự phòng nhà cung cấp, nén token và circuit breaking.</strong></p>
  <p>Máy proxy cục bộ nằm giữa công cụ CLI và nhà cung cấp AI. Dịch định dạng request, xoay tài khoản khi bị giới hạn tốc độ, nén token để tiết kiệm chi phí và chuyển sang nhà cung cấp tiếp theo khi một nhà gặp sự cố. Không có telemetry. Không có máy chủ bên ngoài. Mọi thứ chạy trên máy của bạn.</p>
  <p>Hoạt động với Claude Code, Codex, Cursor, Cline, OpenCode và bất kỳ khách hàng tương thích OpenAI nào. Hỗ trợ Kimchi, AgentRouter, GitHub Copilot, Gemini, OpenRouter, NVIDIA và nhiều hơn nữa.</p>

  <a href="https://github.com/xscope0/xScope0-Router/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/xscope0/xScope0-Router?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/pulls"><img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square"></a>

  <br><br>

  <a href="../README.md">🇬🇧 English</a> · <a href="id.md">🇮🇩 Bahasa Indonesia</a> · <a href="zh.md">🇨🇳 中文</a> · <a href="ja.md">🇯🇵 日本語</a> · <a href="ru.md">🇷🇺 Русский</a>
</div>

---

<div align="center">
  <img src="../assets/preview/preview-2.png" alt="Dashboard" width="32%">
  <img src="../assets/preview/preview-3.png" alt="Nhà cung cấp" width="32%">
  <img src="../assets/preview/preview-settings.png" alt="Cài đặt" width="32%">
</div>

---

## Cách Hoạt Động

```
┌─────────────────┐
│   Công cụ CLI  │  Claude Code, Codex, Cursor, Cline, OpenCode...
│     của bạn     │
└────────┬────────┘
         │ POST http://localhost:20128/v1/chat/completions
         ↓
┌─────────────────────────────────────────────────────────────┐
│                     VansRoute Engine                        │
│                                                             │
│   1. Kiểm tra Auth & ACL     (xác thực API key đã cache)    │
│   2. Circuit Breaker         (bỏ qua bucket proxy chết)     │
│   3. Account Semaphore       (hàng đợi nếu đạt giới hạn)    │
│   4. Nén Token               (RTK / Caveman / Ponytail)     │
│   5. Dịch Định Dạng         (OpenAI ↔ Claude ↔ Gemini)     │
│   6. Loại bỏ Tham Số        (tương thích Kimchi CLI)        │
│   7. Executor                (upstream qua proxy nếu có)    │
│   8. Dịch Response           (trở về định dạng client)      │
│                                                             │
│   Thành công: clearProviderFailure() + clearAccountError    │
│   Lỗi:      recordProviderFailure() → đếm breaker          │
│              markAccountUnavailable() → thử tài khoản tiếp │
│              Hết quota Kimchi? → vô hiệu hóa đến hết tháng │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Kimchi              (5 mô hình CLI, tự động kích hoạt quota)
         ├─→ AgentRouter         ($200 tín dụng miễn phí, passthrough)
         ├─→ GitHub Copilot      (gói đăng ký)
         ├─→ Gemini / OpenCode   (gói miễn phí)
         ├─→ OpenRouter / NVIDIA (trả theo token)
         └─→ Combo               (dự phòng / round-robin / fusion / dung lượng)
```

---

## Nhà Cung Cấp

| Nhà cung cấp | Xác thực | Mô hình | Ghi chú |
|---------------|----------|---------|---------|
| **Kimchi** | OAuth | 5 mô hình CLI | Tự động kích hoạt quota cuối tháng |
| **AgentRouter** | API key | Tất cả | $200 tín dụng miễn phí, passthrough trực tiếp |
| **GitHub Copilot** | OAuth | Mô hình Copilot | Gói đăng ký |
| **Gemini CLI** | OAuth | Dòng Gemini | Gói miễn phí |
| **OpenCode** | OAuth | Nhiều loại | Gói miễn phí |
| **OpenRouter** | API key | 100+ mô hình | Trả theo token |
| **NVIDIA** | API key | Endpoint NIM | Trả theo token |
| **Combo** | — | Tổng hợp | Dự phòng / round-robin / fusion / dung lượng |

---

## Cài Đặt

```bash
npm install -g xscope0-modifed-router
xscope0-router
```

```bash
# hoặc chạy trực tiếp
npx xscope0-modifed-router
```

| Endpoint | URL |
|----------|-----|
| **Dashboard** | `http://localhost:20128/dashboard` |
| **API** | `http://localhost:20128/v1` |
| **Health** | `http://localhost:20128/health` |

---

## Tính Năng

**Cơ Chế Routing**
- Circuit breaker cho mỗi bucket nhà cung cấp (tự động bỏ qua pool chết)
- Semaphore tài khoản (giới hạn đồng thời cho mỗi nhà cung cấp)
- Dịch định dạng giữa các giao thức OpenAI / Claude / Gemini / Kiro
- Loại bỏ tham số tương thích Kimchi CLI
- Hỗ trợ pool proxy (HTTP/SOCKS5, xoay tự động khi lỗi)

**Quản Lý Token**
- Nén RTK (request token kiln)
- Chế độ Caveman (prompt siêu nén)
- Chế độ Ponytail (đầu ra tối thiểu)
- Nhật ký request Caveman / Ponytail hiển thị trên dashboard

**Pool Tài Khoản**
- Nhập hàng loạt API key (thêm, không thay thế)
- Xóa hàng loạt tài khoản đã chọn / không hoạt động / bị vô hiệu hóa
- Chính sách nhà cung cấp `Error → không hoạt động`
- Xóa bắt buộc proxy hủy ràng buộc tài khoản trước
- Xử lý tạm ngưng Kiro tạm thời

**Build xscope0**
- Thương hiệu tùy chỉnh và biểu tượng nhà cung cấp
- Endpoint nhà cung cấp Pi: `http://localhost:20128/v1`
- Giao diện Quyên góp / Từ xa đã loại bỏ

---

## Kiến Trúc

```
xScope0-Router/
├── cli.js                   # Entry, quản lý tiến trình, system tray
├── src/cli/                 # Các mô-đun cốt lõi
├── app/
│   ├── server.js            # Máy chủ API Express
│   ├── custom-server.js     # Thiết lập HTTP server
│   └── next.config.mjs      # Dashboard (Next.js)
├── hooks/
│   ├── postinstall.js       # Cài đặt dep runtime
│   ├── sqliteRuntime.js     # Mô-đun native SQLite
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

**Yêu cầu:** Node.js >= 18.0.0

**Dep runtime** (tự động cài đặt bởi `postinstall.js`):
- `sql.js` / `better-sqlite3` → `~/.9router/runtime/node_modules`
- `systray2` (chỉ macOS/Linux) → `~/.9router/runtime/node_modules`

---

## Giấy Phép

MIT — Dự án gốc: [9router](https://github.com/decolua/9router)

---

<div align="center">
  <sub>Xây dựng bởi <a href="https://github.com/xscope0">xscope0</a></sub>
</div>
