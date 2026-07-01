'use strict';

// ── Error Logging ──────────────────────────────────────────
process.on('uncaughtException', function(err) {
  console.error('[MultiWhatsApp] Uncaught exception:', err);
});
process.on('unhandledRejection', function(reason) {
  console.error('[MultiWhatsApp] Unhandled rejection:', reason);
});

// ── Imports ────────────────────────────────────────────────
const { app, BrowserWindow, BrowserView, Menu, dialog, ipcMain, shell, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ── Parallel Download Engine ─────────────────────────────────
const https = require('https');
const http = require('http');

class ParallelDownloader {
  constructor(url, destPath, options = {}) {
    this.url = url;
    this.destPath = destPath;
    this.chunkSize = options.chunkSize || 5 * 1024 * 1024; // 5MB chunks
    this.maxParallel = options.maxParallel || 4;
    this.chunks = [];
    this.progress = 0;
    this.totalSize = 0;
    this.downloaded = 0;
    this.aborted = false;
  }

  async start() {
    // Get file size and check if server supports range requests
    const { size, acceptRanges } = await this.getFileInfo();
    this.totalSize = size;

    if (!acceptRanges || size < this.chunkSize * 2) {
      // Fallback to single-threaded download
      return this.downloadSingle();
    }

    // Calculate chunks
    const numChunks = Math.ceil(size / this.chunkSize);
    this.chunks = [];
    
    for (let i = 0; i < numChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize - 1, size - 1);
      this.chunks.push({ start, end, downloaded: 0, data: null });
    }

    // Download chunks in parallel
    await this.downloadChunksParallel();

    // Merge chunks
    await this.mergeChunks();

    return this.destPath;
  }

  getFileInfo() {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const req = client.request(urlObj, { method: 'HEAD' }, (res) => {
        const size = parseInt(res.headers['content-length'] || '0', 10);
        const acceptRanges = res.headers['accept-ranges'] === 'bytes';
        resolve({ size, acceptRanges });
      });
      
      req.on('error', reject);
      req.end();
    });
  }

  downloadChunksParallel() {
    return new Promise((resolve, reject) => {
      let activeDownloads = 0;
      let nextChunkIndex = 0;
      let completedChunks = 0;

      const downloadNext = () => {
        if (this.aborted) {
          reject(new Error('Download aborted'));
          return;
        }

        while (activeDownloads < this.maxParallel && nextChunkIndex < this.chunks.length) {
          const chunkIndex = nextChunkIndex++;
          activeDownloads++;
          
          this.downloadChunk(chunkIndex)
            .then(() => {
              activeDownloads--;
              completedChunks++;
              
              // Update progress
              this.updateProgress();
              
              if (completedChunks === this.chunks.length) {
                resolve();
              } else {
                downloadNext();
              }
            })
            .catch(reject);
        }
      };

      downloadNext();
    });
  }

  downloadChunk(index) {
    return new Promise((resolve, reject) => {
      const chunk = this.chunks[index];
      const urlObj = new URL(this.url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        ...urlObj,
        headers: {
          'Range': `bytes=${chunk.start}-${chunk.end}`
        }
      };

      const req = client.get(options, (res) => {
        if (res.statusCode !== 206) {
          reject(new Error(`Server returned ${res.statusCode} for range request`));
          return;
        }

        const chunks = [];
        res.on('data', (data) => {
          chunks.push(data);
          chunk.downloaded += data.length;
          this.downloaded += data.length;
        });

        res.on('end', () => {
          chunk.data = Buffer.concat(chunks);
          resolve();
        });

        res.on('error', reject);
      });

      req.on('error', reject);
    });
  }

  updateProgress() {
    const progress = (this.downloaded / this.totalSize) * 100;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        url: this.url,
        progress: Math.round(progress * 100) / 100,
        downloaded: this.downloaded,
        total: this.totalSize
      });
    }
  }

  async mergeChunks() {
    const writeStream = fs.createWriteStream(this.destPath);
    
    for (const chunk of this.chunks) {
      await new Promise((resolve, reject) => {
        writeStream.write(chunk.data, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    return new Promise((resolve, reject) => {
      writeStream.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  downloadSingle() {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const req = client.get(urlObj, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(this.destPath);
        let downloaded = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          this.downloaded = downloaded;
          this.totalSize = parseInt(res.headers['content-length'] || downloaded, 10);
          this.updateProgress();
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(this.destPath);
        });

        fileStream.on('error', reject);
      });

      req.on('error', reject);
    });
  }

  abort() {
    this.aborted = true;
  }
}

// Hook into Electron's download system
function setupParallelDownloads(session) {
  session.on('will-download', (event, item, webContents) => {
    const filename = item.getFilename();
    console.log('[Download] File download initiated:', filename);

    const savePath = dialog.showSaveDialogSync(mainWindow, {
      defaultPath: path.join(app.getPath('downloads'), filename),
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });

    if (savePath) {
      console.log('[Download] Saving to:', savePath);
      item.setSavePath(savePath);
    } else {
      console.log('[Download] User cancelled save dialog');
    }
  });
}



function handleSquirrelEvent() {
  if (process.platform !== 'win32') return false;

  const appPath = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const appName = path.basename(process.execPath);
  const cmd = process.argv[1];

  switch (cmd) {
    case '--squirrel-install':
    case '--squirrel-updated':
      spawn(appPath, ['--createShortcut=' + appName], { detached: true }).on('close', app.quit);
      return true;
    case '--squirrel-uninstall':
      spawn(appPath, ['--removeShortcut=' + appName], { detached: true }).on('close', app.quit);
      return true;
    case '--squirrel-obsolete':
      app.quit();
      return true;
    default:
      return false;
  }
}

if (handleSquirrelEvent()) {
  app.quit();
}

// ── App Configuration ──────────────────────────────────────
// Chromium flags - stripped to WhatsApp essentials only
const disabledFeatures = [
  'CrossOriginOpenerPolicy',
  'CrossOriginEmbedderPolicy',
  'CalculateNativeWinOcclusion',
  'SiteIsolationForPasswordSites',
  'PasswordManagerRedesign',
  'Autofill',
  'AutofillCreditCard',
  'AutofillCreditCardUpload',
  'AutofillSaveCardUI',
  'AutofillUpstream',
  'AutofillProfileClientValidation',
  'ExtensionsMenu',
  'ExtensionsToolbarMenu',
  'ExtensionManifestV2Disabled',
  'SpellCheck',
  'TranslateUI',
  'Translate',
  'PDFViewer',
  'PrintPreview',
  'Printing',
  'WebUIPrintPreview',
  'GlobalMediaControls',
  'MediaRouter',
  'CastMediaRouteProvider',
  'TabAudioMuting',
  'TabCapture',
  'TabAudioCapture',
  'WebBluetooth',
  'WebUSB',
  'WebXR',
  'GamepadExtensions',
  'SpeechSynthesis',
  'SpeechRecognition',
  'PaymentRequest',
  'WebAuthentication',
  'WebOTP',
  'WebShare',
  'WebNFC',
  'WebHID',
  'WebSerial',
  'WebMIDI',
  'CredentialManagement',
  'FederatedCredentialManagement',
  'DigitalGoods',
  'IdleDetection',
  'VirtualKeyboard',
  'WakeLock',
  'ScreenWakeLock',
  'DevicePosture',
  'ComputePressure',
  'SensorAPI',
  'GenericSensor',
  'Accelerometer',
  'Gyroscope',
  'Magnetometer',
  'AmbientLightSensor',
  'ProximitySensor'
].join(',');

app.commandLine.appendSwitch('disable-features', disabledFeatures);
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-translate');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-hang-monitor');
app.commandLine.appendSwitch('disable-metrics');
app.commandLine.appendSwitch('disable-metrics-reporting');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('disable-client-side-phishing-detection');
app.commandLine.appendSwitch('no-first-run');
app.commandLine.appendSwitch('noerrdialogs');
app.commandLine.appendSwitch('force-color-profile', 'srgb');
app.commandLine.appendSwitch('disk-cache-size', '10485760');
app.commandLine.appendSwitch('media-cache-size', '5242880');
app.commandLine.appendSwitch('accept-lang', 'en');
app.setAppUserModelId('com.multiwhatsapp.app');

const WHATSAPP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';





// ── Stealth: Per-Tab Fingerprint Profile ───────────────────
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const SCREEN_POOL = [
  [1366,768],[1440,900],[1536,864],[1600,900],[1680,1050],
  [1920,1080],[1920,1200],[2560,1440],[2560,1600],[3840,2160]
];
const GPU_POOL = [
  { r: 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)', v: 'Google Inc. (Intel)' },
  { r: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5)', v: 'Google Inc. (Intel)' },
  { r: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630, OpenGL 4.5)', v: 'Google Inc. (Mesa)' },
  { r: 'ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics, OpenGL 4.5)', v: 'Google Inc. (Mesa)' },
  { r: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB, OpenGL 4.5)', v: 'Google Inc. (NVIDIA)' },
  { r: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER, OpenGL 4.5)', v: 'Google Inc. (NVIDIA)' },
  { r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060, OpenGL 4.5)', v: 'Google Inc. (NVIDIA)' },
  { r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, OpenGL 4.5)', v: 'Google Inc. (NVIDIA)' },
  { r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070, OpenGL 4.5)', v: 'Google Inc. (NVIDIA)' },
  { r: 'ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.5)', v: 'Google Inc. (AMD)' },
  { r: 'ANGLE (AMD, AMD Radeon RX 5700 XT, OpenGL 4.5)', v: 'Google Inc. (AMD)' },
  { r: 'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.5)', v: 'Google Inc. (AMD)' }
];
const CPU_POOL = [4, 6, 8, 12, 16];
const MEM_POOL = [4, 8, 8, 16, 16];
const LANG_POOL = [['en-US','en'], ['en-GB','en'], ['en-US','en-GB','en']];
const HIST_POOL = [3, 4, 5, 6, 7];
const GEO_POOL = [
  { lat: 40.7128, lon: -74.0060 },   // New York
  { lat: 34.0522, lon: -118.2437 },  // Los Angeles
  { lat: 41.8781, lon: -87.6298 },   // Chicago
  { lat: 29.7604, lon: -95.3698 },   // Houston
  { lat: 33.4484, lon: -112.0740 },  // Phoenix
  { lat: 39.7392, lon: -104.9903 },  // Denver
  { lat: 47.6062, lon: -122.3321 },  // Seattle
  { lat: 25.7617, lon: -80.1918 },   // Miami
  { lat: 42.3601, lon: -71.0589 },   // Boston
  { lat: 37.7749, lon: -122.4194 },  // San Francisco
  { lat: 36.1699, lon: -115.1398 },  // Las Vegas
  { lat: 35.2271, lon: -80.8431 },   // Charlotte
  { lat: 51.5074, lon: -0.1278 },    // London
  { lat: 48.8566, lon: 2.3522 },     // Paris
  { lat: 52.5200, lon: 13.4050 },    // Berlin
  { lat: -33.8688, lon: 151.2093 },  // Sydney
  { lat: 35.6762, lon: 139.6503 },   // Tokyo
  { lat: 1.3521, lon: 103.8198 },    // Singapore
  { lat: -23.5505, lon: -46.6333 },  // São Paulo
  { lat: 19.4326, lon: -99.1332 }    // Mexico City
];

function generateFingerprintProfile(tabId) {
  const rng = mulberry32(tabId);
  const screen = SCREEN_POOL[Math.floor(rng() * SCREEN_POOL.length)];
  const gpu = GPU_POOL[Math.floor(rng() * GPU_POOL.length)];
  const availH = screen[1] - 40;
  return {
    sw: screen[0],
    sh: screen[1],
    aw: screen[0],
    ah: availH,
    glr: gpu.r,
    glv: gpu.v,
    cn: Math.floor(rng() * 100000),
    an: Math.floor(rng() * 100000),
    hc: CPU_POOL[Math.floor(rng() * CPU_POOL.length)],
    dm: MEM_POOL[Math.floor(rng() * MEM_POOL.length)],
    lang: LANG_POOL[Math.floor(rng() * LANG_POOL.length)],
    hist: HIST_POOL[Math.floor(rng() * HIST_POOL.length)],
    geo: GEO_POOL[Math.floor(rng() * GEO_POOL.length)]
  };
}

// ── Stealth: Chrome 131 Header Ordering ────────────────────
const CHROME_HEADER_ORDER = [
  'Host', 'Connection', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
  'Upgrade-Insecure-Requests', 'User-Agent', 'Accept',
  'Sec-Fetch-Site', 'Sec-Fetch-Mode', 'Sec-Fetch-Dest', 'Sec-Fetch-User',
  'Accept-Encoding', 'Accept-Language', 'sec-ch-ua-full-version-list',
  'sec-ch-ua-arch', 'sec-ch-ua-bitness', 'sec-ch-ua-model', 'sec-ch-ua-wow64',
  'Purpose', 'DNT', 'Cache-Control', 'Pragma', 'If-None-Match', 'If-Modified-Since',
  'Range', 'Origin', 'Referer', 'Content-Type', 'Content-Length', 'Cookie'
];

function reorderChromeHeaders(headers) {
  const ordered = {};
  const lowerMap = {};
  for (const key of Object.keys(headers)) {
    lowerMap[key.toLowerCase()] = key;
  }
  for (const canonical of CHROME_HEADER_ORDER) {
    const lk = canonical.toLowerCase();
    if (lowerMap[lk] !== undefined) {
      ordered[lowerMap[lk]] = headers[lowerMap[lk]];
    }
  }
  for (const key of Object.keys(headers)) {
    if (ordered[key] === undefined) {
      ordered[key] = headers[key];
    }
  }
  return ordered;
}

// Pre-warm WhatsApp connections at startup
function preWarmConnections() {
  const https = require('https');
  const domains = [
    'web.whatsapp.com',
    'web.whatsapp.com',
    'static.whatsapp.net',
    'mmg.whatsapp.net'
  ];
  
  domains.forEach(domain => {
    try {
      const req = https.request({
        hostname: domain,
        method: 'HEAD',
        path: '/',
        timeout: 5000
      });
      req.on('error', () => {});
      req.end();
    } catch (e) {}
  });
}

// Call pre-warm after app is ready
app.whenReady().then(() => {
  setTimeout(preWarmConnections, 100);
});

// ── Constants ──────────────────────────────────────────────
const TITLEBAR_HEIGHT = 44;
const SIDEBAR_WIDTH = 76;
const MAX_TABS = 20;
const SAVE_DEBOUNCE_MS = 200;

const GHOST_HOOK_INJECT_DELAY_MS = 1500;
const GHOST_HOOK_RETRY_INTERVAL_MS = 10000;
const GHOST_HOOK_MAX_RETRIES = 5;
const HIBERNATE_INACTIVE_MS = 30 * 60 * 1000;

// ── Localization ───────────────────────────────────────────
const translations = {
  en: {
    file: 'File', quit: 'Quit', close: 'Close', edit: 'Edit', view: 'View',
    window: 'Window', rename: 'Rename', refresh: 'Refresh', mute: 'Mute',
    unmute: 'Unmute', clearSession: 'Clear Session', closeTab: 'Close Tab',
    confirmTitle: 'Confirm', confirmMessage: 'Are you sure you want to close the application?',
    yes: 'Yes', no: 'No', dontAsk: 'Do not ask me again',
    ghostTyping: 'Ghost Typing', ghostStories: 'Story Stealth',
    toggleAllGhost: 'Toggle All Ghost',
    confirmTabCloseTitle: 'Close Account?',
    confirmTabCloseMessage: 'Are you sure you want to remove this account?',
    confirmTabCloseDetail: 'This will close the tab. You might need to unlink this device from your phone manually.'
  },
  pt: {
    file: 'Arquivo', quit: 'Sair', close: 'Fechar', edit: 'Editar', view: 'Exibir',
    window: 'Janela', rename: 'Renomear', refresh: 'Recarregar', mute: 'Silenciar',
    unmute: 'Ativar Som', clearSession: 'Limpar Sessão', closeTab: 'Fechar Aba',
    confirmTitle: 'Confirmação', confirmMessage: 'Tem certeza que deseja fechar o aplicativo?',
    yes: 'Sim', no: 'Não', dontAsk: 'Não perguntar novamente',
    ghostTyping: 'Digitação Fantasma', ghostStories: 'Status Fantasma',
    toggleAllGhost: 'Alternar Todos os Fantasmas',
    confirmTabCloseTitle: 'Fechar Conta?',
    confirmTabCloseMessage: 'Tem certeza que deseja remover esta conta?',
    confirmTabCloseDetail: 'Isso fechará a aba. Você pode precisar desvincular este dispositivo do seu celular manualmente.'
  }
};

function t(key) {
  const locale = (app.getLocale() || 'en').split('-')[0];
  return (translations[locale] || translations.en)[key] || translations.en[key] || key;
}

// ── Color Palette ──────────────────────────────────────────
const COLORS = [
  { name: 'Default', value: null },
  { name: 'Red',     value: '#dc2626' },
  { name: 'Orange',  value: '#ea580c' },
  { name: 'Amber',   value: '#d97706' },
  { name: 'Green',   value: '#16a34a' },
  { name: 'Teal',    value: '#0d9488' },
  { name: 'Blue',    value: '#2563eb' },
  { name: 'Indigo',  value: '#4f46e5' },
  { name: 'Purple',  value: '#9333ea' },
  { name: 'Pink',    value: '#db2777' }
];

// ── Global State ───────────────────────────────────────────
let mainWindow = null;



let tabs = [];
let activeTabId = null;
let sidebarWidth = SIDEBAR_WIDTH;
let isQuitting = false;
let saveTimeout = null;
// ── File Paths ─────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const tabsFilePath = path.join(userDataPath, 'tabs.json');
const settingsFilePath = path.join(userDataPath, 'settings.json');
const ghostHooksPath = path.join(__dirname, 'ghost-hooks.js');
const ghostMetaHooksPath = path.join(__dirname, 'ghost-meta-hooks.js');

// ── Ghost Hooks Code ───────────────────────────────────────
let ghostHooksCode = '';
try {
  ghostHooksCode = fs.readFileSync(ghostHooksPath, 'utf8');
} catch (e) {
  console.error('[MultiWhatsApp] Failed to read ghost-hooks.js:', e.message);
}
let ghostMetaHooksCode = '';
try {
  ghostMetaHooksCode = fs.readFileSync(ghostMetaHooksPath, 'utf8');
} catch (e) {
  console.error('[MultiWhatsApp] Failed to read ghost-meta-hooks.js:', e.message);
}


// ── Persistence ────────────────────────────────────────────
function loadTabs() {
  try {
    if (fs.existsSync(tabsFilePath)) {
      const data = JSON.parse(fs.readFileSync(tabsFilePath, 'utf8'));
      if (Array.isArray(data)) {
        return {
          tabs: data.map(tab => ({
            ...tab,
            customName: /^p\d+$/.test(tab.name) ? false : (tab.customName || false),
            color: tab.color || null,
            notificationsBlocked: !!tab.notificationsBlocked,
            ghostTyping: !!tab.ghostTyping,
            ghostStories: !!tab.ghostStories,
          })),
          activeTabId: data[0]?.id || null
        };
      }
      return data;
    }
  } catch (e) {
    console.error('[MultiWhatsApp] Failed to load tabs:', e.message);
  }
  return { tabs: [], activeTabId: null };
}

function saveTabs() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const data = {
        activeTabId,
        tabs: tabs.map(tab => ({
          id: tab.id,
          name: tab.name,
          muted: tab.muted,
          customName: tab.customName || false,
          color: tab.color || null,
          notificationsBlocked: !!tab.notificationsBlocked,
          ghostTyping: !!tab.ghostTyping,
          ghostStories: !!tab.ghostStories,
        }))
      };
      const tmpFile = tabsFilePath + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(data));
      fs.renameSync(tmpFile, tabsFilePath);
    } catch (e) {
      console.error('[MultiWhatsApp] Failed to save tabs:', e.message);
    }
  }, SAVE_DEBOUNCE_MS);
}

function defaultSettings() {
  return { confirmOnClose: true, confirmOnTabClose: true, globalGhostTyping: false, globalGhostRead: false, globalGhostStories: false, globalGhostDelivery: false, globalGhostAntiRevoke: false, globalGhostCallBlock: false, globalGhostRecoverDelete: false, theme: 'dark' };
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsFilePath)) {
      return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) };
    }
  } catch (e) {
    console.error('[MultiWhatsApp] Failed to load settings:', e.message);
  }
  return defaultSettings();
}

function saveSettings(settings) {
  try {
    const tmpFile = settingsFilePath + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify({ ...defaultSettings(), ...settings }));
    fs.renameSync(tmpFile, settingsFilePath);
  } catch (e) {
    console.error('[MultiWhatsApp] Failed to save settings:', e.message);
  }
}

function ghostSettings() {
  const settings = loadSettings();
  return { ghostTyping: !!settings.globalGhostTyping, ghostRead: !!settings.globalGhostRead, ghostStories: !!settings.globalGhostStories, ghostDelivery: !!settings.globalGhostDelivery, ghostAntiRevoke: !!settings.globalGhostAntiRevoke, ghostCallBlock: !!settings.globalGhostCallBlock, ghostRecoverDelete: !!settings.globalGhostRecoverDelete };
}

function ghostSettingsScript(gs) {
  return `if (window.__setGhost) window.__setGhost({t:${!!gs.ghostTyping},r:${!!gs.ghostRead},s:${!!gs.ghostStories},d:${!!gs.ghostDelivery},a:${!!gs.ghostAntiRevoke},c:${!!gs.ghostCallBlock},x:${!!gs.ghostRecoverDelete}});`;
}

function applyGhostSettings() {
  const gs = ghostSettings();
  const code = ghostSettingsScript(gs);
  tabs.forEach(tab => {
    if (tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('set-ghost-settings', gs);
      tab.view.webContents.executeJavaScript(code).catch(() => {});
    }
  });
}

// ── Ghost Hook Injection ───────────────────────────────────
function injectGhostHooks(webContents, retries = 0) {
  if (!webContents || webContents.isDestroyed() || !ghostHooksCode) return;

  const code = (ghostMetaHooksCode ? ghostHooksCode + '\n' + ghostMetaHooksCode : ghostHooksCode) + '\n' + ghostSettingsScript(ghostSettings());
  webContents.executeJavaScript(code).catch(err => {
    if (retries < GHOST_HOOK_MAX_RETRIES) {
      setTimeout(() => injectGhostHooks(webContents, retries + 1), GHOST_HOOK_INJECT_DELAY_MS);
    }
  });
}

function wireViewRecovery(tabId, view) {
  const webContents = view && view.webContents;
  if (!webContents) return;

  webContents.on('render-process-gone', (event, details) => {
    scheduleTabRecovery(tabId, `render-process-gone:${details && details.reason || 'unknown'}`);
  });

  webContents.on('unresponsive', () => {
    // Don't crash or recover on unresponsive — WhatsApp can take >30s loading
    // large chats from IndexedDB. Crashing loses the session.
  });
  webContents.on('responsive', () => {
    const t = tabs.find(tt => tt.id === tabId);
    if (t) { t.recovering = false; t.recoverAttempts = 0; }
  });

  webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    if (validatedURL && !validatedURL.startsWith('https://web.whatsapp.com')) return;
    scheduleTabRecovery(tabId, `did-fail-load:${errorCode}:${errorDescription}`);
  });

  webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('[MultiWhatsApp] Preload failed:', preloadPath, error && error.message || error);
  });

  webContents.on('console-message', (event, level, message) => {
    if (String(message).indexOf('[ghost-diag]') !== -1) {
      try { fs.appendFileSync(path.join(userDataPath, 'ghost-diag.log'), JSON.stringify({ source: 'console', level, message }) + '\n'); } catch (e) {}
    }
  });

  webContents.on('did-finish-load', () => {
    // ghost-meta-hooks.js is now injected via view-preload.js into the main world
  });
}

function scheduleTabRecovery(tabId, reason) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.recovering) return;

  const now = Date.now();
  if (!tab.lastRecoveryAt || now - tab.lastRecoveryAt > 60000) tab.recoverAttempts = 0;
  tab.lastRecoveryAt = now;
  tab.recoverAttempts = (tab.recoverAttempts || 0) + 1;

  if (tab.recoverAttempts > 3) {
    console.error(`[MultiWhatsApp] Recovery limit reached for tab ${tabId}: ${reason}`);
    return;
  }

  tab.recovering = true;
  tab.loaded = false;
  console.error(`[MultiWhatsApp] Recovering tab ${tabId}: ${reason}`);

  setTimeout(() => {
    const current = tabs.find(t => t.id === tabId);
    if (!current || !mainWindow || mainWindow.isDestroyed()) return;

    try {
      if (current.view) {
        try { mainWindow.removeBrowserView(current.view); } catch (e) {}
        try {
          if (current.view.webContents && !current.view.webContents.isDestroyed()) {
            current.view.webContents.removeAllListeners();
            current.view.webContents.destroy();
          }
        } catch (e) {}
      }
      current.view = null;
      awakenView(tabId);
      if (activeTabId === tabId) switchTab(tabId);
      else updateBounds();
    } catch (e) {
      console.error('[MultiWhatsApp] Tab recovery failed:', e && e.message || e);
    } finally {
      const latest = tabs.find(t => t.id === tabId);
      if (latest) latest.recovering = false;
    }
  }, Math.min(1000 * tab.recoverAttempts, 5000));
}

// ── Tab Management ─────────────────────────────────────────
function createTab(id = null, name = null, muted = false, customName = false, color = null, savedData = null) {
  if (tabs.length >= MAX_TABS) {
    console.error(`[MultiWhatsApp] Tab limit reached (${MAX_TABS})`);
    return;
  }

  const tabId = id || Date.now();
  const tabName = name || 'WhatsApp';

  const fpProfile = generateFingerprintProfile(tabId);

  const view = new BrowserView({
    webPreferences: {
      partition: `persist:whatsapp-${tabId}`,
      backgroundThrottling: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'view-preload.js'),
      enableWebSQL: false,
      spellcheck: false,
      disableBlinkFeatures: 'AutomationControlled',
      additionalArguments: ['--fingerprint=' + JSON.stringify(fpProfile), '--ghost=' + JSON.stringify(ghostSettings())]
    }
  });

  // Optimize session for WhatsApp-only usage
  const session = view.webContents.session;
  
  
  // Allow essential permissions for WhatsApp session stability
  session.setPermissionRequestHandler((_, permission, callback) => {
    const allowed = ['notifications', 'media', 'mediaKeySystem', 'clipboard-read', 'clipboard-sanitized-write', 'persistent-storage'];
    callback(allowed.includes(permission));
  });
  session.setPermissionCheckHandler((_, permission) => {
    const allowed = ['notifications', 'media', 'mediaKeySystem', 'clipboard-read', 'clipboard-sanitized-write', 'persistent-storage'];
    return allowed.includes(permission);
  });
  
// Pre-warm DNS for WhatsApp
  session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: false });
  });

  // Enable parallel downloads
  setupParallelDownloads(session);

  // Prevent external navigation
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  view.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) {
      console.log('[Navigation] Blocked file:// URL (drag-drop):', url);
      event.preventDefault();
      return;
    }
    if (new URL(url).hostname !== 'web.whatsapp.com') {
      console.log('[Navigation] Blocked external navigation:', url);
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Set user agent at session and content level
  view.webContents.setUserAgent(WHATSAPP_UA);
  session.setUserAgent(WHATSAPP_UA);
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders;
    h['User-Agent'] = WHATSAPP_UA;
    if (!h['sec-ch-ua']) h['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not-A.Brand";v="24"';
    if (!h['sec-ch-ua-mobile']) h['sec-ch-ua-mobile'] = '?0';
    if (!h['sec-ch-ua-platform']) h['sec-ch-ua-platform'] = '"Linux"';
    if (!h['Accept-Language']) h['Accept-Language'] = 'en-US,en;q=0.9';
    callback({ requestHeaders: reorderChromeHeaders(h) });
  });

  // Mute if needed
  if (muted) {
    view.webContents.setAudioMuted(true);
  }

  wireViewRecovery(tabId, view);

  // On load complete
  view.webContents.on('did-finish-load', () => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.loaded = true;
      tab.recoverAttempts = 0;
      tab.recovering = false;
      view.webContents.send('set-muted', tab.muted);
      view.webContents.send('set-notifications-muted', !!tab.notificationsBlocked);
      injectGhostHooks(view.webContents);
      setTimeout(() => {
        view.webContents.send('set-ghost-settings', ghostSettings());
      }, 500);
    }
  });

  const tab = {
    id: tabId,
    view,
    name: tabName,
    unread: 0,
    muted,
    customName,
    color,
    loaded: false,
    lastActive: Date.now(),
    ghostTyping: !!(savedData && savedData.ghostTyping),
    ghostStories: !!(savedData && savedData.ghostStories),
    recovering: false,
    recoverAttempts: 0,
    lastRecoveryAt: 0,
  };

  tabs.push(tab);
  mainWindow.addBrowserView(view);

  // Set bounds
  const bounds = mainWindow.getContentBounds();
  const viewWidth = bounds.width - sidebarWidth;
  const viewHeight = bounds.height - TITLEBAR_HEIGHT;

  // Always create at visible position so Chromium renders properly
  view.setBounds({ x: sidebarWidth, y: TITLEBAR_HEIGHT, width: viewWidth, height: viewHeight });
  view.setAutoResize({ width: false, height: false });

  view.webContents.loadURL('https://web.whatsapp.com');
  // Hide if not the active tab
  if (tabId !== activeTabId) {
    updateBounds();
  }

  mainWindow.webContents.send('tab-created', {
    id: tabId,
    name: tabName,
    muted,
    color
  });

  if (!activeTabId) {
    activeTabId = tabId;
  }

  renameTabs();
  saveTabs();
  updateBounds();

  if (!id) {
    switchTab(tabId);
  }
}

function switchTab(tabId) {
  activeTabId = tabId;

  // Awaken view if hibernated
  awakenView(tabId);

  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  tab.lastActive = Date.now();

  // Re-inject ghost hooks
  if (tab && tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
    setTimeout(() => injectGhostHooks(tab.view.webContents), GHOST_HOOK_INJECT_DELAY_MS);
  }

  if (tab && tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
    tab.view.webContents.setBackgroundThrottling(false);
  }
  tabs.forEach(other => {
    if (other.id !== tabId && other.view && other.view.webContents && !other.view.webContents.isDestroyed()) {
      other.view.webContents.setBackgroundThrottling(true);
    }
  });

  updateBounds();

  // Force repaint for tabs that were repositioned
  if (tab && tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
    tab.view.webContents.invalidate();
  }

  mainWindow.webContents.send('tab-switched', tabId);
  saveTabs();
}

function awakenView(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.view) return;

  const fpProfile = generateFingerprintProfile(tab.id);

  const view = new BrowserView({
    webPreferences: {
      partition: `persist:whatsapp-${tab.id}`,
      backgroundThrottling: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'view-preload.js'),
      enableWebSQL: false,
      spellcheck: false,
      disableBlinkFeatures: 'AutomationControlled',
      additionalArguments: ['--fingerprint=' + JSON.stringify(fpProfile), '--ghost=' + JSON.stringify(ghostSettings())]
    }
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  view.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) {
      console.log('[Navigation] Blocked file:// URL (drag-drop):', url);
      event.preventDefault();
      return;
    }
    if (new URL(url).hostname !== 'web.whatsapp.com') {
      console.log('[Navigation] Blocked external navigation:', url);
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  view.webContents.setUserAgent(WHATSAPP_UA);
  
  view.webContents.session.setUserAgent(WHATSAPP_UA);
  view.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders;
    h['User-Agent'] = WHATSAPP_UA;
    if (!h['sec-ch-ua']) h['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not-A.Brand";v="24"';
    if (!h['sec-ch-ua-mobile']) h['sec-ch-ua-mobile'] = '?0';
    if (!h['sec-ch-ua-platform']) h['sec-ch-ua-platform'] = '"Linux"';
    if (!h['Accept-Language']) h['Accept-Language'] = 'en-US,en;q=0.9';
    callback({ requestHeaders: reorderChromeHeaders(h) });
  });

  if (tab.muted) {
    view.webContents.setAudioMuted(true);
  }

  wireViewRecovery(tab.id, view);

  view.webContents.on('did-finish-load', () => {
    const t = tabs.find(m => m.id === tab.id);
    if (t) {
      t.loaded = true;
      t.recoverAttempts = 0;
      t.recovering = false;
      t.lastActive = Date.now();
      view.webContents.send('set-muted', t.muted);
      view.webContents.send('set-notifications-muted', !!t.notificationsBlocked);
      injectGhostHooks(view.webContents);
      setTimeout(() => {
        view.webContents.send('set-ghost-settings', ghostSettings());
      }, 500);
    }
  });

  const handlePermission = (permission) => {
    const t = tabs.find(m => m.id === tab.id);
    if (permission === 'notifications' && t && t.muted) return false;
    return ['notifications', 'media', 'mediaKeySystem', 'geolocation', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission);
  };

  view.webContents.session.setPermissionRequestHandler((_, permission, callback) => {
    callback(handlePermission(permission));
  });

  view.webContents.session.setPermissionCheckHandler((_, permission) => {
    return handlePermission(permission);
  });

  // Enable parallel downloads for awakened views
  setupParallelDownloads(view.webContents.session);

  const bounds = mainWindow.getContentBounds();
  const viewWidth = bounds.width - sidebarWidth;
  const viewHeight = bounds.height - TITLEBAR_HEIGHT;

  if (tab.id === activeTabId) {
    view.setBounds({ x: sidebarWidth, y: TITLEBAR_HEIGHT, width: viewWidth, height: viewHeight });
  } else {
    view.setBounds({ x: -3000, y: TITLEBAR_HEIGHT, width: viewWidth, height: viewHeight });
  }

  view.setAutoResize({ width: false, height: false });
  tab.view = view;
  tab.loaded = false;
  mainWindow.addBrowserView(view);

  view.webContents.loadURL('https://web.whatsapp.com');
}


function updateBounds() {
  if (!mainWindow) return;

  const bounds = mainWindow.getContentBounds();
  const viewWidth = bounds.width - sidebarWidth;
  const viewHeight = bounds.height - TITLEBAR_HEIGHT;

  tabs.forEach(tab => {
    if (!tab.view) return;
    if (tab.id === activeTabId) {
      tab.view.setBounds({ x: sidebarWidth, y: TITLEBAR_HEIGHT, width: viewWidth, height: viewHeight });
    } else {
      tab.view.setBounds({ x: -3000, y: TITLEBAR_HEIGHT, width: viewWidth, height: viewHeight });
    }
  });
}

function renameTabs() {
  let changed = false;
  tabs.forEach((tab, index) => {
    if (!tab.customName) {
      const newName = `${index + 1}`;
      if (tab.name !== newName) {
        tab.name = newName;
        mainWindow.webContents.send('tab-renamed', { id: tab.id, name: newName });
        changed = true;
      }
    }
  });
  if (changed) saveTabs();
}

function updateBadge() {
  const totalUnread = tabs.reduce((sum, tab) => tab.muted ? sum : sum + (tab.unread || 0), 0);
  mainWindow.webContents.send('draw-badge', totalUnread);
}

function closeTab(tabId) {
  const settings = loadSettings();

  const doClose = () => {
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    try {
      const tab = tabs[index];
      if (tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
        // Remove all event listeners to prevent memory leaks
        tab.view.webContents.removeAllListeners();
        mainWindow.removeBrowserView(tab.view);
        tab.view.webContents.destroy();
      }
    } catch (e) {
      console.error('[MultiWhatsApp] Error destroying view:', e.message);
    }

    tabs.splice(index, 1);

    if (tabs.length > 0 && activeTabId === tabId) {
      switchTab(tabs[Math.max(0, index - 1)].id);
    }

    renameTabs();
    saveTabs();
    updateBadge();
    mainWindow.webContents.send('tab-closed', tabId);
  };

  if (!settings.confirmOnTabClose) {
    doClose();
    return;
  }

  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: [t('yes'), t('no')],
    defaultId: 1,
    cancelId: 1,
    title: t('confirmTabCloseTitle'),
    message: t('confirmTabCloseMessage'),
    detail: t('confirmTabCloseDetail'),
    checkboxLabel: t('dontAsk'),
    checkboxChecked: false
  }).then(({ response, checkboxChecked }) => {
    if (response === 0) {
      if (checkboxChecked) {
        saveSettings({ ...settings, confirmOnTabClose: false });
      }
      doClose();
    }
  });
}

function clearSession(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || !tab.view || !tab.view.webContents) return;

  tab.loaded = false;
  tab.view.webContents.session.clearStorageData().then(() => {
    return tab.view.webContents.loadURL('https://web.whatsapp.com');
  }).then(() => {
    tab.loaded = true;
  }).catch(err => {
    console.error('[MultiWhatsApp] Failed to clear session:', err.message);
    tab.loaded = true;
  });
}

function refreshTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
    tab.view.webContents.reload();
  }
}

function renameTab(tabId, newName) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && newName && typeof newName === 'string') {
    tab.name = newName.trim().substring(0, 50);
    tab.customName = true;
    saveTabs();
    mainWindow.webContents.send('tab-renamed', { id: tabId, name: tab.name });
  }
}

function reorderTabs(fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= tabs.length || toIndex < 0 || toIndex >= tabs.length) return;

  const [moved] = tabs.splice(fromIndex, 1);
  const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  tabs.splice(adjustedIndex, 0, moved);

  renameTabs();
  saveTabs();
  mainWindow.webContents.send('tabs-reordered', tabs.map(t => t.id));
}

function setTabColor(tabId, color) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.color = color;
    saveTabs();
    mainWindow.webContents.send('tab-color-changed', { id: tabId, color });
  }
}

function nextTab() {
  if (tabs.length < 2) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const nextIndex = (currentIndex + 1) % tabs.length;
  switchTab(tabs[nextIndex].id);
}

function prevTab() {
  if (tabs.length < 2) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  switchTab(tabs[prevIndex].id);
}

// ── Main Window Creation ───────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: false,
    backgroundColor: '#202124',
    icon: path.join(__dirname, '../src/images/ic_outline-whatsapp.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Menu
  const menuTemplate = [
    {
      label: t('file'),
      submenu: [
        { label: t('quit'), role: 'quit' },
        { label: t('close'), role: 'close' }
      ]
    },
    { label: t('edit'), role: 'editMenu' },
    {
      label: t('view'),
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Reset Zoom',
          accelerator: 'CommandOrControl+0',
          click: () => {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.view) tab.view.webContents.setZoomLevel(0);
          }
        },
        {
          role: 'zoomIn',
          accelerator: 'CommandOrControl+=',
          click: () => {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.view) {
              tab.view.webContents.setZoomLevel(tab.view.webContents.getZoomLevel() + 0.5);
            }
          }
        },
        {
          role: 'zoomOut',
          accelerator: 'CommandOrControl+-',
          click: () => {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.view) {
              tab.view.webContents.setZoomLevel(tab.view.webContents.getZoomLevel() - 0.5);
            }
          }
        }
      ]
    },
    { label: t('window'), role: 'windowMenu' }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  // Load renderer
  mainWindow.loadFile(path.join(__dirname, '../renderer/main_window/index.html'));

  // On renderer ready
  mainWindow.webContents.on('did-finish-load', () => {
    const saved = loadTabs();
    if (saved.tabs.length > 0) {
      tabs = [];
      activeTabId = saved.activeTabId || saved.tabs[0].id;
      saved.tabs.forEach(tab => {
        createTab(tab.id, tab.name, tab.muted, tab.customName, tab.color, tab);
      });
      switchTab(activeTabId);
    } else {
      createTab();
    }

    renameTabs();
    updateBounds();
    mainWindow.webContents.send('tab-switched', activeTabId);
    mainWindow.webContents.send('settings-changed', loadSettings());
    mainWindow.show();
  });

  // Theme changes
  nativeTheme.on('updated', () => {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  });

  // Window events
  mainWindow.on('resize', updateBounds);
  mainWindow.on('maximize', updateBounds);
  mainWindow.on('unmaximize', updateBounds);

  mainWindow.on('close', (event) => {
    if (isQuitting) return;

    const settings = loadSettings();
    if (!settings.confirmOnClose) {
      isQuitting = true;
      return;
    }

    event.preventDefault();
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: [t('yes'), t('no')],
      defaultId: 1,
      cancelId: 1,
      title: t('confirmTitle'),
      message: t('confirmMessage'),
      checkboxLabel: t('dontAsk'),
      checkboxChecked: false
    }).then(({ response, checkboxChecked }) => {
      if (response === 0) {
        if (checkboxChecked) {
          saveSettings({ ...settings, confirmOnClose: false });
        }
        isQuitting = true;
        mainWindow.close();
      }
    });
  });
}

// ── IPC Handlers ───────────────────────────────────────────
ipcMain.on('update-badge', (event, dataUrl) => {
  if (mainWindow) {
    if (!dataUrl) {
      mainWindow.setOverlayIcon(null, '');
    } else {
      mainWindow.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), 'Unread messages');
    }
  }
});

ipcMain.on('ghost-diag', (event, msg) => {
  try {
    fs.appendFileSync(path.join(userDataPath, 'ghost-diag.log'), JSON.stringify({ pid: process.pid, msg }) + '\n');
  } catch (e) {}
});

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.on('update-settings', (event, patch) => {
  const allowed = ['globalGhostTyping', 'globalGhostRead', 'globalGhostStories', 'globalGhostDelivery', 'globalGhostAntiRevoke', 'globalGhostCallBlock', 'globalGhostRecoverDelete', 'theme'];
  const next = loadSettings();
  allowed.forEach(key => { if (Object.prototype.hasOwnProperty.call(patch || {}, key)) next[key] = patch[key]; });
  next.theme = next.theme === 'deep' ? 'deep' : 'dark';
  saveSettings(next);
  applyGhostSettings();
  if (mainWindow) mainWindow.webContents.send('settings-changed', next);
});

ipcMain.on('create-tab', () => createTab());
ipcMain.on('switch-tab', (event, tabId) => switchTab(tabId));
ipcMain.on('close-tab', (event, tabId) => closeTab(tabId));
ipcMain.on('clear-tab', (event, tabId) => clearSession(tabId));
ipcMain.on('refresh-tab', (event, tabId) => refreshTab(tabId));
ipcMain.on('rename-tab', (event, { tabId, name }) => renameTab(tabId, name));
ipcMain.on('reorder-tabs', (event, { fromIndex, toIndex }) => reorderTabs(fromIndex, toIndex));
ipcMain.on('sidebar-toggled', () => {
  sidebarWidth = SIDEBAR_WIDTH;
  updateBounds();
});
ipcMain.on('settings-panel-toggled', (event, open) => {
  sidebarWidth = open ? 404 : SIDEBAR_WIDTH;
  updateBounds();
});
ipcMain.on('next-tab', () => nextTab());
ipcMain.on('prev-tab', () => prevTab());
ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('close', () => mainWindow.close());

ipcMain.on('show-context-menu', (event, tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  const settings = loadSettings();

  const colorSubmenu = COLORS.map(c => ({
    label: c.name,
    type: 'radio',
    checked: tab.color === c.value,
    click: () => setTabColor(tabId, c.value)
  }));

  const template = [
    {
      label: t('rename'),
      click: () => mainWindow.webContents.send('start-rename', tabId)
    },
    {
      label: t('refresh'),
      click: () => refreshTab(tabId)
    },
    {
      label: tab.muted ? t('unmute') : t('mute'),
      click: () => {
        tab.muted = !tab.muted;
        if (tab.view && tab.view.webContents) {
          tab.view.webContents.setAudioMuted(tab.muted);
          tab.view.webContents.send('set-muted', tab.muted);
        }
        saveTabs();
        mainWindow.webContents.send('tab-muted', { id: tabId, muted: tab.muted });
        updateBadge();
      }
    },
    {
      label: 'Block Notifications',
      type: 'checkbox',
      checked: !!tab.notificationsBlocked,
      click: () => {
        tab.notificationsBlocked = !tab.notificationsBlocked;
        if (tab.view && tab.view.webContents) {
          tab.view.webContents.send('set-notifications-muted', tab.notificationsBlocked);
        }
        saveTabs();
      }
    },
    { type: 'separator' },
    {
      label: 'Global Ghost Mode',
      type: 'checkbox',
      checked: !!(settings.globalGhostTyping && settings.globalGhostRead && settings.globalGhostStories && settings.globalGhostDelivery),
      click: () => {
        const next = !(settings.globalGhostTyping && settings.globalGhostRead && settings.globalGhostStories && settings.globalGhostDelivery);
        saveSettings({ ...settings, globalGhostTyping: next, globalGhostRead: next, globalGhostStories: next, globalGhostDelivery: next, globalGhostAntiRevoke: next, globalGhostCallBlock: next, globalGhostRecoverDelete: next });
        applyGhostSettings();
        mainWindow.webContents.send('settings-changed', loadSettings());
      }
    },
    {
      label: 'Change Color',
      submenu: colorSubmenu
    },
    {
      label: t('clearSession'),
      click: () => clearSession(tabId)
    },
    { type: 'separator' },
    {
      label: t('closeTab'),
      click: () => closeTab(tabId)
    }
  ];

  Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('toggle-mute-tab', (event, tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.muted = !tab.muted;
    if (tab.view && tab.view.webContents) {
      tab.view.webContents.setAudioMuted(tab.muted);
      tab.view.webContents.send('set-muted', tab.muted);
    }
    saveTabs();
    mainWindow.webContents.send('tab-muted', { id: tabId, muted: tab.muted });
    updateBadge();
  }
});

ipcMain.on('ghost-log', (event, message) => {
  // Ghost hook logs are silenced in production
});

ipcMain.on('unread-count-changed', (event, count) => {
  const tab = tabs.find(t => t.view && t.view.webContents && t.view.webContents.id === event.sender.id);
  if (tab) {
    tab.unread = count;
    mainWindow.webContents.send('tab-unread', { id: tab.id, unread: count });
    updateBadge();
  }
});



// ── Ghost Hook Re-injection (only when needed) ─────────────
const ghostHookInterval = setInterval(function() {
  tabs.forEach(tab => {
    if (tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed() && tab.loaded) {
      tab.view.webContents.executeJavaScript('window.__GHOST_HOOKS_INITIALIZED__').then(initialized => {
        if (!initialized) {
          injectGhostHooks(tab.view.webContents);
        }
      }).catch(() => {});
    }
  });
}, GHOST_HOOK_RETRY_INTERVAL_MS);

// ── Session Keep-Alive (prevent WhatsApp WebSocket timeout → logout) ──
// Executes lightweight JS in each tab every 30s to keep renderer process active
// and prevent Chromium from deprioritizing background tab timers.
const keepAliveInterval = setInterval(function() {
  tabs.forEach(tab => {
    if (tab.id !== activeTabId) return;
    if (tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed() && tab.loaded) {
      tab.view.webContents.executeJavaScript(
        '(function(){if(document.body)document.body.offsetHeight;return Date.now();})()'
      ).catch(() => {});
    }
  });
}, 30000);

const hibernateInterval = setInterval(function() {
  const now = Date.now();
  tabs.forEach(tab => {
    if (tab.id === activeTabId || !tab.view || now - tab.lastActive < HIBERNATE_INACTIVE_MS) return;
    try { mainWindow.removeBrowserView(tab.view); } catch (e) {}
    try {
      if (tab.view.webContents && !tab.view.webContents.isDestroyed()) {
        tab.view.webContents.removeAllListeners();
        tab.view.webContents.destroy();
      }
    } catch (e) {}
    tab.view = null;
    tab.loaded = false;
  });
}, 30000);

// ── App Lifecycle ──────────────────────────────────────────
app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  clearInterval(ghostHookInterval);
  clearInterval(keepAliveInterval);
  clearInterval(hibernateInterval);
  app.quit();
});
