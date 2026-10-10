const { spawnSync } = require('node:child_process');
const path = require('node:path');
// Works on Windows and Unix; callers can override the backend origin explicitly.
const result = spawnSync(process.execPath, [path.resolve('node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--output-dir', 'dist'], {
  stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || 'same-origin' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
