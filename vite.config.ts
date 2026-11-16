import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Emits Cloudflare Pages' _headers (CSP, SECURITY.md section 8) and _redirects (SPA fallback),
// filling in the Supabase host from VITE_SUPABASE_URL so the CSP names only our project.
function pagesFiles(supabaseUrl: string): Plugin {
  return {
    name: 'pages-files',
    apply: 'build',
    generateBundle() {
      const host = supabaseUrl ? new URL(supabaseUrl).host : ''
      const headers = readFileSync('deploy/_headers', 'utf8')
        .replaceAll('__SUPABASE_HTTPS__', host ? `https://${host}` : '')
        .replaceAll('__SUPABASE_WSS__', host ? `wss://${host}` : '')
        .replace(/ {2,}(?=;)/g, '')
      this.emitFile({ type: 'asset', fileName: '_headers', source: headers })
      this.emitFile({
        type: 'asset',
        fileName: '_redirects',
        source: readFileSync('deploy/_redirects', 'utf8'),
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    pagesFiles(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL ?? ''),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Playwright specs run with npm run test:e2e.
    exclude: ['e2e/**', 'node_modules/**'],
  },
}))
