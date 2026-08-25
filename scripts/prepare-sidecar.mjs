// ponytail: reuses the running Node binary as the Tauri sidecar instead of
// packaging one with pkg/nexe — keeps ffmpeg-installer's own path resolution
// working untouched. Upgrade to a self-contained Node build if targeting
// machines without matching glibc/arch, but this covers building-for-self.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, chmodSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

// 2. backend build output + runtime deps as a bundled resource
console.log('building backend...');
execSync('npm run build', { cwd: backend, stdio: 'inherit' });

const resourceDir = join(srcTauri, 'resources', 'backend');
rmSync(resourceDir, { recursive: true, force: true });
mkdirSync(resourceDir, { recursive: true });
cpSync(join(backend, 'dist'), join(resourceDir, 'dist'), { recursive: true });
cpSync(join(backend, 'node_modules'), join(resourceDir, 'node_modules'), { recursive: true });
copyFileSync(join(backend, 'package.json'), join(resourceDir, 'package.json'));
console.log(`backend resources -> ${resourceDir}`);
