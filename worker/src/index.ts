import type { Env, RequestContext } from './env'
import { jsonResponse } from './http'
import { applyCorsHeaders, handleCorsPreflight } from './middleware/cors'
import { withErrorHandling } from './middleware/errorHandler'
import { validateApplicationSession } from './middleware/session'
import { handleAuthRoute } from './routes/auth'
import { handleGoogleAccountsRoute } from './routes/googleAccounts'
import { handleHistoryRoute } from './routes/history'
import { handleImportsRoute } from './routes/imports'
import { handleOfficeUsersRoute } from './routes/officeUsers'
import { renderLoginPage } from './routes/loginPage'
import { clearSessionCookies } from './security/cookies'

const handleRequest = withErrorHandling(async (context: RequestContext) => {
  const { request } = context
  const url = new URL(request.url)

  if (url.pathname === '/login') {
    return renderLoginPage(request)
  }

  if (url.pathname === '/api/health') {
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'GET' })
    }

    return jsonResponse({
      status: 'ok',
      service: 'contact-auto-save-api',
    })
  }

  if (
    url.pathname.startsWith('/api/auth/')
    || url.pathname === '/api/session'
    || url.pathname === '/api/logout'
  ) {
    return handleAuthRoute(context)
  }

  if (url.pathname.startsWith('/api/google-accounts')) {
    const authenticated = await requireAuthenticatedContext(context)
    return authenticated instanceof Response
      ? authenticated
      : handleGoogleAccountsRoute()
  }

  if (url.pathname.startsWith('/api/office-users')) {
    const authenticated = await requireAuthenticatedContext(context)
    return authenticated instanceof Response
      ? authenticated
      : handleOfficeUsersRoute(authenticated)
  }

  if (url.pathname.startsWith('/api/imports')) {
    const authenticated = await requireAuthenticatedContext(context)
    return authenticated instanceof Response
      ? authenticated
      : handleImportsRoute()
  }

  if (url.pathname.startsWith('/api/history')) {
    const authenticated = await requireAuthenticatedContext(context)
    return authenticated instanceof Response
      ? authenticated
      : handleHistoryRoute()
  }

  if (url.pathname.startsWith('/api/')) {
    return jsonResponse({ error: 'not_found' }, 404)
  }

  return handleProtectedAssetRequest(context)
})

async function handleProtectedAssetRequest(context: RequestContext): Promise<Response> {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD' })
  }

  const validation = await validateApplicationSession(context.request, context.env)

  if (!validation.ok) {
    const acceptsHtml = context.request.headers.get('Accept')?.includes('text/html')
      || context.request.headers.get('Sec-Fetch-Mode') === 'navigate'
    const response = acceptsHtml
      ? new Response(null, {
          status: 302,
          headers: {
            Location: `/login?return_to=${encodeURIComponent(getReturnPath(context.request))}`,
            'Cache-Control': 'no-store',
          },
        })
      : validation.response

    clearSessionCookies(context.env).forEach((cookie) => response.headers.append('Set-Cookie', cookie))
    return response
  }

  context.user = validation.user
  const assetResponse = await context.env.ASSETS.fetch(context.request)
  const headers = new Headers(assetResponse.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  })
}

function getReturnPath(request: Request): string {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}`
}

async function requireAuthenticatedContext(
  context: RequestContext,
): Promise<RequestContext | Response> {
  const validation = await validateApplicationSession(context.request, context.env)

  if (!validation.ok) {
    return validation.response
  }

  context.user = validation.user
  return context
}

export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> {
    const preflightResponse = handleCorsPreflight(request, env)

    if (preflightResponse) {
      return preflightResponse
    }

    const response = await handleRequest({ request, env, executionContext })
    return applyCorsHeaders(response, request, env)
  },
} satisfies ExportedHandler<Env>
