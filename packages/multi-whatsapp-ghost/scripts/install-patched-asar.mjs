import { existsSync, cpSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const app = process.env.MULTI_WHATSAPP_APP || '/Applications/Multi WhatsApp.app';
const asarPath = join(app, 'Contents/Resources/app.asar');
const work = process.env.MULTI_WHATSAPP_WORK || '/tmp/multi-whatsapp-ghost-asar';

if (!existsSync(asarPath)) {
  throw new Error(`app.asar not found: ${asarPath}`);
}

await rm(work, { recursive: true, force: true });
execFileSync('npx', ['asar', 'extract', asarPath, work], { stdio: 'inherit' });

for (const name of ['ghost-hooks.js', 'ghost-meta-hooks.js', 'main.js', 'view-preload.js']) {
  cpSync(join(root, 'patched/vite-build', name), join(work, '.vite/build', name));
}

execFileSync('npx', ['asar', 'pack', work, asarPath], { stdio: 'inherit' });
spawnSync('osascript', ['-e', 'tell application "Multi WhatsApp" to quit'], { stdio: 'ignore' });
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });

console.log(`patched and signed: ${app}`);
