import type { RequestContext } from '../env'
import { jsonResponse } from '../http'
import { requireCsrfProtection } from '../middleware/csrf'
import {
  inviteOfficeStaff,
  listOfficeAccess,
  OfficeAccessConflictError,
  revokeOfficeAccess,
} from '../repositories/officeAccess'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function handleOfficeUsersRoute(context: RequestContext): Promise<Response> {
  if (!context.user) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  if (context.user.role !== 'owner') {
    return jsonResponse({
      error: 'forbidden',
      message: 'Owner access is required.',
    }, 403)
  }

  const url = new URL(context.request.url)

  if (url.pathname === '/api/office-users') {
    if (context.request.method === 'GET') {
      return listUsers(context)
    }

    return methodNotAllowed('GET')
  }

  if (url.pathname === '/api/office-users/invitations') {
    if (context.request.method === 'POST') {
      return createInvitation(context)
    }

    return methodNotAllowed('POST')
  }

  const revokeMatch = url.pathname.match(/^\/api\/office-users\/([^/]+)\/revoke$/)

  if (revokeMatch) {
    if (context.request.method !== 'POST') {
      return methodNotAllowed('POST')
    }

    return revokeUser(context, decodeURIComponent(revokeMatch[1]))
  }

  return jsonResponse({ error: 'not_found' }, 404)
}
async function listUsers(context: RequestContext): Promise<Response> {
  const access = await listOfficeAccess(context.env.DB)

  return jsonResponse({
    users: access.map((entry) => ({
      id: entry.id,
      email: entry.primary_email ?? entry.invited_email,
      displayName: entry.display_name,
      role: entry.role,
      status: entry.status,
      invitedAt: entry.invited_at,
      activatedAt: entry.activated_at,
      revokedAt: entry.revoked_at,
      isCurrentUser: entry.user_id === context.user?.id,
    })),
  })
}

async function createInvitation(context: RequestContext): Promise<Response> {
  const csrfFailure = await requireCsrfProtection(context.request, context.env, context.user!)

  if (csrfFailure) {
    return csrfFailure
  }

  let body: { email?: unknown }

  try {
    body = await context.request.json() as { email?: unknown }
  } catch {
    return jsonResponse({ error: 'invalid_request', message: 'A valid JSON body is required.' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return jsonResponse({
      error: 'invalid_email',
      message: 'Enter a valid Google account email address.',
    }, 400)
  }

  try {
    const invitation = await inviteOfficeStaff(context.env.DB, {
      id: crypto.randomUUID(),
      email,
      createdByUserId: context.user!.id,
      now: new Date().toISOString(),
    })

    return jsonResponse({
      user: {
        id: invitation.id,
        email: invitation.invited_email,
        displayName: null,
        role: invitation.role,
        status: invitation.status,
        invitedAt: invitation.invited_at,
        activatedAt: invitation.activated_at,
        revokedAt: invitation.revoked_at,
        isCurrentUser: false,
      },
    }, 201)
  } catch (error) {
    if (error instanceof OfficeAccessConflictError) {
      return jsonResponse({ error: 'office_access_conflict', message: error.message }, 409)
    }

    throw error
  }
}

async function revokeUser(context: RequestContext, accessId: string): Promise<Response> {
  const csrfFailure = await requireCsrfProtection(context.request, context.env, context.user!)

  if (csrfFailure) {
    return csrfFailure
  }

  const result = await revokeOfficeAccess(context.env.DB, {
    accessId,
    revokedByUserId: context.user!.id,
    now: new Date().toISOString(),
  })

  if (result === 'not_found') {
    return jsonResponse({ error: 'not_found' }, 404)
  }

  if (result === 'last_owner') {
    return jsonResponse({
      error: 'last_owner',
      message: 'The last active owner cannot be revoked.',
    }, 409)
  }

  return new Response(null, { status: 204 })
}

function methodNotAllowed(allowedMethod: string): Response {
  return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: allowedMethod })
}
