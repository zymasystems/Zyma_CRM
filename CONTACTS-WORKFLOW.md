# Zyma CRM contacts workflow

- Contacts is the shared people directory backed by the authenticated CRM API.
- Converted leads create and link a primary contact through the backend conversion workflow; the frontend reloads contacts after conversion rather than generating a duplicate browser-only record.
- Existing contacts are loaded from `GET /contacts`; create, edit and delete operations use `POST /contacts`, `PUT /contacts/{id}` and `DELETE /contacts/{id}`.
- Contacts are associated with an existing client by matching the organization name to a client record. Contacts for organizations not yet in the client directory can be saved without a `ClientId`.
- The current backend persists full name, job title, department, email, phone, company name, primary-contact status and notes. Additional fields in the rich contact form (such as LinkedIn, alternate email, company registration/VAT details, address and follow-up dates) are retained in browser storage for that user only until those fields are added to the API/database schema.
- The directory displays related organization and project context. Project tasks and milestones remain managed from the project/task workflow.
- Contacts with an API-backed record can be edited or deleted through the API; primary-contact changes are handled by the backend.
