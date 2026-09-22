const textEncoder = new TextEncoder()

export function randomBase64Url(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return bytesToBase64Url(bytes)
}
export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return bytesToBase64Url(new Uint8Array(digest))
}

export function timingSafeEqual(first: string, second: string): boolean {
  const maximumLength = Math.max(first.length, second.length)
  let difference = first.length ^ second.length

  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0)
  }

  return difference === 0
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
