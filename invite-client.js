(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const API_BASE = "https://api.zyma.co.za/api/crm";
  const TOKEN_KEY = "zymaCrmAccessToken";
  const STORAGE_KEY = "zyma-crm-preview-v2";
  const query = new URLSearchParams(location.search);
  const clientId = query.get("clientId") || "";
  let client = null;

  try {
    const snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    client = (Array.isArray(snapshot.clients) ? snapshot.clients : [])
      .find(item => String(item.id) === clientId) || null;
  } catch (_) {}

  const form = $("#client-invite-form");
  const message = $("#invite-message");
  const submit = form.querySelector('[type="submit"]');
  const showMessage = (text, type = "") => {
    message.textContent = text;
    message.className = `auth-message ${type}`.trim();
  };

  if (client) {
    $("#invite-client-name").value = client.name || client.companyName || "";
    $("#invite-client-id").value = client.id;
    const emailInput = $("#invite-contact-email");
    // The API sends invitations to the email address stored on the CRM client record.
    if (client.email) emailInput.value = client.email;
    emailInput.readOnly = true;
    emailInput.title = "Invitation will be sent to the email address saved on this CRM client record.";
    $("#invite-contact-name").value = client.contactPerson || client.contactName || "";
    $("#invite-role").closest("label")?.remove();
    $("#invite-role").remove();
  } else {
    $("#invite-client-name").value = "Client not found";
    showMessage("Open a client record in the CRM and choose ‘Invite client to portal’. ");
    submit.disabled = true;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity() || !client) return;
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      showMessage("Your CRM session is missing or expired. Return to the CRM, sign in again, and reopen this invitation page.");
      return;
    }

    submit.disabled = true;
    submit.querySelector("span").textContent = "Sending…";
    showMessage("");

    try {
      const response = await fetch(`${API_BASE}/client-invitations`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ clientId: String(client.id) })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) throw new Error("Your CRM session has expired. Sign in again and retry.");
        if (response.status === 403) throw new Error("Your account does not have permission to invite clients. Sign in with an Admin account.");
        throw new Error(payload.message || payload.title || `The invitation could not be sent (HTTP ${response.status}).`);
      }
      showMessage(payload.message || "Invitation email submitted successfully.", "success");
      submit.querySelector("span").textContent = "Invitation sent";
    } catch (error) {
      showMessage(error instanceof TypeError
        ? "Could not connect to the CRM API. Check the API connection and browser console."
        : (error.message || "The invitation could not be sent. Please try again."));
    } finally {
      submit.disabled = false;
      if (!message.classList.contains("success")) submit.querySelector("span").textContent = "Send invitation";
    }
  });
})();
