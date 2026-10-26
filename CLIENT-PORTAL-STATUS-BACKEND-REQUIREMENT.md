# Client portal status — backend requirement

The CRM frontend now displays `Client portal active` and hides the invitation link when a client API object includes `portalAccess: true` (or `hasPortalAccess: true`). The shared API must add this derived property to each client response, based on an active `CrmUser` whose `Role` is `Client` and whose `ClientId` matches the client ID. Do not store this status in browser localStorage; derive it from the database so it changes immediately after registration succeeds.

Recommended projection for `GET /clients`: `portalAccess = db.CrmUsers.Any(u => u.ClientId == client.Id && u.IsActive && u.Role == "Client")`. Keep all other client fields unchanged. Apply the same property to any single-client response used by the client profile detail view.
