import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths so the build works on any static host, including GitHub Pages subpaths.
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
