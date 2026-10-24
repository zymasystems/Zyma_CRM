# Zyma CRM frontend readiness

This package is the standalone internal CRM frontend. It does not include Zyma Pay, a client portal, or the broader Zyma OS.

## What is implemented in this frontend pass

- Zyma-branded dark and light themes, with browser-persisted theme preference.
- Navigation and search/filtering for dashboard, leads, clients, contacts, projects, and tasks.
- Create, edit and delete controls for lead, client, contact, project and task records.
- Task completion/reopening, dashboard metrics, activity feed, and CSV exports.
- Browser-local persistence for the preview records, so refreshes do not discard changes.
- A central repository boundary in `app.js` to keep storage concerns separate from rendering and event handling.
- Escaping of dynamic record values before insertion into HTML templates.

## Important preview limitation

The current persistence is browser-local only. It is not authentication, authorization, shared storage, or a substitute for PostgreSQL. Do not put confidential production client records in the preview. The authenticated request helper is used for Leads CRUD against the implemented ASP.NET Core endpoints. Clients, contacts, projects, tasks, meetings, communications and extended lead workspace fields remain browser-local until matching backend endpoints and fields are implemented and tested.

## Recommended API contract

Use a versioned API base such as `https://api.zyma.co.za/api/v1` (confirm the final host before deployment). Keep the frontend static on GitHub Pages and configure the API origin through a small deployment config rather than hard-coding environment-specific URLs into business logic.

Suggested resource routes:

- `GET/POST /leads`, `GET/PUT/DELETE /leads/{id}`
- `GET/POST /organizations`, `GET/PUT/DELETE /organizations/{id}` for client organizations
- `GET/POST /contacts`, `GET/PUT/DELETE /contacts/{id}`
- `GET/POST /projects`, `GET/PUT/DELETE /projects/{id}`
- `GET/POST /tasks`, `GET/PUT/DELETE /tasks/{id}`
- `GET /dashboard/summary`, `GET /activities`, `GET /reports/...`
- `GET /auth/csrf`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`

Use stable server-generated IDs (UUIDs recommended) and ISO 8601 dates (`YYYY-MM-DD` for date-only fields, UTC timestamps for audit/activity events). Use explicit DTOs rather than exposing EF Core entities directly. Return consistent validation errors (for example, `400` with field-level errors), `401` for unauthenticated requests, `403` for denied permissions, `404` for missing records, and `409` for uniqueness/conflict errors.

## Data model mapping notes

- A CRM client should map to an organization record, not a separate duplicate customer table.
- Contacts should reference `organizationId`, not rely on the organization name as a relationship key.
- Projects should reference `organizationId`; tasks should reference `projectId` and, when team assignments are implemented, `assigneeUserId`.
- Leads should have explicit pipeline stage, owner ID, next-follow-up date, and optional conversion reference to the resulting organization.
- Persist project progress from milestones/tasks or a defined project field; do not calculate it from arbitrary UI-only values.
- Activity records should be created by the server for auditable changes. The current preview activity feed is illustrative only.

## Security requirements before production

- Use HTTPS and exact CORS allow-list origins.
- Prefer secure, HttpOnly cookie authentication if frontend/API deployment and CSRF handling are configured together; protect unsafe requests with antiforgery tokens. Do not store session credentials in `localStorage`.
- Enforce RBAC and organization-level authorization in the API on every request; frontend visibility is not access control.
- Validate and normalize all data on the server, enforce unique constraints, rate-limit authentication, and audit privileged changes.
- Keep secrets out of this static repository. Configure backups and test restores before production use.

## Current integration status

- `GET /api/crm/leads` loads the shared lead pipeline after a staff JWT is present.
- `POST /api/crm/leads`, `PUT /api/crm/leads/{id}`, and `DELETE /api/crm/leads/{id}` are used for lead create, update/stage changes, and delete.
- The frontend maps company, contact, email, phone, industry, stage, service interest (`Requirements` in the current API model), and follow-up date (`DeadlineUtc`) to the backend.
- The current backend model does not persist the extended discovery, pricing, deposit, Zoho subscription, meeting, or activity fields shown in the lead workspace. Those fields remain browser-local and are explicitly labelled as such in the UI.
- Other CRM modules remain browser-local. Do not interpret the successful Leads integration as full CRM API integration.
- Browser testing from `https://crm.zyma.co.za` is still required to verify CORS, session expiry handling, and create/edit/stage/delete behavior.

## Deployment

`index.html`, `styles.css`, and `app.js` use relative references so they can be published together on GitHub Pages. The API helper is not yet connected to a running API. Do not describe this build as production-ready until browser tests, API integration tests, security tests, and deployment checks pass.


## Authentication navigation behavior

After login, all roles should land on `workspace.html`. Return the authenticated user from `GET /api/auth/me` (for example, `{ "user": { "id": "...", "name": "...", "email": "...", "role": "super_admin" } }`). The frontend uses that response to show Employee Management only for `super_admin`. Protect `GET/POST/PATCH /api/admin/employees...` on the server; hiding the link is only a user-interface convenience and is not authorization.


### Current development preview
The frontend currently supports a clearly labelled browser-only demo account: `admin@zyma.co.za` / `Luck`. This is solely for UI review before backend implementation. Do not treat localStorage as a security boundary or deploy demo authentication to production.
\n\n## Additional workflow endpoints\n\n- `POST /api/auth/accept-invitation` for employee account activation from `activate-account.html`.\n- `POST /api/auth/reset-password` for token-based password reset from `reset-password.html`.\n- `POST /api/invitations` to invite a client contact linked to a CRM client organization. The API must derive the organization association from an authorized staff action.\n- `POST /api/invitations/accept` for client account activation from the Client Portal. The invitation token, not a company name submitted by the browser, determines the organization.\n- `GET /api/portal/projects/{id}/milestones` for client-visible milestones.\n- `GET/POST /api/support/tickets` and `GET/PATCH /api/support/tickets/{id}` for client ticket creation and status updates.\n\nAll routes above are planned integration contracts and are not implemented in this frontend repository.\n

## Project delivery API integration update — 24 October 2026

The Tasks & Milestones page (`tasks.html` / `tasks.js`) now uses `crm-api.js` when an authenticated CRM session is present:

- Loads projects from `GET /projects`, tasks from `GET /tasks`, and milestones from `GET /milestones`.
- Creates and updates tasks through `POST /tasks` and `PUT /tasks/{id}`; deletes through `DELETE /tasks/{id}`.
- Creates and updates milestones through `POST /milestones` and `PUT /milestones/{id}`; deletes through `DELETE /milestones/{id}`.
- Maps the page's Kanban statuses to the API's supported task statuses, and maps milestone statuses to the API's supported milestone statuses.
- Shows an explicit message when API loading fails and browser-preview data is being shown.

Important remaining integration work:
- The main workspace's project create/edit flow still needs to be connected to `POST/PUT /projects`. Until then, projects must already exist in the backend database for tasks and milestones to be saved successfully.
- Task assignee selection is still a free-text UI field, while the API requires an optional staff-user GUID. This page preserves existing API assignments but does not create new assignments from free text.
- Staff-role authorization and client-specific portal authorization must be implemented and tested server-side before exposing these resources to client users.
- Browser testing on `https://crm.zyma.co.za` is still required after deployment.
