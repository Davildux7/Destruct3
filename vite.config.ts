import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import * as esbuild from 'esbuild';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function openConstructRuntimeBundlePlugin(): Plugin {
  const virtualId = 'virtual:openconstruct-runtime';
  const resolvedVirtualId = '\0' + virtualId;
  let cachedBundle: string | null = null;

  return {
    name: 'openconstruct-runtime-bundle',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id === resolvedVirtualId) {
        if (!cachedBundle || process.env.NODE_ENV !== 'production') {
          const result = esbuild.buildSync({
            entryPoints: [path.resolve(__dirname, 'src/engine/standaloneEntry.ts')],
            bundle: true,
            minify: true,
            format: 'iife',
            target: ['es2020'],
            write: false,
          });
          cachedBundle = result.outputFiles[0].text;
        }
        return `export default ${JSON.stringify(cachedBundle)};`;
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), openConstructRuntimeBundlePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
