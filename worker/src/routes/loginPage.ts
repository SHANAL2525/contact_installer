const LOGIN_PAGE_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}
export function renderLoginPage(request: Request): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      status: 405,
      headers: { ...LOGIN_PAGE_HEADERS, Allow: 'GET, HEAD' },
    })
  }

  const url = new URL(request.url)
  const returnPath = normalizeReturnPath(url.searchParams.get('return_to'))
  const loginUrl = `/api/auth/google/start?return_to=${encodeURIComponent(returnPath)}`
  const error = url.searchParams.get('error')
  const errorMessage = error === 'access_denied'
    ? 'This Google account is not approved for office access.'
    : error
      ? 'Sign-in could not be completed. Please try again.'
      : null
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in | Contact Auto Save</title>
  <style>
    :root { color: #183b35; background: #f4f7f3; font-family: system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { min-width: 320px; min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; }
    main { width: min(100%, 430px); padding: 32px; border: 1px solid #d7e1dc; border-radius: 22px; background: #fff; box-shadow: 0 18px 50px rgba(24,59,53,.09); }
    .mark { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: #dceca4; font-weight: 800; }
    .eyebrow { margin: 22px 0 8px; color: #587069; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(1.8rem, 7vw, 2.35rem); line-height: 1.08; }
    .lede { margin: 16px 0 0; color: #587069; line-height: 1.6; }
    .error { margin: 20px 0 0; padding: 12px 14px; border: 1px solid #e4b9b4; border-radius: 12px; background: #fff3f1; color: #7a2920; line-height: 1.45; }
    a { display: grid; place-items: center; min-height: 50px; margin-top: 24px; border-radius: 13px; background: #183b35; color: #fff; font-weight: 750; text-decoration: none; }
    a:focus-visible { outline: 3px solid #78912b; outline-offset: 3px; }
    small { display: block; margin-top: 16px; color: #6a7d77; line-height: 1.45; }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">CA</div>
    <p class="eyebrow">Private office application</p>
    <h1>Sign in securely</h1>
    <p class="lede">Use an approved Google account to access Contact Auto Save. Google Contacts permission is connected separately after sign-in.</p>
    ${errorMessage ? `<p class="error" role="alert">${errorMessage}</p>` : ''}
    <a href="${loginUrl}">Continue with Google</a>
    <small>Access is limited to accounts invited by the application owner.</small>
  </main>
</body>
</html>`

  return new Response(request.method === 'HEAD' ? null : body, { headers: LOGIN_PAGE_HEADERS })
}

function normalizeReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/'
  }

  try {
    const parsed = new URL(value, 'https://return-path.invalid')
    return parsed.origin === 'https://return-path.invalid'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/'
  } catch {
    return '/'
  }
}
