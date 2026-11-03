import { applyD1Migrations, env } from 'cloudflare:test'

// テスト用の D1 に migrations/ を当てる(当て済みのものは飛ばされる)
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
