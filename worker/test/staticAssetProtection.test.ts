import { SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDatabase } from './officeTestData'

beforeEach(clearDatabase)

describe('protected Worker static assets', () => {
  it('serves a minimal public login page without the React bundle', async () => {
    const response = await SELF.fetch('http://localhost:8787/login')
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toContain('Continue with Google')
    expect(body).not.toMatch(/<script\b/i)
    expect(body).not.toContain('/assets/')
  })

  it('redirects unauthenticated navigation without serving application HTML', async () => {
    const response = await SELF.fetch('http://localhost:8787/history?view=recent', {
      redirect: 'manual',
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/login?return_to=%2Fhistory%3Fview%3Drecent')
    expect(await response.text()).toBe('')
  })

  it.each([
    ['/assets/application.js', 'application/javascript'],
    ['/assets/application.css', 'text/css'],
    ['/favicon.svg', 'image/svg+xml'],
  ])('denies unauthenticated protected asset %s', async (path, accept) => {
    const response = await SELF.fetch(`http://localhost:8787${path}`, {
      headers: { Accept: accept },
    })

    expect(response.status).toBe(401)
    expect(await response.json<{ error: string }>()).toMatchObject({ error: 'unauthorized' })
  })

  it('keeps the Google OAuth callback publicly reachable', async () => {
    const response = await SELF.fetch(
      'http://localhost:8787/api/auth/google/callback?code=synthetic',
      { redirect: 'manual' },
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toContain('/login?error=authentication_failed')
  })

  it('returns JSON for unknown API routes instead of SPA HTML', async () => {
    const response = await SELF.fetch('http://localhost:8787/api/not-a-route', {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(await response.json<{ error: string }>()).toEqual({ error: 'not_found' })
  })
})
