# Shared API Architecture

## Applications and deployment
1. **Zyma CRM** — internal staff/Super Admin frontend, GitHub Pages at `https://crm.zyma.co.za`.
2. **Zyma Client Portal** — client-facing frontend, GitHub Pages at `https://portal.zyma.co.za`.
3. **Zyma API** — one ASP.NET Core Web API, planned at `https://api.zyma.co.za` and hosted behind Nginx on the Zyma VPS.
4. **PostgreSQL** — shared source of truth. Neither frontend connects directly to the database.

## End-to-end workflows
1. Staff record a lead and log discovery/financial meetings and follow-ups.
2. A qualified lead is converted to a CRM client organization and contact.
3. Staff create a project linked to that organization; tasks and milestones belong to the project.
4. Staff invite a named client contact from the client profile. The API issues a one-time invitation token tied to the organization and emails a link to `https://portal.zyma.co.za/client-register.html?token=...`.
5. The client activates the account, then signs in. The API returns only projects and support requests belonging to that organization.
6. Staff publish project milestones and development updates. The portal retrieves those records from the same API.
7. The client submits a support/maintenance ticket, optionally with an attachment. The API persists the ticket and returns its reference; staff review/update the ticket and the portal displays its status.
8. Both applications use API-mediated password recovery and token-based password reset.

## Planned endpoints
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `POST /api/auth/accept-invitation`
- Internal CRM resources: `/api/leads`, `/api/clients`, `/api/contacts`, `/api/projects`, `/api/tasks`, `/api/meetings`, `/api/communications`, `/api/activities`, `/api/reports`
- Employee administration: `/api/admin/employees` (Super Admin only)
- Client invitations: `POST /api/invitations` and `POST /api/invitations/accept`
- Client portal: `GET /api/portal/projects`, `GET /api/portal/projects/{id}/milestones`, `GET /api/portal/updates?projectId={id}`
- Support: `GET/POST /api/support/tickets`, `GET/PATCH /api/support/tickets/{id}`

These are integration targets, not live endpoints.

## Security requirements
- Hash passwords server-side with a modern password hasher; never store plaintext passwords or auth tokens in localStorage.
- Use expiring, single-use invitation and reset tokens, storing only token hashes.
- Use secure HttpOnly cookies or a carefully managed token design; protect cookie-authenticated mutations against CSRF.
- Enforce staff RBAC and client organization-level authorization on every endpoint. Derive the client's organization from the authenticated identity; never trust a client-supplied organization ID as authorization.
- Validate and size-limit uploaded files and store them outside the static frontend.
- Configure credentialed CORS for exactly `https://crm.zyma.co.za` and `https://portal.zyma.co.za`.
- Rate-limit login, invitation and password-recovery endpoints; use generic recovery responses and audit privileged changes.
