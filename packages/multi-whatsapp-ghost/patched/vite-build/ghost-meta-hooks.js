// ghost-meta-hooks.js — module-level ghost hooks
// Discovers WA modules by shape predicate and blocks privacy stanzas before encryption.
(function() {
  'use strict';
  if (window.__gh_meta) return;
  window.__gh_meta = true;

  function getGhost() {
    try { return window.__getGhost ? window.__getGhost() : {}; } catch(e) { return {}; }
  }

  function log(message, data) {
    try {
      var payload = data === undefined ? '' : ' ' + JSON.stringify(data).slice(0, 500);
      console.info('[ghost-diag] ' + message + payload);
    } catch(e) {}
  }

  function wrap(obj, fnName, key) {
    var orig = obj && obj[fnName];
    if (typeof orig !== 'function' || orig.__gh) return false;
    var wrapped = function() {
      if (getGhost()[key]) return Promise.resolve();
      return orig.apply(this, arguments);
    };
    wrapped.__gh = true;
    wrapped.__gh_orig = orig;
    try { obj[fnName] = wrapped; return true; } catch(e) { return false; }
  }

  function normalize(value) {
    if (value == null) return '';
    try { return String(value).toLowerCase(); } catch(e) { return ''; }
  }

  function isNode(value) {
    return value && typeof value === 'object' && typeof value.tag === 'string' && value.attrs && typeof value.attrs === 'object';
  }

  function isStoryNode(node) {
    var attrs = node.attrs || {};
    var text = [attrs.jid, attrs.to, attrs.from, attrs.participant, attrs.id, node.tag].map(normalize).join(' ');
    return text.indexOf('status@broadcast') !== -1 || text.indexOf('statusv3') !== -1;
  }

  function shouldBlockNode(node) {
    if (!isNode(node)) return false;
    var ghost = getGhost();
    var tag = normalize(node.tag);
    var attrs = node.attrs || {};
    var type = normalize(attrs.type);

    if (ghost.r && tag === 'read') return true;
    if (ghost.r && tag === 'receipt' && (type === 'read' || type === 'read-self' || type === 'played')) return true;
    if (ghost.r && tag === 'received' && type === 'played') return true;

    if (ghost.d && (tag === 'receipt' || tag === 'received') && (type === 'received' || type === 'delivery' || !type)) return true;

    if (ghost.s && isStoryNode(node) && (tag === 'read' || tag === 'receipt' || tag === 'received' || type === 'read' || type === 'played' || type === 'received')) return true;

    if (ghost.t && tag === 'presence' && (type === 'available' || type === 'composing' || type === 'recording' || !type)) return true;
    if (ghost.t && tag === 'chatstate') return true;

    return false;
  }

  function findBlockedNode(value, depth) {
    if (depth > 5 || value == null) return null;
    if (isNode(value) && shouldBlockNode(value)) return value;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var inArray = findBlockedNode(value[i], depth + 1);
        if (inArray) return inArray;
      }
      return null;
    }
    if (typeof value !== 'object') return null;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return null;
    var keys;
    try { keys = Object.keys(value); } catch(e) { return null; }
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      if (key === 'default' || key === '__esModule') continue;
      var found = findBlockedNode(value[key], depth + 1);
      if (found) return found;
    }
    return null;
  }

  function wrapNodeSender(obj, fnName) {
    var orig = obj && obj[fnName];
    if (typeof orig !== 'function' || orig.__gh_node) return false;
    var wrapped = function() {
      var blocked = null;
      for (var i = 0; i < arguments.length; i++) {
        blocked = findBlockedNode(arguments[i], 0);
        if (blocked) break;
      }
      if (blocked) {
        log('blocked-node', { fn: fnName, tag: blocked.tag, type: blocked.attrs && blocked.attrs.type, to: blocked.attrs && (blocked.attrs.to || blocked.attrs.jid || blocked.attrs.from) });
        return Promise.resolve();
      }
      return orig.apply(this, arguments);
    };
    wrapped.__gh_node = true;
    wrapped.__gh_orig = orig;
    try { obj[fnName] = wrapped; return true; } catch(e) { return false; }
  }

  var TARGETS = [
    { key: 'r', fns: ['sendSeen', 'sendSeenDebounced'],
      pred: function(m) { return m && typeof m.sendSeen === 'function' && typeof m.markUnread === 'function'; } },
    { key: 'd', fns: ['sendReceipt', 'sendAggregateReceipts', 'sendDeliveryReceipts'],
      pred: function(m) { return m && (typeof m.sendReceipt === 'function' || typeof m.sendAggregateReceipts === 'function'); } },
    { key: 't', fns: ['sendPresenceAvailable', 'sendPresenceUnavailable', 'markComposing', 'markPaused', 'markRecording', 'sendChatStateComposing', 'sendChatStatePaused', 'sendChatStateRecording'],
      pred: function(m) { return m && (typeof m.sendPresenceAvailable === 'function' || typeof m.markComposing === 'function' || typeof m.sendChatStateComposing === 'function'); } },
    { key: 's', fns: ['sendReadStatus', 'sendStatusRead', 'sendPresenceStatusProtocol'],
      pred: function(m) { return m && (typeof m.sendReadStatus === 'function' || typeof m.sendPresenceStatusProtocol === 'function'); } },
    { key: 'a', fns: ['processRevokeMsgs', 'processSentRevokeMsg', 'processRevokeMsg'],
      pred: function(m) { return m && (typeof m.processRevokeMsgs === 'function' || typeof m.processRevokeMsg === 'function'); } },
    { key: 'c', fns: ['handleCall', 'handleCallReceipt', 'handleVoipCall', 'offerCall'],
      pred: function(m) { return m && (typeof m.handleCall === 'function' || typeof m.handleVoipCall === 'function'); } },
    { key: 'x', fns: ['processDeleteForMe', 'processDeleteForMeSingle'],
      pred: function(m) { return m && typeof m.processDeleteForMe === 'function'; } }
  ];

  var HINT_NAMES = {
    r: ['WAWebUpdateUnreadChatAction', 'WAWebMarkSeen'],
    d: ['WAWebHandleMsgSendReceipt', 'WAWebSendReceiptJobCommon'],
    t: ['WAWebPresenceChatAction', 'WAWebChatStateBridge', 'WASendChatStateProtocol'],
    s: ['WAWebContactStatusBridge', 'WASendPresenceStatusProtocol'],
    a: ['WAWebAddonProcessRevoke', 'WAWebProcessRevoke'],
    c: ['WAWebHandleVoipCall', 'WAWebHandleVoipCallReceipt'],
    x: ['WAWebAddonProcessDeleteForMe', 'WAWebProcessDeleteForMe']
  };

  var NODE_SENDER_NAMES = ['sendNode', 'sendStanza', 'sendIq', 'query', 'sendQuery', 'send', 'write', 'sendFrame'];

  function tryImport(id) {
    try { if (typeof importNamespace === 'function') return importNamespace(id); } catch(e) {}
    try { if (typeof self.require === 'function') return self.require(id); } catch(e) {}
    return null;
  }

  function getAllModuleIds() {
    try {
      if (typeof self.require === 'function') {
        var dbg = self.require('__debug');
        if (dbg && dbg.modulesMap) return Object.keys(dbg.modulesMap);
      }
    } catch(e) {}
    return null;
  }

  function scanObject(obj, state) {
    if (!obj || typeof obj !== 'object') return;
    TARGETS.forEach(function(t) {
      if (!state.done[t.key] && t.pred(obj)) {
        var hooked = 0;
        t.fns.forEach(function(fn) { if (wrap(obj, fn, t.key)) hooked++; });
        if (hooked > 0) state.done[t.key] = true;
      }
    });
    NODE_SENDER_NAMES.forEach(function(fn) {
      if (wrapNodeSender(obj, fn)) state.nodeSenders++;
    });
  }

  function scanModule(mod, state) {
    scanObject(mod, state);
    if (!mod || typeof mod !== 'object') return;
    var keys;
    try { keys = Object.keys(mod); } catch(e) { return; }
    for (var i = 0; i < keys.length; i++) {
      var v = mod[keys[i]];
      if (v && typeof v === 'object') scanObject(v, state);
    }
  }

  function tryHookAll(state) {
    try { if (typeof ErrorGuard !== 'undefined') ErrorGuard.skipGuardGlobal(true); } catch(e) {}

    TARGETS.forEach(function(t) {
      if (state.done[t.key]) return;
      var hints = HINT_NAMES[t.key] || [];
      for (var i = 0; i < hints.length; i++) {
        var m = tryImport(hints[i]);
        if (m) scanModule(m, state);
        if (state.done[t.key]) break;
      }
    });

    if (!state.scannedAll) {
      var ids = getAllModuleIds();
      if (ids) {
        state.scannedAll = true;
        for (var j = 0; j < ids.length; j++) {
          var id = ids[j];
          if (!/^(?:use)?WA/.test(id)) continue;
          var mod = tryImport(id);
          if (mod) scanModule(mod, state);
        }
        log('meta-scan', { hooked: state.done, nodeSenders: state.nodeSenders });
      }
    }

    window.__gh_meta_hooked = Object.keys(state.done).filter(function(k){return state.done[k];}).length;
    window.__gh_meta_node_senders = state.nodeSenders;
    return TARGETS.every(function(t) { return state.done[t.key]; }) && state.nodeSenders > 0;
  }

  var state = { done: {}, scannedAll: false, nodeSenders: 0 };
  var attempts = 0;
  var poll = setInterval(function() {
    attempts++;
    if (tryHookAll(state) || attempts > 120) {
      clearInterval(poll);
      window.__gh_meta_ready = true;
      log('meta-ready', { hooked: state.done, nodeSenders: state.nodeSenders, attempts: attempts });
    }
  }, 500);
})();
