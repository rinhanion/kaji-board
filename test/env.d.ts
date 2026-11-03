import type { D1Migration } from 'cloudflare:test'

// テストから見えるバインディング(vitest.config.ts で渡すものを含む)
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      FAMILY_PASSPHRASE: string
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
