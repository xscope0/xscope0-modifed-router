// ghost-hooks.js — WhatsApp Web ghost features via WebSocket hijacking
(function() {
  'use strict';

  if (window.__gh_init) return;
  window.__gh_init = true;

  var _typing = false;
  var _read = false;
  var _stories = false;
  var _delivery = false;
  var _antiRevoke = false;
  var _callBlock = false;
  var _recoverDelete = false;

  Object.defineProperty(window, '__GHOST_HOOKS_INITIALIZED__', { value: true, enumerable: false, configurable: false });
  Object.defineProperty(window, '__gh_init', { enumerable: false, configurable: false });

  window.__setGhost = function(gs) {
    if (!gs || typeof gs !== 'object') return;
    _typing = !!gs.t;
    _read = !!gs.r;
    _stories = !!gs.s;
    _delivery = !!gs.d;
    _antiRevoke = !!gs.a;
    _callBlock = !!gs.c;
    _recoverDelete = !!gs.x;
  };

  window.__getGhost = function() {
    return { t: _typing, r: _read, s: _stories, d: _delivery, a: _antiRevoke, c: _callBlock, x: _recoverDelete };
  };

  var METRIC_PRESENCE = 8;
  var METRIC_READ = 11;
  var METRIC_RECEIVED = 13;
  var PRESENCE_AVAILABLE_BIT = 5;
  var TYPING_STRS = ['composing', 'typing', 'chatstate', 'setcomposing', 'sendpresencecomposing'];
  var READ_STRS = ['read"', "read'", 'type":"read', "type':'read", 'readreceipt', 'read_receipt', 'sendseen', 'markseen'];
  var DELIVERY_STRS = ['received"', "received'", 'type":"received', "type':'received", 'delivery', 'receipt', 'sendreceipt'];
  var STORY_STRS = ['status_view', 'readstatus', 'status_read', 'sendstatusread', 'viewstatus', 'statusv3', 'status@broadcast'];

  function parseBinaryNode(data) {
    try {
      var bytes = null;
      if (data instanceof Uint8Array) bytes = data;
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (!bytes) return null;

      var comma = -1;
      for (var i = 0; i < Math.min(bytes.length, 32); i++) {
        if (bytes[i] === 0x2C) { comma = i; break; }
      }
      if (comma < 0 || comma + 2 >= bytes.length) return null;

      var bitvector = bytes[comma + 2];
      return {
        metric: bytes[comma + 1],
        available: ((bitvector >> PRESENCE_AVAILABLE_BIT) & 1) === 1
      };
    } catch (e) {
      return null;
    }
  }

  function dataToText(data) {
    if (typeof data === 'string') return data;
    try {
      if (data instanceof ArrayBuffer) return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(data));
      if (ArrayBuffer.isView(data)) return new TextDecoder('utf-8', { fatal: false }).decode(data);
    } catch (e) {}
    return '';
  }

  function hasAny(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      if (text.indexOf(patterns[i]) !== -1) return true;
    }
    return false;
  }

  function shouldDropText(data) {
    var lower = dataToText(data).toLowerCase();
    if (!lower) return false;
    if (_typing && hasAny(lower, TYPING_STRS)) return true;
    if (_stories && hasAny(lower, STORY_STRS) && hasAny(lower, READ_STRS.concat(DELIVERY_STRS))) return true;
    if (_read && hasAny(lower, READ_STRS)) return true;
    if (_delivery && hasAny(lower, DELIVERY_STRS) && lower.indexOf('message') === -1) return true;
    return false;
  }

  var BASE_WEBSOCKET = WebSocket;

  function hijackedSend() {
    var data = arguments[0];

    try {
      var parsed = parseBinaryNode(data);
      if (parsed) {
        if (_typing && parsed.metric === METRIC_PRESENCE && parsed.available) return;
        if (_read && parsed.metric === METRIC_READ) return;
        if (_delivery && parsed.metric === METRIC_RECEIVED) return;
      }
      if (shouldDropText(data)) return;
    } catch (e) {}

    return BASE_WEBSOCKET.prototype.send.apply(this, arguments);
  }

  function WrappedWebSocket() {
    var base = Reflect.construct(BASE_WEBSOCKET, arguments);
    base.send = hijackedSend;
    return base;
  }

  WrappedWebSocket.prototype = BASE_WEBSOCKET.prototype;
  WrappedWebSocket.CONNECTING = BASE_WEBSOCKET.CONNECTING;
  WrappedWebSocket.OPEN = BASE_WEBSOCKET.OPEN;
  WrappedWebSocket.CLOSING = BASE_WEBSOCKET.CLOSING;
  WrappedWebSocket.CLOSED = BASE_WEBSOCKET.CLOSED;

  try {
    Object.defineProperty(window, 'WebSocket', { value: WrappedWebSocket, writable: true, configurable: true });
  } catch (e) {
    window.WebSocket = WrappedWebSocket;
  }
  WebSocket = WrappedWebSocket;
})();
