# Private office access setup

This application uses Google OpenID Connect for application login and a D1-backed allowlist for authorization. Google Contacts authorization remains a separate browser flow.

No public bootstrap endpoint exists. The first owner is created as a pending invitation through Wrangler, then bound to the immutable Google `sub` returned by the existing server-verified login flow.

## Local bootstrap

1. Apply the local migrations from `worker/`:

   ```text
   npm run db:migrate:local
   ```

2. Generate a random access ID locally:

   ```text
   node -e "console.log(crypto.randomUUID())"
   ```

3. Replace every placeholder in the command below. Use the owner's exact Google email for `OWNER_EMAIL` and its lowercase form for `OWNER_EMAIL_NORMALIZED`.

   ```text
   npx wrangler d1 execute contact-auto-save-local --local --persist-to .wrangler/state --command "INSERT INTO office_access (id, invited_email, invited_email_normalized, role, status, invited_at, updated_at) SELECT 'RANDOM_UUID', 'OWNER_EMAIL', 'OWNER_EMAIL_NORMALIZED', 'owner', 'pending', datetime('now'), datetime('now') WHERE NOT EXISTS (SELECT 1 FROM office_access WHERE role = 'owner' AND status IN ('pending', 'active'))"
   ```

4. Start the local Worker and complete Google application login with that exact account. The Worker verifies the Google ID token, claims the pending invitation, and binds it to the verified `sub` before creating a session.

5. Confirm the owner appears as `active` through the Office Users page. Do not inspect or copy OAuth tokens.

## Production bootstrap (only after deployment approval)

1. Create or select the production D1 database and apply migrations `0001`, `0002`, and `0003` using Wrangler `--remote`.
2. Run the same guarded `INSERT ... SELECT ... WHERE NOT EXISTS` statement against the production database with `--remote` and the production database name.
3. Configure the Worker secret `GOOGLE_LOGIN_CLIENT_SECRET` through Wrangler secret management.
4. Configure production Worker variables and build the frontend with `VITE_APP_MODE=cloud`.
5. Seed the pending owner before making the protected Worker URL available.
6. Complete the first owner login and verify access before inviting staff.

Never place the owner email, Google `sub`, OAuth client secret, session values, or Contacts access tokens in source files or frontend environment variables.

## Staff lifecycle

- The owner adds a staff email on `/office-users`.
- The invitation remains pending until the exact Google-verified email signs in.
- First login atomically binds the invitation to the immutable Google `sub`.
- Later logins authorize by `sub`, not by email.
- Revocation disables the membership and revokes all active application sessions.
- The last active owner cannot be revoked.

## Local history limitation

IndexedDB history remains local and is not migrated or reassigned. Different staff members must use separate browser profiles. Sharing one browser profile can expose locally stored import and save history to another approved user of that profile.
