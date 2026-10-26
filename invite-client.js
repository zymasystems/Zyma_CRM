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
  const nameInput = $("#invite-client-name");
  const idInput = $("#invite-client-id");
  const contactInput = $("#invite-contact-name");
  const emailInput = $("#invite-contact-email");

  const showMessage = (text, type = "") => {
    message.textContent = text;
    message.className = `auth-message ${type}`.trim();
  };

  function value(obj, camel, pascal) {
    return obj?.[camel] ?? obj?.[pascal] ?? "";
  }

  async function loadClient() {
    if (!clientId) {
      nameInput.value = "Client not selected";
      showMessage("Return to the CRM, open the correct client record, and choose “Invite client to portal”.");
      submit.disabled = true;
      return;
    }

    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      nameInput.value = "CRM session required";
      showMessage("Your CRM session is missing or expired. Sign in to the CRM again, then reopen this page.");
      submit.disabled = true;
      return;
    }

    nameInput.value = "Loading client…";
    submit.disabled = true;

    try {
      // Use the authenticated CRM API, not the browser's local preview snapshot.
      const response = await fetch(`${API_BASE}/clients`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json"
        },
        credentials: "omit"
      });

      if (response.status === 401) {
        throw new Error("Your CRM session has expired. Sign in again and reopen this page.");
      }
      if (response.status === 403) {
        throw new Error("Your account does not have permission to view clients. Sign in with an Admin account.");
      }
      if (!response.ok) {
        throw new Error(`Could not load CRM clients (HTTP ${response.status}).`);
      }

      const payload = await response.json();
      const clients = Array.isArray(payload) ? payload : payload?.items;
      if (!Array.isArray(clients)) {
        throw new Error("The CRM API returned an unexpected clients response.");
      }

      const client = clients.find(item =>
        String(value(item, "id", "Id")) === clientId
      );

      if (!client) {
        nameInput.value = "Client not found";
        showMessage("This client ID was not returned by the CRM API. Return to the client list and open the client again.");
        submit.disabled = true;
        return;
      }

      const id = String(value(client, "id", "Id"));
      nameInput.value = value(client, "companyName", "CompanyName") || "Unnamed client";
      idInput.value = id;
      contactInput.value = value(client, "contactPerson", "ContactPerson") || "";
      emailInput.value = value(client, "email", "Email") || "";
      emailInput.readOnly = true;
      emailInput.title = "The invitation is sent to the email address saved on this CRM client record.";

      if (!emailInput.value) {
        showMessage("This client record has no email address. Add the client's email in the CRM before sending an invitation.");
        submit.disabled = true;
        return;
      }

      showMessage("");
      submit.disabled = false;
    } catch (error) {
      nameInput.value = "Unable to load client";
      showMessage(error instanceof TypeError
        ? "Could not connect to the CRM API. Check the API connection and try again."
        : (error.message || "Could not load the client record."));
      submit.disabled = true;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity() || !idInput.value) return;

    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      showMessage("Your CRM session is missing or expired. Return to the CRM, sign in again, and reopen this page.");
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
        body: JSON.stringify({ clientId: idInput.value }),
        credentials: "omit"
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
      if (!message.classList.contains("success")) {
        submit.disabled = false;
        submit.querySelector("span").textContent = "Send invitation";
      }
    }
  });

  loadClient();
})();
