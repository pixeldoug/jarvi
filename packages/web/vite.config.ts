import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    server: {
      port: 3000,
      watch: {
        usePolling: true,
        interval: 300,
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        // Mirror vercel.json rewrites so the same-origin PostHog proxy
        // (/ingest) also works in local dev. More specific key must come first.
        '/ingest/static': {
          target: 'https://us-assets.i.posthog.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/ingest\/static/, '/static'),
        },
        '/ingest': {
          target: 'https://us.i.posthog.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/ingest/, ''),
        },
      },
    },
    resolve: {
      alias: {
        '@': '/src',
        // Points at the ESM build (packages/shared's `build` script runs
        // both `tsc` for dist/ (CJS, consumed by the Node backend) and
        // `tsc -p tsconfig.esm.json` for dist/esm/ (real `export const`
        // syntax, consumed here). Aliasing to the CJS dist/index.js instead
        // is a trap: Rollup's production build (`vite build`) has to
        // statically re-derive named exports from tsc's CJS output
        // (`exports.foo = ...` assignments reached through a re-exported
        // `__exportStar` barrel), and that heuristic is unreliable — it can
        // silently fail for a subset of named exports (seen with a bare
        // `export const X: number[] = [...]` sitting next to other exports
        // that resolved fine) with a misleading "X is not exported by
        // dist/index.js" error. Aliasing to genuine ESM sidesteps that
        // whole class of bug since Rollup then parses real `export`
        // statements instead of re-deriving them from CJS.
        '@jarvi/shared': path.resolve(__dirname, '../shared/dist/esm/index.js'),
      },
    },
    define: {
      // Expose env variables to the client
      'process.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID),
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL),
    },
  };
});
