import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // 11ty serves Vite's output from dist/assets under the /assets/ URL path,
  // so asset URLs baked into the bundle (e.g. imported SVGs) need that
  // prefix too. The dev server still serves from the root.
  base: command === 'build' ? '/assets/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist/assets',
    emptyOutDir: false,
    lib: false,
    manifest: true,
    sourcemap: true,
    // Keep all avatar/image assets as separate cacheable files instead of
    // inlining them as base64 into the main JS bundle.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          if (/png|jpe?g|gif|svg|webp/.test(ext)) {
            return `images/[name].[hash][extname]`
          } else if (/woff|woff2|eot|ttf|otf/.test(ext)) {
            return `fonts/[name].[hash][extname]`
          } else if (ext === 'css') {
            return `css/[name].[hash][extname]`
          }
          return `[name].[hash][extname]`
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
