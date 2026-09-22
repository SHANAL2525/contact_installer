import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const projectRoot = dirname(fileURLToPath(import.meta.url))

async function readLocalMigrations() {
  const migrationsPath = join(projectRoot, 'migrations')
  const migrationNames = (await readdir(migrationsPath))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()

  return Promise.all(migrationNames.map(async (name) => ({
    name,
    queries: (await readFile(join(migrationsPath, name), 'utf8'))
      .split(';')
      .map((query) => query.trim())
      .filter(Boolean),
  })))
}

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {
        configPath: './wrangler.jsonc',
      },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readLocalMigrations(),
          GOOGLE_LOGIN_CLIENT_ID: 'synthetic-client-id.apps.example.invalid',
          GOOGLE_LOGIN_CLIENT_SECRET: 'synthetic-test-secret',
          GOOGLE_LOGIN_REDIRECT_URI: 'http://localhost:8787/api/auth/google/callback',
          FRONTEND_ORIGIN: 'http://localhost:5173',
          SESSION_TTL_SECONDS: '3600',
        },
      },
    })),
  ],
  test: {
    setupFiles: ['./test/applyMigrations.ts'],
  },
})
