#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

function ensureInstalled(dir, label) {
  const nodeModules = path.join(dir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    console.log(`安裝${label}相依套件...`);
    const result = spawnSync(npmCmd, ['install'], { cwd: dir, stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`${label}相依套件安裝失敗`);
      process.exit(1);
    }
  }
}

const backendDir = path.join(ROOT_DIR, 'backend');
const frontendDir = path.join(ROOT_DIR, 'frontend');

ensureInstalled(backendDir, '後端');
ensureInstalled(frontendDir, '前端');

const children = [];

function spawnDev(dir, scriptName, label, defaultPort) {
  const child = spawn(npmCmd, ['run', scriptName], { cwd: dir, stdio: 'inherit', shell: isWindows });
  children.push(child);
  console.log(`${label}啟動中 (PID ${child.pid}, 預設 port ${defaultPort})`);
  return child;
}

spawnDev(backendDir, 'start:dev', '後端', 3000);
spawnDev(frontendDir, 'dev', '前端', 5173);

console.log('按 Ctrl+C 同時停止兩者');

function cleanup() {
  console.log('關閉服務...');
  for (const child of children) {
    if (!child.killed) {
      child.kill(isWindows ? undefined : 'SIGTERM');
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

for (const child of children) {
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      cleanup();
    }
  });
}
