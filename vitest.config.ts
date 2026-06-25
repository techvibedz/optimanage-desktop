import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts'],
  },
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'electron/__mocks__/electron.ts'),
    },
  },
})
