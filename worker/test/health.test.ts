import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('Worker API foundation', () => {
  it('returns the public health response without runtime details', async () => {
    const response = await SELF.fetch('https://local.test/api/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'contact-auto-save-api',
    })
  })

  it.each([
    '/api/session',
    '/api/google-accounts',
    '/api/imports',
    '/api/history?user_id=synthetic-user-a',
  ])('requires authentication for endpoint %s', async (path) => {
    const response = await SELF.fetch(`https://local.test${path}`)
    const body = await response.json<{ error: string }>()

    expect(response.status).toBe(401)
    expect(body.error).toBe('unauthorized')
  })

  it('does not enable wildcard CORS', async () => {
    const response = await SELF.fetch('https://local.test/api/health', {
      headers: { Origin: 'https://untrusted.example.invalid' },
    })

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
