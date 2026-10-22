# Zyma CRM — Internal Application

Standalone frontend for Zyma Systems staff and Super Admin. It is separate from the client-facing portal and shares data with that application only through the planned ASP.NET Core API.

## Pages and workflows
- `index.html`: staff login.
- `forgot-password.html` and `reset-password.html`: password recovery request and token-based password reset.
- `activate-account.html`: accept an employee invitation and set a password.
- `workspace.html`: dashboard, leads, meetings, clients, contacts, projects, tasks, communications, reports and settings.
- `tasks.html`: project picker plus project-specific task board/list and milestone management.
- `employees.html`: employee directory and access administration for Super Admin.

## Key CRM workflows
1. Add a lead and progress it through discovery, requirements, proposal, negotiation and agreement.
2. Convert a qualified lead to a client record.
3. Add/confirm a client record before creating a project.
4. Create a project linked to that client. Project reference can be generated automatically.
5. Open the project details and select **Manage tasks & milestones** to open its project-specific task workspace.
6. Add tasks and milestones, assign owners, due dates, priorities and statuses.
7. Record meetings, communications, follow-ups and outcomes against the relevant lead/client/project.
8. Authorized staff invite the client contact to the separate Client Portal. The portal displays only the projects and support records the API authorizes for that client.

## Local frontend preview
CRM records are kept in browser storage until API integration. A new storage namespace starts with an empty workspace so old pre-populated sample records are not loaded. Browser storage is not shared between users or devices and is not secure enough for production client data.

## Shared API
Default API base: `https://api.zyma.co.za`. The host is a planned integration target and must be configured when the API is deployed. The API adapter and authenticated bootstrap are not complete. Do not enable `apiMode` until record loading, writes, authentication and CSRF behavior are implemented and tested. The default CRM workspace currently uses browser-local preview storage.

See `BACKEND-INTEGRATION.md`, `AUTHENTICATION-SETUP.md` and `SHARED-API-ARCHITECTURE.md` for proposed API contracts and security requirements.
