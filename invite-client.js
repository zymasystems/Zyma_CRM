(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const API_BASE = "https://api.zyma.co.za/api/crm";
  const TOKEN_KEY = "zymaCrmAccessToken";
  const query = new URLSearchParams(location.search);
  const clientId = query.get("clientId") || "";
  const form = $("#client-invite-form");
  const message = $("#invite-message");
  const submit = form.querySelector('[type="submit"]');
  let client = null;

  const showMessage = (text, type = "") => {
    message.textContent = text;
    message.className = `auth-message ${type}`.trim();
  };
  const readJson = async response => {
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      const error = new Error(payload.message || payload.title || `CRM API request failed (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  async function loadClient() {
    if (!clientId) throw new Error("No client ID was provided. Open a client record and choose ‘Invite client to portal’.");
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error("Your CRM session is missing or expired. Return to the CRM, sign in again, and reopen this page.");
    const response = await fetch(`${API_BASE}/clients`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      credentials: "omit"
    });
    const clients = await readJson(response);
    if (!Array.isArray(clients)) throw new Error("The CRM API returned an unexpected client list.");
    client = clients.find(item => String(item.id ?? item.Id) === String(clientId)) || null;
    if (!client) throw new Error("This client could not be found in the live CRM database. Return to Clients and reopen the correct record.");
    const name = client.companyName ?? client.CompanyName ?? "";
    const email = client.email ?? client.Email ?? "";
    const contact = client.contactPerson ?? client.ContactPerson ?? "";
    const portalActive = client.portalAccess === true || client.PortalAccess === true || client.hasPortalAccess === true || client.HasPortalAccess === true;
    $("#invite-client-name").value = name;
    $("#invite-client-id").value = String(client.id ?? client.Id);
    $("#invite-contact-name").value = contact;
    $("#invite-contact-email").value = email;
    $("#invite-contact-email").readOnly = true;
    $("#invite-contact-email").title = "Invitation is sent to the email saved on the CRM client record.";
    if (portalActive) {
      showMessage("This client already has an active portal account. No new invitation is needed.", "success");
      submit.disabled = true;
      submit.querySelector("span").textContent = "Portal already active";
    }
  }

  loadClient().catch(error => {
    $("#invite-client-name").value = "Client unavailable";
    showMessage(error.message || "Could not load this client from the CRM API.");
    submit.disabled = true;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity() || !client) return;
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { showMessage("Your CRM session is missing or expired. Sign in again."); return; }
    submit.disabled = true;
    submit.querySelector("span").textContent = "Sending…";
    showMessage("");
    try {
      const response = await fetch(`${API_BASE}/client-invitations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ clientId: String(client.id ?? client.Id) }),
        credentials: "omit"
      });
      const payload = await readJson(response);
      showMessage(payload.message || "Invitation email submitted successfully.", "success");
      submit.querySelector("span").textContent = "Invitation sent";
    } catch (error) {
      showMessage(error.message || "The invitation could not be sent. Please try again.");
      submit.querySelector("span").textContent = "Send invitation";
    } finally {
      if (!message.classList.contains("success")) submit.disabled = false;
    }
  });
})();
