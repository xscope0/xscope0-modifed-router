'use strict';

const { ipcRenderer, webFrame } = require('electron');
let fs = null;
let path = null;
try { fs = require('fs'); path = require('path'); } catch (e) {}

window.addEventListener('message', function(event) {
  try {
    const msg = event.data;
    if (msg && msg.__ghostDiag) ipcRenderer.send('ghost-diag', msg);
  } catch (e) {}
});

// ── Read per-tab fingerprint from additionalArguments ──────
let fpProfile = null;
try {
  const fpArg = process.argv.find(function(a) { return a.indexOf('--fingerprint=') === 0; });
  if (fpArg) fpProfile = JSON.parse(fpArg.substring(14));
} catch (e) {}

const fp = fpProfile || {
  sw: 1920, sh: 1080, aw: 1920, ah: 1040,
  glr: 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)',
  glv: 'Google Inc. (Intel)',
  cn: 42069, an: 13370,
  hc: 8, dm: 8,
  lang: ['en-US', 'en'],
  hist: 5
};

let initialGhost = { ghostTyping: false, ghostRead: false, ghostStories: false, ghostDelivery: false, ghostAntiRevoke: false, ghostCallBlock: false, ghostRecoverDelete: false };
try {
  const ghostArg = process.argv.find(function(a) { return a.indexOf('--ghost=') === 0; });
  if (ghostArg) initialGhost = JSON.parse(ghostArg.substring(8));
} catch (e) {}

function injectMainWorld(code) {
  try {
    const script = document.createElement('script');
    script.textContent = code;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
    return true;
  } catch (e) {
    return false;
  }
}

// Inject ghost hooks from preload before WhatsApp's framework captures native senders.
const ghostSettingsCode = 'if(window.__setGhost) window.__setGhost({t:' + !!initialGhost.ghostTyping + ',r:' + !!initialGhost.ghostRead + ',s:' + !!initialGhost.ghostStories + ',d:' + !!initialGhost.ghostDelivery + ',a:' + !!initialGhost.ghostAntiRevoke + ',c:' + !!initialGhost.ghostCallBlock + ',x:' + !!initialGhost.ghostRecoverDelete + '});';
const ghostBootCode = "// ghost-hooks.js — WhatsApp Web ghost features via WebSocket hijacking\n(function() {\n  'use strict';\n\n  if (window.__gh_init) return;\n  window.__gh_init = true;\n\n  var _typing = false;\n  var _read = false;\n  var _stories = false;\n  var _delivery = false;\n  var _antiRevoke = false;\n  var _callBlock = false;\n  var _recoverDelete = false;\n\n  Object.defineProperty(window, '__GHOST_HOOKS_INITIALIZED__', { value: true, enumerable: false, configurable: false });\n  Object.defineProperty(window, '__gh_init', { enumerable: false, configurable: false });\n\n  window.__setGhost = function(gs) {\n    if (!gs || typeof gs !== 'object') return;\n    _typing = !!gs.t;\n    _read = !!gs.r;\n    _stories = !!gs.s;\n    _delivery = !!gs.d;\n    _antiRevoke = !!gs.a;\n    _callBlock = !!gs.c;\n    _recoverDelete = !!gs.x;\n  };\n\n  window.__getGhost = function() {\n    return { t: _typing, r: _read, s: _stories, d: _delivery, a: _antiRevoke, c: _callBlock, x: _recoverDelete };\n  };\n\n  var METRIC_PRESENCE = 8;\n  var METRIC_READ = 11;\n  var METRIC_RECEIVED = 13;\n  var PRESENCE_AVAILABLE_BIT = 5;\n  var TYPING_STRS = ['composing', 'typing', 'chatstate', 'setcomposing', 'sendpresencecomposing'];\n  var READ_STRS = ['read\"', \"read'\", 'type\":\"read', \"type':'read\", 'readreceipt', 'read_receipt', 'sendseen', 'markseen'];\n  var DELIVERY_STRS = ['received\"', \"received'\", 'type\":\"received', \"type':'received\", 'delivery', 'receipt', 'sendreceipt'];\n  var STORY_STRS = ['status_view', 'readstatus', 'status_read', 'sendstatusread', 'viewstatus', 'statusv3', 'status@broadcast'];\n\n  function parseBinaryNode(data) {\n    try {\n      var bytes = null;\n      if (data instanceof Uint8Array) bytes = data;\n      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);\n      else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);\n      if (!bytes) return null;\n\n      var comma = -1;\n      for (var i = 0; i < Math.min(bytes.length, 32); i++) {\n        if (bytes[i] === 0x2C) { comma = i; break; }\n      }\n      if (comma < 0 || comma + 2 >= bytes.length) return null;\n\n      var bitvector = bytes[comma + 2];\n      return {\n        metric: bytes[comma + 1],\n        available: ((bitvector >> PRESENCE_AVAILABLE_BIT) & 1) === 1\n      };\n    } catch (e) {\n      return null;\n    }\n  }\n\n  function dataToText(data) {\n    if (typeof data === 'string') return data;\n    try {\n      if (data instanceof ArrayBuffer) return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(data));\n      if (ArrayBuffer.isView(data)) return new TextDecoder('utf-8', { fatal: false }).decode(data);\n    } catch (e) {}\n    return '';\n  }\n\n  function hasAny(text, patterns) {\n    for (var i = 0; i < patterns.length; i++) {\n      if (text.indexOf(patterns[i]) !== -1) return true;\n    }\n    return false;\n  }\n\n  function shouldDropText(data) {\n    var lower = dataToText(data).toLowerCase();\n    if (!lower) return false;\n    if (_typing && hasAny(lower, TYPING_STRS)) return true;\n    if (_stories && hasAny(lower, STORY_STRS) && hasAny(lower, READ_STRS.concat(DELIVERY_STRS))) return true;\n    if (_read && hasAny(lower, READ_STRS)) return true;\n    if (_delivery && hasAny(lower, DELIVERY_STRS) && lower.indexOf('message') === -1) return true;\n    return false;\n  }\n\n  var BASE_WEBSOCKET = WebSocket;\n\n  function hijackedSend() {\n    var data = arguments[0];\n\n    try {\n      var parsed = parseBinaryNode(data);\n      if (parsed) {\n        if (_typing && parsed.metric === METRIC_PRESENCE && parsed.available) return;\n        if (_read && parsed.metric === METRIC_READ) return;\n        if (_delivery && parsed.metric === METRIC_RECEIVED) return;\n      }\n      if (shouldDropText(data)) return;\n    } catch (e) {}\n\n    return BASE_WEBSOCKET.prototype.send.apply(this, arguments);\n  }\n\n  function WrappedWebSocket() {\n    var base = Reflect.construct(BASE_WEBSOCKET, arguments);\n    base.send = hijackedSend;\n    return base;\n  }\n\n  WrappedWebSocket.prototype = BASE_WEBSOCKET.prototype;\n  WrappedWebSocket.CONNECTING = BASE_WEBSOCKET.CONNECTING;\n  WrappedWebSocket.OPEN = BASE_WEBSOCKET.OPEN;\n  WrappedWebSocket.CLOSING = BASE_WEBSOCKET.CLOSING;\n  WrappedWebSocket.CLOSED = BASE_WEBSOCKET.CLOSED;\n\n  try {\n    Object.defineProperty(window, 'WebSocket', { value: WrappedWebSocket, writable: true, configurable: true });\n  } catch (e) {\n    window.WebSocket = WrappedWebSocket;\n  }\n  WebSocket = WrappedWebSocket;\n})();\n\nif(window.__setGhost) window.__setGhost({t:true,r:true,s:true,d:true,a:true,c:true,x:true});\n// ghost-meta-hooks.js — module-level ghost hooks\n// Discovers WA modules by shape predicate and blocks privacy stanzas before encryption.\n(function() {\n  'use strict';\n  if (window.__gh_meta) return;\n  window.__gh_meta = true;\n\n  function getGhost() {\n    try { return window.__getGhost ? window.__getGhost() : {}; } catch(e) { return {}; }\n  }\n\n  function log(message, data) {\n    try {\n      var payload = data === undefined ? '' : ' ' + JSON.stringify(data).slice(0, 500);\n      console.info('[ghost-diag] ' + message + payload);\n    } catch(e) {}\n  }\n\n  function wrap(obj, fnName, key) {\n    var orig = obj && obj[fnName];\n    if (typeof orig !== 'function' || orig.__gh) return false;\n    var wrapped = function() {\n      if (getGhost()[key]) return Promise.resolve();\n      return orig.apply(this, arguments);\n    };\n    wrapped.__gh = true;\n    wrapped.__gh_orig = orig;\n    try { obj[fnName] = wrapped; return true; } catch(e) { return false; }\n  }\n\n  function normalize(value) {\n    if (value == null) return '';\n    try { return String(value).toLowerCase(); } catch(e) { return ''; }\n  }\n\n  function isNode(value) {\n    return value && typeof value === 'object' && typeof value.tag === 'string' && value.attrs && typeof value.attrs === 'object';\n  }\n\n  function isStoryNode(node) {\n    var attrs = node.attrs || {};\n    var text = [attrs.jid, attrs.to, attrs.from, attrs.participant, attrs.id, node.tag].map(normalize).join(' ');\n    return text.indexOf('status@broadcast') !== -1 || text.indexOf('statusv3') !== -1;\n  }\n\n  function shouldBlockNode(node) {\n    if (!isNode(node)) return false;\n    var ghost = getGhost();\n    var tag = normalize(node.tag);\n    var attrs = node.attrs || {};\n    var type = normalize(attrs.type);\n\n    if (ghost.r && tag === 'read') return true;\n    if (ghost.r && tag === 'receipt' && (type === 'read' || type === 'read-self' || type === 'played')) return true;\n    if (ghost.r && tag === 'received' && type === 'played') return true;\n\n    if (ghost.d && (tag === 'receipt' || tag === 'received') && (type === 'received' || type === 'delivery' || !type)) return true;\n\n    if (ghost.s && isStoryNode(node) && (tag === 'read' || tag === 'receipt' || tag === 'received' || type === 'read' || type === 'played' || type === 'received')) return true;\n\n    if (ghost.t && tag === 'presence' && (type === 'available' || type === 'composing' || type === 'recording' || !type)) return true;\n    if (ghost.t && tag === 'chatstate') return true;\n\n    return false;\n  }\n\n  function findBlockedNode(value, depth) {\n    if (depth > 5 || value == null) return null;\n    if (isNode(value) && shouldBlockNode(value)) return value;\n    if (Array.isArray(value)) {\n      for (var i = 0; i < value.length; i++) {\n        var inArray = findBlockedNode(value[i], depth + 1);\n        if (inArray) return inArray;\n      }\n      return null;\n    }\n    if (typeof value !== 'object') return null;\n    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return null;\n    var keys;\n    try { keys = Object.keys(value); } catch(e) { return null; }\n    for (var j = 0; j < keys.length; j++) {\n      var key = keys[j];\n      if (key === 'default' || key === '__esModule') continue;\n      var found = findBlockedNode(value[key], depth + 1);\n      if (found) return found;\n    }\n    return null;\n  }\n\n  function wrapNodeSender(obj, fnName) {\n    var orig = obj && obj[fnName];\n    if (typeof orig !== 'function' || orig.__gh_node) return false;\n    var wrapped = function() {\n      var blocked = null;\n      for (var i = 0; i < arguments.length; i++) {\n        blocked = findBlockedNode(arguments[i], 0);\n        if (blocked) break;\n      }\n      if (blocked) {\n        log('blocked-node', { fn: fnName, tag: blocked.tag, type: blocked.attrs && blocked.attrs.type, to: blocked.attrs && (blocked.attrs.to || blocked.attrs.jid || blocked.attrs.from) });\n        return Promise.resolve();\n      }\n      return orig.apply(this, arguments);\n    };\n    wrapped.__gh_node = true;\n    wrapped.__gh_orig = orig;\n    try { obj[fnName] = wrapped; return true; } catch(e) { return false; }\n  }\n\n  var TARGETS = [\n    { key: 'r', fns: ['sendSeen', 'sendSeenDebounced'],\n      pred: function(m) { return m && typeof m.sendSeen === 'function' && typeof m.markUnread === 'function'; } },\n    { key: 'd', fns: ['sendReceipt', 'sendAggregateReceipts', 'sendDeliveryReceipts'],\n      pred: function(m) { return m && (typeof m.sendReceipt === 'function' || typeof m.sendAggregateReceipts === 'function'); } },\n    { key: 't', fns: ['sendPresenceAvailable', 'sendPresenceUnavailable', 'markComposing', 'markPaused', 'markRecording', 'sendChatStateComposing', 'sendChatStatePaused', 'sendChatStateRecording'],\n      pred: function(m) { return m && (typeof m.sendPresenceAvailable === 'function' || typeof m.markComposing === 'function' || typeof m.sendChatStateComposing === 'function'); } },\n    { key: 's', fns: ['sendReadStatus', 'sendStatusRead', 'sendPresenceStatusProtocol'],\n      pred: function(m) { return m && (typeof m.sendReadStatus === 'function' || typeof m.sendPresenceStatusProtocol === 'function'); } },\n    { key: 'a', fns: ['processRevokeMsgs', 'processSentRevokeMsg', 'processRevokeMsg'],\n      pred: function(m) { return m && (typeof m.processRevokeMsgs === 'function' || typeof m.processRevokeMsg === 'function'); } },\n    { key: 'c', fns: ['handleCall', 'handleCallReceipt', 'handleVoipCall', 'offerCall'],\n      pred: function(m) { return m && (typeof m.handleCall === 'function' || typeof m.handleVoipCall === 'function'); } },\n    { key: 'x', fns: ['processDeleteForMe', 'processDeleteForMeSingle'],\n      pred: function(m) { return m && typeof m.processDeleteForMe === 'function'; } }\n  ];\n\n  var HINT_NAMES = {\n    r: ['WAWebUpdateUnreadChatAction', 'WAWebMarkSeen'],\n    d: ['WAWebHandleMsgSendReceipt', 'WAWebSendReceiptJobCommon'],\n    t: ['WAWebPresenceChatAction', 'WAWebChatStateBridge', 'WASendChatStateProtocol'],\n    s: ['WAWebContactStatusBridge', 'WASendPresenceStatusProtocol'],\n    a: ['WAWebAddonProcessRevoke', 'WAWebProcessRevoke'],\n    c: ['WAWebHandleVoipCall', 'WAWebHandleVoipCallReceipt'],\n    x: ['WAWebAddonProcessDeleteForMe', 'WAWebProcessDeleteForMe']\n  };\n\n  var NODE_SENDER_NAMES = ['sendNode', 'sendStanza', 'sendIq', 'query', 'sendQuery', 'send', 'write', 'sendFrame'];\n\n  function tryImport(id) {\n    try { if (typeof importNamespace === 'function') return importNamespace(id); } catch(e) {}\n    try { if (typeof self.require === 'function') return self.require(id); } catch(e) {}\n    return null;\n  }\n\n  function getAllModuleIds() {\n    try {\n      if (typeof self.require === 'function') {\n        var dbg = self.require('__debug');\n        if (dbg && dbg.modulesMap) return Object.keys(dbg.modulesMap);\n      }\n    } catch(e) {}\n    return null;\n  }\n\n  function scanObject(obj, state) {\n    if (!obj || typeof obj !== 'object') return;\n    TARGETS.forEach(function(t) {\n      if (!state.done[t.key] && t.pred(obj)) {\n        var hooked = 0;\n        t.fns.forEach(function(fn) { if (wrap(obj, fn, t.key)) hooked++; });\n        if (hooked > 0) state.done[t.key] = true;\n      }\n    });\n    NODE_SENDER_NAMES.forEach(function(fn) {\n      if (wrapNodeSender(obj, fn)) state.nodeSenders++;\n    });\n  }\n\n  function scanModule(mod, state) {\n    scanObject(mod, state);\n    if (!mod || typeof mod !== 'object') return;\n    var keys;\n    try { keys = Object.keys(mod); } catch(e) { return; }\n    for (var i = 0; i < keys.length; i++) {\n      var v = mod[keys[i]];\n      if (v && typeof v === 'object') scanObject(v, state);\n    }\n  }\n\n  function tryHookAll(state) {\n    try { if (typeof ErrorGuard !== 'undefined') ErrorGuard.skipGuardGlobal(true); } catch(e) {}\n\n    TARGETS.forEach(function(t) {\n      if (state.done[t.key]) return;\n      var hints = HINT_NAMES[t.key] || [];\n      for (var i = 0; i < hints.length; i++) {\n        var m = tryImport(hints[i]);\n        if (m) scanModule(m, state);\n        if (state.done[t.key]) break;\n      }\n    });\n\n    if (!state.scannedAll) {\n      var ids = getAllModuleIds();\n      if (ids) {\n        state.scannedAll = true;\n        for (var j = 0; j < ids.length; j++) {\n          var id = ids[j];\n          if (!/^(?:use)?WA/.test(id)) continue;\n          var mod = tryImport(id);\n          if (mod) scanModule(mod, state);\n        }\n        log('meta-scan', { hooked: state.done, nodeSenders: state.nodeSenders });\n      }\n    }\n\n    window.__gh_meta_hooked = Object.keys(state.done).filter(function(k){return state.done[k];}).length;\n    window.__gh_meta_node_senders = state.nodeSenders;\n    return TARGETS.every(function(t) { return state.done[t.key]; }) && state.nodeSenders > 0;\n  }\n\n  var state = { done: {}, scannedAll: false, nodeSenders: 0 };\n  var attempts = 0;\n  var poll = setInterval(function() {\n    attempts++;\n    if (tryHookAll(state) || attempts > 120) {\n      clearInterval(poll);\n      window.__gh_meta_ready = true;\n      log('meta-ready', { hooked: state.done, nodeSenders: state.nodeSenders, attempts: attempts });\n    }\n  }, 500);\n})();\n\nif(window.__setGhost) window.__setGhost({t:true,r:true,s:true,d:true,a:true,c:true,x:true});".replace(/window\.__setGhost\(\{t:true,r:true,s:true,d:true,a:true,c:true,x:true\}\);/g, ghostSettingsCode);

function installGhostApiTraps() {
  const trapCode = `(function() {
    'use strict';
    if (window.__gh_preload_traps) return;
    window.__gh_preload_traps = true;

    function bootSoon() {
      try {
        if (window.__gh_boot_once) window.__gh_boot_once();
      } catch (e) {}
      try {
        Promise.resolve().then(function() {
          try { if (window.__gh_boot_once) window.__gh_boot_once(); } catch (e) {}
        });
      } catch (e) {}
    }

    function installValueTrap(target, name) {
      try {
        var current = target[name];
        Object.defineProperty(target, name, {
          configurable: true,
          get: function() { return current; },
          set: function(next) { current = next; bootSoon(); }
        });
      } catch (e) {}
    }

    installValueTrap(window, 'WebSocket');
    installValueTrap(window, 'require');
    installValueTrap(window, 'webpackChunkwhatsapp_web_client');
    installValueTrap(window, 'webpackChunkbuild');
    if (window.crypto && window.crypto.subtle) installValueTrap(window.crypto.subtle, 'importKey');
  })();`;
  webFrame.executeJavaScript(trapCode).catch(function(){});
  injectMainWorld(trapCode);
}

function injectGhostBoot() {
  const code = 'window.__gh_boot_once=function(){' + ghostBootCode + '};window.__gh_boot_once();';
  webFrame.executeJavaScript(code).catch(function(){});
  injectMainWorld(code);
}

installGhostApiTraps();
injectGhostBoot();
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', injectGhostBoot, { once: true });
}

const fpJSON = JSON.stringify(fp);

// ── Core Fingerprint + Stealth Injection ────────────────────
webFrame.executeJavaScript(`
(function() {
  'use strict';
  if (window.__s_init) return;
  window.__s_init = true;

  var fp = ` + fpJSON + `;

  // ── Seeded PRNG (for canvas/audio noise) ──
  var _seed_a = fp.cn || 42069;
  var _seed_b = fp.an || 13370;
  function nextNoise(seedRef) {
    seedRef.v |= 0;
    seedRef.v = seedRef.v + 0x6D2B79F5 | 0;
    var t = Math.imul(seedRef.v ^ seedRef.v >>> 15, 1 | seedRef.v);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  var seedA = { v: _seed_a };
  var seedB = { v: _seed_b };

  function defineProp(obj, prop, val, desc) {
    try {
      Object.defineProperty(obj, prop, Object.assign({ configurable: true }, desc || { get: function() { return val; } }));
      return true;
    } catch(e) { return false; }
  }

  // ── 1. NAVIGATOR ──
  defineProp(navigator, 'platform', 'Linux x86_64');
  defineProp(navigator, 'vendor', 'Google Inc.');
  defineProp(navigator, 'hardwareConcurrency', fp.hc);
  defineProp(navigator, 'deviceMemory', fp.dm);
  defineProp(navigator, 'maxTouchPoints', 0);
  defineProp(navigator, 'webdriver', false);
  defineProp(navigator, 'languages', fp.lang);
  defineProp(navigator, 'language', fp.lang[0]);
  defineProp(navigator, 'userAgent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  defineProp(navigator, 'appVersion', '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  defineProp(navigator, 'oscpu', 'Linux x86_64');
  defineProp(navigator, 'cookieEnabled', true);
  defineProp(navigator, 'doNotTrack', null);
  defineProp(navigator, 'pdfViewerEnabled', true);

  // Plugins (Linux Chrome typical set)
  var _plugins = [
    { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf', suffixes: 'pdf' }, 1: { type: 'text/pdf', suffixes: 'pdf' } },
    { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf', suffixes: 'pdf' }, 1: { type: 'text/pdf', suffixes: 'pdf' } },
    { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf', suffixes: 'pdf' }, 1: { type: 'text/pdf', suffixes: 'pdf' } },
    { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf', suffixes: 'pdf' }, 1: { type: 'text/pdf', suffixes: 'pdf' } },
    { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf', suffixes: 'pdf' }, 1: { type: 'text/pdf', suffixes: 'pdf' } }
  ];
  _plugins.length = 5;
  defineProp(navigator, 'plugins', _plugins);
  defineProp(navigator, 'mimeTypes', [
    { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
  ]);

  // Connection API
  defineProp(navigator, 'connection', {
    effectiveType: '4g', rtt: 20, downlink: 50, saveData: false,
    addEventListener: function(){}, removeEventListener: function(){}
  });

  // Battery API (desktop always charging)
  navigator.getBattery = function() {
    return Promise.resolve({
      charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0,
      addEventListener: function(){}, removeEventListener: function(){},
      onchargingchange: null, onchargingtimechange: null, ondischargingtimechange: null, onlevelchange: null
    });
  };

  // ── 2. SCREEN (per-tab randomized) ──
  defineProp(screen, 'width', fp.sw);
  defineProp(screen, 'height', fp.sh);
  defineProp(screen, 'availWidth', fp.aw);
  defineProp(screen, 'availHeight', fp.ah);
  defineProp(screen, 'colorDepth', 24);
  defineProp(screen, 'pixelDepth', 24);

  // innerWidth/innerHeight — must match screen for desktop Chrome
  defineProp(window, 'innerWidth', fp.sw);
  defineProp(window, 'innerHeight', fp.sh);
  defineProp(window, 'outerWidth', fp.sw);
  defineProp(window, 'outerHeight', fp.sh);
  defineProp(window, 'screenX', 0);
  defineProp(window, 'screenY', 0);
  defineProp(window, 'screenLeft', 0);
  defineProp(window, 'screenTop', 0);
  defineProp(window, 'devicePixelRatio', 1);

  // ── 3. WEBGL (per-tab randomized GPU) ──
  var _glVendor = fp.glv;
  var _glRenderer = fp.glr;
  var _origGetParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 0x9245) return _glVendor;   // UNMASKED_VENDOR_WEBGL
    if (param === 0x9246) return _glRenderer;  // UNMASKED_RENDERER_WEBGL
    return _origGetParam.call(this, param);
  };
  if (typeof WebGL2RenderingContext !== 'undefined') {
    var _origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      if (param === 0x9245) return _glVendor;
      if (param === 0x9246) return _glRenderer;
      return _origGetParam2.call(this, param);
    };
  }

  // ── 4. CANVAS FINGERPRINT (per-tab seeded noise) ──
  var _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  var _origToBlob = HTMLCanvasElement.prototype.toBlob;
  var _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  function addCanvasNoise(canvas) {
    try {
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var imgData = _origGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
      var d = imgData.data;
      var s = { v: seedA.v };
      for (var i = 0; i < d.length; i += 4) {
        var n = (nextNoise(s) - 0.5) * 2;
        d[i]   = Math.max(0, Math.min(255, d[i] + Math.round(n)));
        d[i+1] = Math.max(0, Math.min(255, d[i+1] + Math.round(n)));
        d[i+2] = Math.max(0, Math.min(255, d[i+2] + Math.round(n)));
      }
      ctx.putImageData(imgData, 0, 0);
    } catch(e) {}
  }

  HTMLCanvasElement.prototype.toDataURL = function() {
    addCanvasNoise(this);
    return _origToDataURL.apply(this, arguments);
  };
  HTMLCanvasElement.prototype.toBlob = function() {
    addCanvasNoise(this);
    return _origToBlob.apply(this, arguments);
  };

  // ── 5. AUDIO CONTEXT FINGERPRINT (per-tab seeded noise) ──
  var _AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (_AudioCtx) {
    var _origCreateOsc = _AudioCtx.prototype.createOscillator;
    var _origCreateDyn = _AudioCtx.prototype.createDynamicsCompressor;
    var _origOfflineSR = OfflineAudioContext.prototype.startRendering;

    OfflineAudioContext.prototype.startRendering = function() {
      var promise = _origOfflineSR.call(this);
      return promise.then(function(buffer) {
        try {
          var s = { v: seedB.v };
          for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
            var data = buffer.getChannelData(ch);
            for (var i = 0; i < data.length; i++) {
              data[i] += (nextNoise(s) - 0.5) * 1e-5;
            }
          }
        } catch(e) {}
        return buffer;
      });
    };
  }

  // ── 6. WEBRTC BLOCK (WhatsApp Web doesn't use WebRTC) ──
  var _noop = function() {};
  var _fakePc = function() {
    throw new DOMException('Failed to construct RTCPeerConnection', 'NotSupportedError');
  };
  window.RTCPeerConnection = _fakePc;
  window.webkitRTCPeerConnection = _fakePc;
  window.RTCSessionDescription = _noop;
  window.RTCIceCandidate = _noop;
  if (window.mozRTCPeerConnection) window.mozRTCPeerConnection = _fakePc;

  // ── 7. FONT ENUMERATION PROTECTION ──
  var _allowedFonts = [
    'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
    'Impact', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    'Liberation Sans', 'Liberation Serif', 'Liberation Mono',
    'DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono',
    'Noto Sans', 'Noto Serif', 'Noto Color Emoji',
    'Roboto', 'Droid Sans', 'Droid Serif', 'Droid Sans Mono',
    'Ubuntu', 'Ubuntu Mono', 'Cantarell', 'sans-serif', 'serif', 'monospace'
  ];
  var _origCheck = document.fonts.check.bind(document.fonts);
  document.fonts.check = function(font, text) {
    var family = (font || '').replace(/['"]/g, '').split(' ').pop();
    if (_allowedFonts.indexOf(family) !== -1) return true;
    return false;
  };

  // ── 8. HISTORY.LENGTH FIX ──
  try {
    var targetLen = fp.hist;
    var currentLen = history.length;
    if (currentLen < targetLen) {
      for (var hi = currentLen; hi < targetLen; hi++) {
        history.pushState(null, '', location.href);
      }
      history.replaceState(null, '', location.href);
    }
  } catch(e) {}

  // Patch history.pushState/replaceState to prevent tampering detection
  var _origPush = history.pushState;
  var _origReplace = history.replaceState;
  history.pushState = function() { return _origPush.apply(this, arguments); };
  history.replaceState = function() { return _origReplace.apply(this, arguments); };

  // ── 9. MOUSEEVENT SCREENX/SCREENY FIX ──
  var _OrigMouseEvent = window.MouseEvent;
  var _meScreenX = 0, _meScreenY = 0;

  window.addEventListener('mousemove', function(e) {
    _meScreenX = e.clientX + (window.screenX || 0);
    _meScreenY = e.clientY + (window.screenY || 0) + 40;
  }, true);

  window.MouseEvent = function(type, params) {
    var p = params || {};
    if (p.screenX === undefined) p.screenX = (p.clientX || 0) + (window.screenX || 0);
    if (p.screenY === undefined) p.screenY = (p.clientY || 0) + (window.screenY || 0) + 40;
    return new _OrigMouseEvent(type, p);
  };
  window.MouseEvent.prototype = _OrigMouseEvent.prototype;
  Object.defineProperty(window.MouseEvent, 'length', { value: _OrigMouseEvent.length });

  // ── 10. PERMISSIONS API ──
  if (navigator.permissions && navigator.permissions.query) {
    var _origPQuery = navigator.permissions.query;
    navigator.permissions.query = function(params) {
      if (params.name === 'notifications') return Promise.resolve({ state: 'granted', addEventListener: function(){}, removeEventListener: function(){} });
      if (params.name === 'geolocation') return Promise.resolve({ state: 'prompt', addEventListener: function(){}, removeEventListener: function(){} });
      if (params.name === 'camera') return Promise.resolve({ state: 'prompt', addEventListener: function(){}, removeEventListener: function(){} });
      if (params.name === 'microphone') return Promise.resolve({ state: 'prompt', addEventListener: function(){}, removeEventListener: function(){} });
      if (params.name === 'clipboard-read') return Promise.resolve({ state: 'prompt', addEventListener: function(){}, removeEventListener: function(){} });
      if (params.name === 'clipboard-write') return Promise.resolve({ state: 'granted', addEventListener: function(){}, removeEventListener: function(){} });
      if (params.name === 'persistent-storage') return Promise.resolve({ state: 'prompt', addEventListener: function(){}, removeEventListener: function(){} });
      return _origPQuery.call(navigator.permissions, params);
    };
  }

  // ── 11. CREDENTIALS API ──
  if (navigator.credentials) {
    var _origCredGet = navigator.credentials.get;
    navigator.credentials.get = function(opts) {
      if (opts && opts.publicKey) return Promise.reject(new DOMException('The operation was cancelled.', 'NotAllowedError'));
      return _origCredGet.call(navigator.credentials, opts);
    };
  }

  // ── 12. GAMEPAD API ──
  navigator.getGamepads = function() { return [null, null, null, null]; };

  // ── 13. CLIENT HINTS ──
  if (navigator.userAgentData) {
    defineProp(navigator, 'userAgentData', {
      brands: [{ brand: 'Google Chrome', version: '131' }, { brand: 'Chromium', version: '131' }, { brand: 'Not-A.Brand', version: '24' }],
      mobile: false,
      platform: 'Linux',
      getHighEntropyValues: function() {
        return Promise.resolve({
          architecture: 'x86', bitness: '64',
          brands: [{ brand: 'Google Chrome', version: '131' }, { brand: 'Chromium', version: '131' }],
          mobile: false, model: '', platform: 'Linux',
          platformVersion: '6.5.0', uaFullVersion: '131.0.6778.264',
          fullVersionList: [{ brand: 'Google Chrome', version: '131.0.6778.264' }, { brand: 'Chromium', version: '131.0.6778.264' }]
        });
      }
    });
  }


  // ── 15. GEOLOCATION SPOOFING (per-tab) ──
  var _geoLat = fp.geo ? fp.geo.lat + (nextNoise(seedA) - 0.5) * 0.01 : 40.7128;
  var _geoLon = fp.geo ? fp.geo.lon + (nextNoise(seedA) - 0.5) * 0.01 : -74.0060;
  var _geoAccuracy = 15 + Math.floor(nextNoise(seedA) * 35);
  var _geoAltitude = 10 + Math.floor(nextNoise(seedA) * 90);
  var _geoTimestamp = Date.now();

  function _fakePosition() {
    return {
      coords: {
        latitude: _geoLat,
        longitude: _geoLon,
        accuracy: _geoAccuracy,
        altitude: _geoAltitude,
        altitudeAccuracy: 5 + Math.floor(nextNoise(seedA) * 10),
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function(success, error, opts) {
      if (typeof success === 'function') {
        setTimeout(function() { success(_fakePosition()); }, 100 + Math.floor(nextNoise(seedA) * 200));
      }
    };
    navigator.geolocation.watchPosition = function(success, error, opts) {
      if (typeof success === 'function') {
        setTimeout(function() { success(_fakePosition()); }, 100);
      }
      return Math.floor(nextNoise(seedA) * 100000);
    };
    navigator.geolocation.clearWatch = function() {};
  }

  // ── 14. GLOBAL SCOPE LOCKDOWN ──
  // Remove anything that reveals automation or custom injection
  var _dangerousKeys = [
    'cdc_adoQpoasnfa76pfcZLmcfl_Array',
    'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
    'cdc_adoQpoasnfa76pfcZLmcfl_Symbol',
    '__nightmare', '_phantom', 'phantom',
    '__selenium_unwrapped', '__webdriver_evaluate', '__driver_evaluate',
    'webdriver', '__fxdriver_evaluate', '_Selenium_IDE_Recorder',
    'calledSelenium', '_WEBDRIVER_ELEM_CACHE',
    'ChromeDriverw', 'driver-hierarchical', 'selenium-hierarchical'
  ];
  for (var di = 0; di < _dangerousKeys.length; di++) {
    try { delete window[_dangerousKeys[di]]; } catch(e) {}
  }

  // Block property enumeration of our stealth internals
  try {
    Object.defineProperty(window, '__s_init', { enumerable: false, configurable: false });
  } catch(e) {}

  // Patch Object.keys to hide stealth internals
  var _origKeys = Object.keys;
  Object.keys = function(obj) {
    var keys = _origKeys(obj);
    if (obj === window) {
      return keys.filter(function(k) {
        return k.indexOf('__s_') !== 0 && k.indexOf('__set') !== 0 && k.indexOf('__ghost') === -1 && k.indexOf('__GHOST') === -1 && k.indexOf('__ELECTRON') === -1 && k.indexOf('__gh_') !== 0;
      });
    }
    return keys;
  };

  // Patch Object.getOwnPropertyNames similarly
  var _origGopn = Object.getOwnPropertyNames;
  Object.getOwnPropertyNames = function(obj) {
    var names = _origGopn(obj);
    if (obj === window) {
      return names.filter(function(k) {
        return k.indexOf('__s_') !== 0 && k.indexOf('__set') !== 0 && k.indexOf('__ghost') === -1 && k.indexOf('__GHOST') === -1 && k.indexOf('__ELECTRON') === -1 && k.indexOf('__gh_') !== 0;
      });
    }
    return names;
  };
})();
`);

// ── Notification Suppression (closure-scoped, no global) ──
webFrame.executeJavaScript(`
(function() {
  var _muted = false;
  var _blocked = false;
  var _OrigNotif = window.Notification;
  window.Notification = class extends _OrigNotif {
    constructor(title, options) {
      if (_muted || _blocked) return { close: function() {} };
      super(title, options);
    }
  };
  window.__setMuted = function(v) { _muted = v; };
  window.__setNotificationsBlocked = function(v) { _blocked = v; };
  try { Object.defineProperty(window, '__setMuted', { enumerable: false }); } catch(e) {}
  try { Object.defineProperty(window, '__setNotificationsBlocked', { enumerable: false }); } catch(e) {}
})();
`);


// ── WhatsApp Button Tweaks ─────────────────────────────────
webFrame.executeJavaScript(`
(function() {
  if (window.__button_tweaks_init) return;
  window.__button_tweaks_init = true;

  var SELECTORS = [
    'span[data-icon="status-outline"]',
    'span[data-icon="status-refreshed"]',
    'span[data-icon="newsletter-outline"]',
    'span[data-icon="community-outline"]',
    'span[data-icon="community-refreshed-32"]',
    'button[aria-label="Meta AI"]'
  ];
  var TITLES = ['status-refreshed', 'wds-ic-status', 'wds-ic-channels', 'community-refreshed-32', 'wds-ic-communities'];
  var scheduled = false;

  function hideClosestControl(node) {
    var el = node && node.closest ? node.closest('button, a, [role="button"], [tabindex]') : null;
    if (!el) el = node;
    if (el && el.style) el.style.setProperty('display', 'none', 'important');
  }

  function applyTweaks() {
    scheduled = false;
    SELECTORS.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(hideClosestControl);
    });
    document.querySelectorAll('svg title').forEach(function(title) {
      if (TITLES.indexOf((title.textContent || '').trim()) !== -1) hideClosestControl(title);
    });
    document.querySelectorAll('svg > circle[fill="none"]').forEach(function(circle) {
      var svg = circle.closest('svg');
      if (svg && svg.getBoundingClientRect().width <= 60) hideClosestControl(svg);
    });
  }

  function scheduleTweaks() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyTweaks);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleTweaks, { once: true });
  else scheduleTweaks();
  new MutationObserver(scheduleTweaks).observe(document.documentElement, { childList: true, subtree: true });
  try { Object.defineProperty(window, '__button_tweaks_init', { enumerable: false, configurable: false }); } catch(e) {}
})();
`);

// ── Ghost recovery UI + call suppression ───────────────────
webFrame.executeJavaScript(`
(function() {
  if (window.__ghost_recovery_ui_init) return;
  window.__ghost_recovery_ui_init = true;

  var MAX_CACHE = 1000;
  var cache = new Map();
  var order = [];
  var deletedPatterns = [
    'this message was deleted',
    'you deleted this message',
    'message deleted',
    'deleted message'
  ];
  var callPatterns = ['incoming call', 'voice call', 'video call', 'ringing', 'calling'];
  var callSelectors = '[role="dialog"], [data-animate-modal-popup], [aria-label*="call" i], [title*="call" i]';
  var scheduled = false;

  function ghost() {
    try { return window.__getGhost ? window.__getGhost() : {}; } catch (e) { return {}; }
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function hasAny(text, patterns) {
    for (var i = 0; i < patterns.length; i++) if (text.indexOf(patterns[i]) !== -1) return true;
    return false;
  }

  function messageKey(node) {
    var holder = node.closest('[data-id]') || node.closest('[data-pre-plain-text]') || node.closest('[role="row"]') || node;
    return holder.getAttribute('data-id') || holder.getAttribute('data-pre-plain-text') || '';
  }

  function cacheMessage(key, text) {
    if (!key || !text || hasAny(lower(text), deletedPatterns)) return;
    if (!cache.has(key)) order.push(key);
    cache.set(key, text);
    while (order.length > MAX_CACHE) cache.delete(order.shift());
  }

  function renderRecovered(node, text) {
    if (!text || node.querySelector('.ghost-recovered-message')) return;
    var recovered = document.createElement('div');
    recovered.className = 'ghost-recovered-message';
    recovered.textContent = text;
    var label = document.createElement('div');
    label.className = 'ghost-recovered-label';
    label.textContent = 'deleted message recovered';
    node.appendChild(recovered);
    node.appendChild(label);
  }
  function scanMessages() {
    var flags = ghost();
    if (!flags.x && !flags.a) return;
    document.querySelectorAll('[data-id], [data-pre-plain-text], [role="row"]').forEach(function(node) {
      var key = messageKey(node);
      var text = (node.innerText || '').trim();
      if (!key || !text) return;
      if (hasAny(lower(text), deletedPatterns)) renderRecovered(node, cache.get(key));
      else cacheMessage(key, text);
    });
  }

  function suppressCalls() {
    if (!ghost().c) return;
    document.querySelectorAll(callSelectors).forEach(function(node) {
      var text = lower((node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title'))) || node.innerText || '');
      if (!hasAny(text, callPatterns)) return;
      var target = node.closest('[role="dialog"]') || node.closest('[data-animate-modal-popup]') || node.closest('div[tabindex="-1"]') || node;
      if (target && target.style) target.style.display = 'none';
    });
  }

  function scan() {
    scheduled = false;
    scanMessages();
    suppressCalls();
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  var style = document.createElement('style');
  style.textContent = '.ghost-recovered-message{margin-top:4px;color:#d1d5db;font-size:13px;white-space:pre-wrap}.ghost-recovered-label{margin-top:2px;color:#9ca3af;font-size:11px;font-style:italic}';
  (document.head || document.documentElement).appendChild(style);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleScan, { once: true });
  else scheduleScan();
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
`);

// ── Drag-and-Drop File Attachment Fix ─────────────────────
// Prevents Electron's default file-drop-to-navigate behavior.
// WhatsApp Web's own drop handlers then receive the files normally.
webFrame.executeJavaScript(`
(function() {
  if (window.__drop_fix_init) return;
  window.__drop_fix_init = true;

  document.addEventListener('dragover', function(e) {
    e.preventDefault();
  }, false);

  document.addEventListener('drop', function(e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      return;
    }
    e.preventDefault();
  }, false);

  try {
    Object.defineProperty(window, '__drop_fix_init', { enumerable: false, configurable: false });
  } catch(e) {}
})();
`);

// ── IPC Handlers ───────────────────────────────────────────
ipcRenderer.on('set-muted', function(event, muted) {
  webFrame.executeJavaScript('if(window.__setMuted) window.__setMuted(' + muted + ');').catch(function(){});
});

ipcRenderer.on('set-notifications-muted', function(event, blocked) {
  webFrame.executeJavaScript('if(window.__setNotificationsBlocked) window.__setNotificationsBlocked(' + blocked + ');').catch(function(){});
});

ipcRenderer.on('set-ghost-settings', function(event, settings) {
  var attempts = 0;
  var maxAttempts = 10;
  function trySetGhost() {
    var code = '(function(){' +
      'var gs = { t:' + !!settings.ghostTyping + ', r:' + !!settings.ghostRead + ', s:' + !!settings.ghostStories + ', d:' + !!settings.ghostDelivery + ', a:' + !!settings.ghostAntiRevoke + ', c:' + !!settings.ghostCallBlock + ', x:' + !!settings.ghostRecoverDelete + ' };' +
      'if(window.__setGhost) { window.__setGhost(gs); return true; }' +
      'return false;' +
      '})();';
    if (injectMainWorld(code)) return;
    webFrame.executeJavaScript(code).then(function(success) {
      if (!success && attempts < maxAttempts) {
        attempts++;
        setTimeout(trySetGhost, 500);
      }
    }).catch(function(){});
  }
  trySetGhost();
});

// ── Unread Count Observer (with cleanup) ───────────────────
let unreadObserver = null;

function setupUnreadObserver() {
  if (unreadObserver) {
    unreadObserver.disconnect();
    unreadObserver = null;
  }

  const titleElement = document.querySelector('title');
  if (!titleElement) return;

  unreadObserver = new MutationObserver(function() {
    const match = document.title.match(/^\((\d+)\)/);
    const count = match ? parseInt(match[1], 10) : 0;
    ipcRenderer.send('unread-count-changed', count);
  });

  unreadObserver.observe(titleElement, {
    subtree: true,
    characterData: true,
    childList: true
  });
}

window.addEventListener('DOMContentLoaded', setupUnreadObserver);
window.addEventListener('load', setupUnreadObserver);
window.addEventListener('beforeunload', function() {
  if (unreadObserver) {
    unreadObserver.disconnect();
    unreadObserver = null;
  }
});
