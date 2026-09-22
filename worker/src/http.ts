export function jsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
  responseHeaders.set('Cache-Control', 'no-store')
  responseHeaders.set('X-Content-Type-Options', 'nosniff')

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  })
}
export function phaseCDisabledResponse(): Response {
  return jsonResponse({
    error: 'phase_not_available',
    message: 'This API requires authenticated Phase C services and is not enabled.',
  }, 501)
}
