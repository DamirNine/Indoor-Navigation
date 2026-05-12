import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --port 5180 --host 127.0.0.1',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: true,
    timeout: 30000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  use: { baseURL: 'http://127.0.0.1:5180' },
});
