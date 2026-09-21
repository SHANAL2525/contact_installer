import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Cloudflare Worker static routing', () => {
  it('runs the Worker before protected SPA assets and uses the SPA fallback', async () => {
    const config = JSON.parse(await readFile('worker/wrangler.jsonc', 'utf8')) as {
      assets?: {
        binding?: unknown
        directory?: unknown
        not_found_handling?: unknown
        run_worker_first?: unknown
      }
    }

    expect(config.assets).toEqual({
      directory: '../dist',
      binding: 'ASSETS',
      not_found_handling: 'single-page-application',
      run_worker_first: true,
    })
  })
})
