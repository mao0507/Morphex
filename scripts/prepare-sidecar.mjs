// ponytail: reuses the running Node binary as the Tauri sidecar instead of
// packaging one with pkg/nexe — keeps ffmpeg-installer's own path resolution
// working untouched. Upgrade to a self-contained Node build if targeting
// machines without matching glibc/arch, but this covers building-for-self.
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, copyFileSync, chmodSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcTauri = join(root, 'src-tauri');
const backend = join(root, 'backend');

function hostTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const match = out.match(/^host: (.+)$/m);
  if (!match) throw new Error('could not determine rustc host triple');
  return match[1];
}

// 1. sidecar binary = current Node executable, renamed per Tauri's convention
const triple = hostTriple();
const binariesDir = join(srcTauri, 'binaries');
mkdirSync(binariesDir, { recursive: true });
const ext = process.platform === 'win32' ? '.exe' : '';
const sidecarPath = join(binariesDir, `backend-${triple}${ext}`);
copyFileSync(process.execPath, sidecarPath);
chmodSync(sidecarPath, 0o755);
console.log(`sidecar binary -> ${sidecarPath}`);

// 2. backend build output + prod-only runtime deps as a bundled resource.
// A prod-only install (no jest/eslint/typescript/etc) happens in a scratch
// dir rather than touching backend/node_modules, which stays the dev install.
console.log('building backend...');
execSync('npm run build', { cwd: backend, stdio: 'inherit' });

console.log('installing production-only backend deps...');
const prodInstallDir = mkdtempSync(join(tmpdir(), 'mediaforge-backend-prod-'));
copyFileSync(join(backend, 'package.json'), join(prodInstallDir, 'package.json'));
copyFileSync(join(backend, 'package-lock.json'), join(prodInstallDir, 'package-lock.json'));
execSync('npm ci --omit=dev', { cwd: prodInstallDir, stdio: 'inherit' });

const resourceDir = join(srcTauri, 'resources', 'backend');
rmSync(resourceDir, { recursive: true, force: true });
mkdirSync(resourceDir, { recursive: true });
cpSync(join(backend, 'dist'), join(resourceDir, 'dist'), { recursive: true });
cpSync(join(prodInstallDir, 'node_modules'), join(resourceDir, 'node_modules'), { recursive: true });
copyFileSync(join(backend, 'package.json'), join(resourceDir, 'package.json'));
rmSync(prodInstallDir, { recursive: true, force: true });
console.log(`backend resources -> ${resourceDir}`);
