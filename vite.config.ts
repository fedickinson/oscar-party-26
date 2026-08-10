import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // ANTHROPIC_API_KEY is the correct name; the VITE_-prefixed one is
              // accepted so an existing .env.local keeps working through the rename.
              const apiKey = env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY
              if (!apiKey) {
                console.error('[proxy] ANTHROPIC_API_KEY is not set!')
                return
              }
              proxyReq.setHeader('x-api-key', apiKey)
              proxyReq.setHeader('anthropic-version', '2023-06-01')
              proxyReq.removeHeader('origin')
            })
          },
        },
      },
    },
  }
})
