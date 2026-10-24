# Zyma CRM contacts workflow

- Contacts is the shared people directory backed by the authenticated CRM API and PostgreSQL.
- Converted leads create and link a primary contact through the backend conversion workflow; the frontend reloads contacts after conversion rather than generating a duplicate browser-only record.
- Existing contacts are loaded from `GET /contacts`; create, edit and delete operations use `POST /contacts`, `PUT /contacts/{id}` and `DELETE /contacts/{id}`.
- The API-backed profile includes personal information, work and alternate email, direct and mobile phone, preferred contact method, LinkedIn, organization/client link, company role and details, registration and VAT numbers, full address, relationship type, source, last-contact date, next-follow-up date and notes.
- Extended profile fields are sent to and retrieved from the API. PostgreSQL is the source of truth once the expanded backend model and migration are deployed.
- The frontend can migrate legacy extended values from the current browser's local storage only where the server has no value. Each browser must be opened to migrate its own legacy local-only contact values.
- Contacts are associated with an existing client by matching the organization name to a client record. Contacts for organizations not yet in the client directory can be saved without a `ClientId`.
- The directory displays related organization and project context. Project tasks and milestones remain managed from the project/task workflow.
- Contacts with an API-backed record can be edited or deleted through the API; primary-contact changes are handled by the backend.
