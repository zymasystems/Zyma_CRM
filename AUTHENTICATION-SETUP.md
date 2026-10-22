# Zyma CRM authentication and employee administration

This package adds the login UI (`index.html`) and super-admin employee directory (`employees.html`). The UI is deliberately API-backed: it does not fake authentication, keep passwords in browser storage, or allow a browser-only role check to act as security.

## Required production backend

Implement these routes in the ASP.NET Core API before using this for real employee access:

- `POST /api/auth/login` — verify password against a strong password hash; set a `Secure`, `HttpOnly`, `SameSite=Lax` session cookie; return `{ "user": { "id": "...", "email": "...", "role": "super_admin|employee|sales|project_manager|viewer" } }`.
- `POST /api/auth/logout` — revoke the server session and clear cookie.
- `POST /api/auth/forgot-password` — always return a generic response; send a short-lived, single-use reset link if the account exists.
- `POST /api/auth/reset-password` — validate a single-use expiring token, update the password hash, revoke the token, and invalidate active sessions if policy requires.
- `POST /api/auth/accept-invitation` — validate an expiring single-use invitation token, set the employee password hash and activate the account.
- `GET /api/admin/employees` — require authenticated `super_admin`; return `{ "user": {...}, "employees": [...] }`.
- `POST /api/admin/employees` — require authenticated `super_admin`; create an employee with a random, unusable-until-accepted invitation state and send a single-use invite email. Do not accept a password from the admin form.
- `POST /api/admin/employees/{id}/resend-invitation` — require `super_admin`, rotate/revoke the previous invitation token and send a new one.
- `PATCH /api/admin/employees/{id}/status` — require `super_admin`; allow only `active` or `disabled`, prevent disabling/deleting the final super admin.

## Super-admin bootstrap

Provision `admin@zyma.co.za` on the server/database using a one-time deployment/seed command and a secret supplied through server environment configuration. Never hard-code a password in HTML/JavaScript or commit one to Git. Require a password reset / invite acceptance on first sign-in and enforce MFA for super-admin if possible. Do not grant super-admin based on an email address supplied by the browser; role must come from the database.

## Deployment requirements

1. Serve the login page at the intended CRM entry route and enforce authentication server-side for every protected API endpoint. Client-side redirects alone do not protect `workspace.html` or its data.
2. Use HTTPS only; configure secure cookies, CSRF protection for cookie-authenticated state-changing requests, rate limiting, account lockout/throttling, audit logs and generic login/reset errors.
3. Store employee, role, invitation, password-hash and session records in PostgreSQL. Use a modern password hash (Argon2id or ASP.NET Identity's supported password hasher), never plaintext passwords.
4. Send invitation and reset emails from a verified company email provider. Until this API is implemented, the UI will show a connection/permission error rather than storing employee records locally.
5. After backend integration, add integration tests for anonymous access, employee-vs-super-admin authorization, invite expiry/reuse, disabled accounts, logout/session expiry and CSRF protection.

## API response shape for employee rows

Each employee should include `id`, `name`, `email`, `role`, `status` (`invited`, `active`, `disabled`) and optional `lastActiveAt` ISO timestamp. Never return password hashes, session tokens, or invitation tokens to the browser.


### Forgot-password page

The login page links to `forgot-password.html`. Its form submits `{ email }` to `POST /api/auth/forgot-password`. The reset email should link to `reset-password.html?token=...`; that page submits the token and new password to `POST /api/auth/reset-password`. The API must generate a cryptographically random, single-use, time-limited reset token, store only a hash of that token, send the reset link to the account email, rate-limit requests, and always return a generic success response to avoid account enumeration. Do not confirm whether an email address exists. The frontend page is included, but password recovery is not functional until this backend endpoint and email delivery are implemented. The token-confirmation page and endpoint are included as frontend workflows; the server endpoint and email delivery still need to be implemented.


## Temporary demo mode (frontend only)

The current frontend-only sign-in flow is temporary and stores account/session state in browser local storage. Employee invitations and password setup are not sent to an email service. This is not authentication or authorization suitable for production: credentials and role state are client-side and can be modified by the user. Replace this flow with the ASP.NET Core authentication API before deployment to real users.
