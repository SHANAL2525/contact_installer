import type { Env } from '../env'

const ACCESS_CONTROL_HEADERS = 'Content-Type, X-CSRF-Token'
const ACCESS_CONTROL_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'

function getAllowedOrigin(request: Request, env: Env): string | null {
  const requestOrigin = request.headers.get('Origin')
  const configuredOrigin = env.FRONTEND_ORIGIN?.trim()

  if (!requestOrigin || !configuredOrigin || requestOrigin !== configuredOrigin) {
    return null
  }

  return requestOrigin
}

export function applyCorsHeaders(response: Response, request: Request, env: Env): Response {
  const allowedOrigin = getAllowedOrigin(request, env)

  if (!allowedOrigin) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', allowedOrigin)
  headers.set('Access-Control-Allow-Credentials', 'true')
  headers.set('Access-Control-Allow-Headers', ACCESS_CONTROL_HEADERS)
  headers.set('Access-Control-Allow-Methods', ACCESS_CONTROL_METHODS)
  headers.append('Vary', 'Origin')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function handleCorsPreflight(request: Request, env: Env): Response | null {
  if (request.method !== 'OPTIONS') {
    return null
  }

  const allowedOrigin = getAllowedOrigin(request, env)

  if (!allowedOrigin) {
    return new Response(null, { status: 403 })
  }

  return applyCorsHeaders(new Response(null, { status: 204 }), request, env)
}
