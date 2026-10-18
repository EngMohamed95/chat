// Local development: the PHP API on :8000 and Vite (which proxies /api and /uploads to it) on :3001.
import { spawn } from 'node:child_process';

const children = [
  spawn('php', ['-S', '127.0.0.1:8000', 'api/index.php'], { stdio: ['ignore', 'ignore', 'inherit'] }),
  spawn('npx', ['vite', '--port', '3001', '--host'], { stdio: 'inherit', shell: true }),
];

for (const child of children) {
  child.on('exit', (code) => {
    for (const other of children) other.kill();
    process.exit(code ?? 0);
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => children.forEach((c) => c.kill()));
}
