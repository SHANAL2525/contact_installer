const storagePrefix = 'contact-auto-save'

export function readStorage<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(`${storagePrefix}:${key}`)

  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function writeStorage<T>(key: string, value: T): void {
  localStorage.setItem(`${storagePrefix}:${key}`, JSON.stringify(value))
}
