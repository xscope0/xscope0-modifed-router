<div align="center">
  <img src="../assets/logo.png" alt="xscope0 Router" width="120">
  <h1>xscope0 Router</h1>
  <p><strong>Прокси-движок для AI API с отказоустойчивостью, сжатием токенов и автоматическим отключением.</strong></p>
  <p>Локальный прокси-сервер между вашим CLI-инструментом и AI-провайдерами. Преобразует форматы запросов, переключает аккаунты при лимитах, сжимает токены для экономии и переключается на следующего провайдера при сбое. Без телеметрии. Без внешних серверов. Всё работает на вашей машине.</p>
  <p>Работает с Claude Code, Codex, Cursor, Cline, OpenCode и любым OpenAI-совместимым клиентом. Поддерживает Kimchi, AgentRouter, GitHub Copilot, Gemini, OpenRouter, NVIDIA и другие.</p>

  <a href="https://github.com/xscope0/xScope0-Router/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/xscope0/xScope0-Router?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://github.com/xscope0/xScope0-Router/pulls"><img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square"></a>

  <br><br>

  <a href="../README.md">🇬🇧 English</a> · <a href="id.md">🇮🇩 Bahasa Indonesia</a> · <a href="vi.md">🇻🇳 Tiếng Việt</a> · <a href="zh.md">🇨🇳 中文</a> · <a href="ja.md">🇯🇵 日本語</a>
</div>

---

<div align="center">
  <img src="../assets/preview/preview-2.png" alt="Панель управления" width="32%">
  <img src="../assets/preview/preview-3.png" alt="Провайдеры" width="32%">
  <img src="../assets/preview/preview-settings.png" alt="Настройки" width="32%">
</div>

---

## Как это работает

```
┌─────────────────┐
│   Ваш CLI       │  Claude Code, Codex, Cursor, Cline, OpenCode...
│   инструмент    │
└────────┬────────┘
         │ POST http://localhost:20128/v1/chat/completions
         ↓
┌─────────────────────────────────────────────────────────────┐
│                     VansRoute Движок                        │
│                                                             │
│   1. Проверка Auth & ACL      (кэшированная валидация ключа)│
│   2. Автоматическое отключение (пропуск мёртвых прокси)     │
│   3. Семафор аккаунтов        (очередь при достижении лимита)│
│   4. Сжатие токенов           (RTK / Caveman / Ponytail)    │
│   5. Преобразование формата   (OpenAI ↔ Claude ↔ Gemini)    │
│   6. Удаление параметров      (совместимость с Kimchi CLI)  │
│   7. Исполнитель               (через прокси к провайдеру)  │
│   8. Преобразование ответа    (обратно в формат клиента)    │
│                                                             │
│   Успешно: clearProviderFailure() + clearAccountError       │
│   Ошибка:  recordProviderFailure() → счётчик отключений     │
│            markAccountUnavailable() → следующий аккаунт     │
│            Квота Kimchi? → деактивация до конца месяца      │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Kimchi              (5 моделей CLI, автореактивация квоты)
         ├─→ AgentRouter         ($200 бесплатных кредитов, транзит)
         ├─→ GitHub Copilot      (подписка)
         ├─→ Gemini / OpenCode   (бесплатный уровень)
         ├─→ OpenRouter / NVIDIA (оплата за токен)
         └─→ Combo               (резерв / раунд-робин / объём / фьюжн)
```

---

## Провайдеры

| Провайдер | Авторизация | Модели | Примечания |
|-----------|-------------|--------|------------|
| **Kimchi** | OAuth | 5 моделей CLI | Автореактивация квоты в конце месяца |
| **AgentRouter** | API-ключ | Все | $200 бесплатных кредитов, прямой транзит |
| **GitHub Copilot** | OAuth | Модели Copilot | Подписка |
| **Gemini CLI** | OAuth | Семейство Gemini | Бесплатный уровень |
| **OpenCode** | OAuth | Несколько | Бесплатный уровень |
| **OpenRouter** | API-ключ | 100+ моделей | Оплата за токен |
| **NVIDIA** | API-ключ | Endpoints NIM | Оплата за токен |
| **Combo** | — | Агрегация | Резерв / раунд-робин / фьюжн / ёмкость |

---

## Установка

```bash
npm install -g xscope0-modifed-router
xscope0-router
```

```bash
# или запустить напрямую
npx xscope0-modifed-router
```

| Endpoint | URL |
|----------|-----|
| **Панель управления** | `http://localhost:20128/dashboard` |
| **API** | `http://localhost:20128/v1` |
| **Проверка состояния** | `http://localhost:20128/health` |

---

## Возможности

**Движок маршрутизации**
- Автоматическое отключение на каждый прокси-бакет (пропуск мёртвых пулов)
- Семафор аккаунтов (ограничение одновременных запросов на провайдера)
- Преобразование форматов между протоколами OpenAI / Claude / Gemini / Kiro
- Удаление параметров совместимости Kimchi CLI
- Поддержка пулов прокси (HTTP/SOCKS5, авторотация при ошибках)

**Управление токенами**
- Сжатие RTK (request token kiln)
- Режим Caveman (сверхсжатые промпты)
- Режим Ponytail (минимальный вывод)
- Видимые логи запросов Caveman / Ponytail на панели управления

**Пул аккаунтов**
- Пакетный импорт API-ключей (добавление, не замена)
- Пакетное удаление выбранных / неактивных / деактивированных аккаунтов
- Политика провайдера `Error → неактивен`
- Принудительное удаление прокси сначала отвязывает аккаунты
- Обработка временной приостановки Kiro

**Сборка xscope0**
- Пользовательский брендинг и иконки провайдеров
- Endpoint провайдера Pi: `http://localhost:20128/v1`
- Удалены: пожертвования / удалённый UI

---

## Архитектура

```
xScope0-Router/
├── cli.js                   # Точка входа, управление процессами, трей
├── src/cli/                 # Основные модули движка
├── app/
│   ├── server.js            # API-сервер Express
│   ├── custom-server.js     # Настройка HTTP-сервера
│   └── next.config.mjs      # Панель управления (Next.js)
├── hooks/
│   ├── postinstall.js       # Установка рантайм-зависимостей
│   ├── sqliteRuntime.js     # Нативные модули SQLite
│   └── trayRuntime.js       # Бинарник системного трея
├── scripts/
│   └── build-cli.js         # Бандлер esbuild
├── assets/
│   ├── logo.png
│   └── preview/
└── package.json
```

---

## Сборка

```bash
git clone https://github.com/xscope0/xScope0-Router.git
cd xScope0-Router
npm install
npm run build
npm pack
```

**Требования:** Node.js >= 18.0.0

**Рантайм-зависимости** (автоустановка через `postinstall.js`):
- `sql.js` / `better-sqlite3` → `~/.9router/runtime/node_modules`
- `systray2` (только macOS/Linux) → `~/.9router/runtime/node_modules`

---

## Лицензия

MIT — Оригинальный проект: [9router](https://github.com/decolua/9router)

---

<div align="center">
  <sub>Создано <a href="https://github.com/xscope0">xscope0</a></sub>
</div>
