import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  sourcemap: true,
  splitting: false,
  clean: true,
  // All dependencies are external — pnpm deploy copies them into
  // node_modules in the runtime image (workspace packages included).
  // Nothing gets bundled inline, so no CJS-shim issues.
});
