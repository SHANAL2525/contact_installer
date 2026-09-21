import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOfficeMode } from '../src/config/appMode'

describe('application mode selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('enables office mode only for the explicit office value', () => {
    vi.stubEnv('VITE_APP_MODE', 'office')
    expect(isOfficeMode()).toBe(true)

    vi.stubEnv('VITE_APP_MODE', 'cloud')
    expect(isOfficeMode()).toBe(false)

    vi.stubEnv('VITE_APP_MODE', '')
    expect(isOfficeMode()).toBe(false)
  })
})
