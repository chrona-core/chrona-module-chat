const result = Bun.spawnSync(['node', 'node_modules/vite/bin/vite.js', 'build'], { stdout: 'inherit', stderr: 'inherit' });
if (result.exitCode !== 0) process.exit(result.exitCode);
