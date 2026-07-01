# Multi WhatsApp Ghost Preload Patch

Local patch map for `/Applications/Multi WhatsApp.app`. It documents exactly what was changed inside `app.asar`, why it works, and how to install the same patched files again.

No server. No extension. No new runtime dependency inside Electron. The patch lives in preload and the bundled Vite build files.

## What is packed here

```text
packages/multi-whatsapp-ghost/
├── README.md
├── package.json
├── scripts/
│   └── install-patched-asar.mjs
└── patched/
    └── vite-build/
        ├── ghost-hooks.js
        ├── ghost-meta-hooks.js
        ├── main.js
        └── view-preload.js
```

These map into the installed Electron ASAR like this:

```text
/Applications/Multi WhatsApp.app/Contents/Resources/app.asar
└── .vite/build/
    ├── ghost-hooks.js          -> patched/vite-build/ghost-hooks.js
    ├── ghost-meta-hooks.js     -> patched/vite-build/ghost-meta-hooks.js
    ├── main.js                 -> patched/vite-build/main.js
    └── view-preload.js         -> patched/vite-build/view-preload.js
```

## What each file does

| File | Job |
|---|---|
| `view-preload.js` | Earliest stable hook point. Boots ghost hooks before WhatsApp captures browser/native send APIs. Installs persistent setter traps instead of repeat-inject polling. |
| `ghost-hooks.js` | Transport-level blocker. Wraps `WebSocket` and blocks outbound read, delivery, presence, story-read, and related receipt frames. |
| `ghost-meta-hooks.js` | WhatsApp module/node-level blocker. Scans module-like senders and blocks stanza/node objects before encryption where reachable. Exposes diagnostics on `window.__gh_meta*`. |
| `main.js` | Electron main-process support. Loads settings, injects fallback hook code, propagates ghost flags into every WhatsApp view, keeps signing-compatible app flow. |

## Why this is possible

Electron apps usually ship app code in `Contents/Resources/app.asar`. `Multi WhatsApp.app` loads WhatsApp Web inside Electron views. Its preload script runs before the page app finishes booting, so it can patch browser APIs that WhatsApp later uses.

The leak happened because late injection missed WhatsApp's native/framework capture path. WhatsApp grabbed references before the old hook owned them. The working route is early preload ownership:

```text
Electron preload starts
  ↓
Install one-shot setter traps on native send surfaces
  ↓
WhatsApp framework assigns/captures WebSocket/import/module globals
  ↓
Trap fires and boots ghost hooks at capture time
  ↓
Outbound read/delivery/story/presence frames are dropped before send
```

This version does **not** run a 25ms injection loop. It installs persistent traps once:

- `window.WebSocket`
- `window.require`
- WhatsApp webpack chunk globals
- `crypto.subtle.importKey`

Then it boots once immediately and once at `DOMContentLoaded`. Late framework assignment triggers the trap without allocating another interval or repeatedly injecting large strings.

## Privacy blocks included

Implemented in the patched files:

- hide online presence sends
- block read receipts / blue checks
- block delivery receipts / gray double-check path where detected
- block story seen/read receipts
- block typing/composing chatstate
- keep unavailable/offline presence allowed
- keep normal message frames allowed
- hide WhatsApp Web buttons for Status, Channels, Communities, Meta AI

## Install on macOS

From repo root:

```bash
cd packages/multi-whatsapp-ghost
npm run check
npm run install:mac
open -a "/Applications/Multi WhatsApp.app"
```

Default paths:

```text
App:  /Applications/Multi WhatsApp.app
Work: /tmp/multi-whatsapp-ghost-asar
```

Override if needed:

```bash
MULTI_WHATSAPP_APP="/Applications/Multi WhatsApp.app" \
MULTI_WHATSAPP_WORK="/tmp/mw-asar" \
npm run install:mac
```

The installer:

1. extracts installed `app.asar`
2. overlays the four patched `.vite/build` files
3. repacks `app.asar`
4. quits the app if running
5. ad-hoc re-signs the app
6. verifies the signature

## Manual install

```bash
npx asar extract "/Applications/Multi WhatsApp.app/Contents/Resources/app.asar" /tmp/mw-work
cp patched/vite-build/*.js /tmp/mw-work/.vite/build/
npx asar pack /tmp/mw-work "/Applications/Multi WhatsApp.app/Contents/Resources/app.asar"
osascript -e 'tell application "Multi WhatsApp" to quit'
codesign --force --deep --sign - "/Applications/Multi WhatsApp.app"
codesign --verify --deep --strict "/Applications/Multi WhatsApp.app"
open -a "/Applications/Multi WhatsApp.app"
```

## Runtime checks

Open DevTools/CDP for the WhatsApp view and inspect:

```js
window.__getGhost?.()
window.__GHOST_HOOKS_INITIALIZED__
window.__gh_meta
window.__gh_meta_ready
window.__gh_meta_node_senders
window.__gh_meta_hooked
window.__gh_preload_traps
```

Expected baseline:

```js
window.__GHOST_HOOKS_INITIALIZED__ === true
window.__gh_preload_traps === true
window.__getGhost().r === true
window.__getGhost().d === true
window.__getGhost().s === true
```

`window.__gh_meta_node_senders` may be `0` if the module scanner ran before WhatsApp exposed sender modules. That is not fatal; the preload/WebSocket/native trap path is the important part.

## Verification already run

On the patched local app:

```bash
node --check /tmp/mw-work/.vite/build/view-preload.js
node --check /tmp/mw-work/.vite/build/main.js
node --check /tmp/mw-work/.vite/build/ghost-meta-hooks.js
codesign --verify --deep --strict "/Applications/Multi WhatsApp.app"
npx asar extract "/Applications/Multi WhatsApp.app/Contents/Resources/app.asar" /tmp/mw-packed-check
node --check /tmp/mw-packed-check/.vite/build/view-preload.js
```

All exited cleanly.

User live test after preload injection reported working. After the trap-only cleanup, syntax/signature/package verification is clean; live privacy behavior should be rechecked after app relaunch.

## Limits

This is a local Electron patch, not a WhatsApp protocol fork. WhatsApp can change its web bundle at any time. If leaks return, inspect runtime globals first, then add bounded diagnostics for trap-fire count and blocked outbound frames. Do not bring back interval polling unless traps stop firing entirely.

This repo does not ship the full proprietary `app.asar` or WhatsApp code. It ships only the modified JavaScript files needed to reproduce the local patch.
