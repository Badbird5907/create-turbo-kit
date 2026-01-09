import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  shims: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
