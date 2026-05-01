import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createAIProxyHandler } from './src/server/aiProxy'
import { createSearchProxyHandler } from './src/server/searchProxy'


function packageVersionSpecifierResolver() {
  return {
    name: 'package-version-specifier-resolver',
    async resolveId(id: string, importer: string | undefined) {
      if (id.startsWith('jsr:')) {
        return null;
      }

      let normalizedId: string | null = null;
      const scopedMatch = id.match(/^(@[^/]+\/[^@]+)@[\w.-]+$/);
      if (scopedMatch) {
        normalizedId = scopedMatch[1];
      }

      const unscopedMatch = id.match(/^([^@./][^@]*)@[\w.-]+$/);
      if (!normalizedId && unscopedMatch) {
        normalizedId = unscopedMatch[1];
      }

      if (!normalizedId) {
        return null;
      }

      return this.resolve(normalizedId, importer, { skipSelf: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix = include non-VITE_ vars too).
  // Non-VITE_ vars stay server-side only - they're used by the AI proxy
  // middleware below and are never injected into the client bundle.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      packageVersionSpecifierResolver(),
      react(),
      tailwindcss(),
      // Server-side AI proxy - keeps API keys off the client
      {
        name: 'ai-proxy',
        configureServer(server) {
          const handler = createAIProxyHandler(env);
          server.middlewares.use('/api/ai/generate', handler);
        },
      },
      // Server-side Search proxy - provides web search capability
      {
        name: 'search-proxy',
        configureServer(server) {
          const handler = createSearchProxyHandler();
          server.middlewares.use('/api/search', handler);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('@radix-ui') || id.includes('lucide-react')) {
              return 'vendor-ui';
            }

            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts';
            }

            if (id.includes('html2canvas') || id.includes('jspdf')) {
              return 'vendor-export';
            }

            return 'vendor';
          },
        },
      },
    },
  };
})
