import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// Each import gets a fresh temp userData dir so queue files never collide
// between test files. Tests clear it themselves via clearSyncFiles() helper.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'optic-sync-test-'))

export const app = {
  getPath: (name: string) => (name === 'userData' ? userData : userData),
}
// Default: online. Tests override net.isOnline via vi.mocked if needed.
export const net = {
  isOnline: () => true,
}
export const __userData = userData
