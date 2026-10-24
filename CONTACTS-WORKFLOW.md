# Zyma CRM contacts workflow

- Contacts is the shared people directory, not a separate list unrelated to sales.
- Each lead is represented in Contacts as a Prospect until its company is converted to a client.
- When a lead is converted, its existing linked contact becomes a Client contact; matching uses the linked lead ID first, then email plus organization to avoid duplicates.
- Clients without a lead-derived contact receive a linked primary contact in the directory.
- Contacts remain available across reloads in the same browser. In the current frontend, contacts are stored in browser local storage because the connected CRM API does not expose a contacts endpoint in this repository.
- Contacts show the related organization and the number of projects linked to that organization. Project tasks and milestones remain managed from the project/task workflow.
- Contacts linked to a lead or client cannot be deleted independently, because they are derived from that CRM relationship. Their profile details can still be edited.
