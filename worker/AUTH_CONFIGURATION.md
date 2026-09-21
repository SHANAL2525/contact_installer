# Phase C application authentication configuration

Phase C uses Google OpenID Connect only to identify the person signing in to the application. It is separate from the existing Google Contacts account connection and does not request Google Contacts scopes.

## Required Worker bindings

| Binding | Storage | Example purpose |
| --- | --- | --- |
| `APP_ENV` | Wrangler `vars` | `local`, `preview`, or `production` |
| `FRONTEND_ORIGIN` | Wrangler `vars` | Exact frontend origin, such as `http://localhost:5173` |
| `GOOGLE_LOGIN_CLIENT_ID` | Wrangler `vars` or environment-specific configuration | Public OAuth web client ID |
| `GOOGLE_LOGIN_CLIENT_SECRET` | Wrangler secret; `.dev.vars` for local development only | OAuth web client secret |
| `GOOGLE_LOGIN_REDIRECT_URI` | Wrangler `vars` | Exact callback URI ending in `/api/auth/google/callback` |
| `SESSION_TTL_SECONDS` | Wrangler `vars` | Session lifetime; defaults to 28,800 seconds |

Do not add real credentials to `wrangler.jsonc`, source files, `.env.local`, or Git. The existing `.gitignore` excludes `.dev.vars`. For local development, create `worker/.dev.vars` manually and keep it untracked. For production, use Cloudflare secret bindings.

## Google Cloud Console

Create or select a Web application OAuth client for application login and register the callback exactly. Examples:

- Local: `http://localhost:8787/api/auth/google/callback`
- Production: `https://api.example.com/api/auth/google/callback`

Configure the consent screen for only `openid`, `email`, and `profile` during this phase. The application-login client does not need Google Contacts scopes. Production and preview origins and callback URLs must use HTTPS.

## Private office Worker deployment

The protected office build should serve the React application and API from the same Worker origin. Build with `VITE_APP_MODE=cloud` and leave `VITE_API_BASE_URL` empty so session cookies and API requests remain same-origin.

Worker static assets must use `run_worker_first: true`. The Worker validates an active D1 session and office membership before calling the `ASSETS` binding. The public `/login` page is rendered by the Worker without loading the React bundle.

The production values must use:

- `APP_ENV=production`
- `FRONTEND_ORIGIN=https://<office-worker-domain>`
- `GOOGLE_LOGIN_REDIRECT_URI=https://<office-worker-domain>/api/auth/google/callback`
- `GOOGLE_LOGIN_CLIENT_ID=<application-login web client ID>`
- `SESSION_TTL_SECONDS=28800` or another approved lifetime
- `GOOGLE_LOGIN_CLIENT_SECRET` as a Wrangler secret

See `OFFICE_ACCESS.md` for the guarded owner bootstrap procedure. Do not expose the application before the pending owner has been seeded.

No production values are configured by this repository change, and no remote resources are created or deployed in Phase C.
