import type { RequestContext } from '../env'
import { jsonResponse } from '../http'

export type RequestHandler = (context: RequestContext) => Response | Promise<Response>

export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}
export function withErrorHandling(handler: RequestHandler): RequestHandler {
  return async (context) => {
    try {
      return await handler(context)
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.code, message: error.message }, error.status)
      }

      // Intentionally omit exception details to avoid exposing secrets or database internals.
      return jsonResponse({
        error: 'internal_error',
        message: 'The request could not be completed.',
      }, 500)
    }
  }
}
