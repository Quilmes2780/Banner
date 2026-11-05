import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages liefert das Spiel unter /Banner/ aus; lokal läuft es unter /.
  base: command === 'build' ? '/Banner/' : '/',
  server: { port: 5173 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
}));
