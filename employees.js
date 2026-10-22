(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const rows = $("#employee-rows");
  const message = $("#employee-message");
  const modal = $("#employee-modal");
  const form = $("#employee-form");
  const save = $("#save-employee");
  const API = window.ZymaCrmApi;
  const USER_KEY = "zymaCrmAuthenticatedUser";
  let employees = [];
  let pendingCreatedThisSession = 0;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  const roleNames = {
    Admin: "Administrator",
    admin: "Administrator",
    super_admin: "Super admin",
    employee: "Employee",
    sales: "Sales & client relations",
    project_manager: "Project manager",
    viewer: "Read-only"
  };

  const notify = (target, text, type = "") => {
    target.textContent = text;
    target.className = `auth-message ${type}`.trim();
  };

  function getCurrentUser() {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); }
    catch (_) { return null; }
  }

  function statusFor(person) {
    return person.isActive ? "active" : "disabled";
  }

  function render() {
    const query = $("#employee-search").value.trim().toLowerCase();
    const filtered = employees.filter(person =>
      `${person.fullName} ${person.email} ${roleNames[person.role] || person.role}`
        .toLowerCase().includes(query)
    );

    $("#employee-count").textContent = String(employees.length);
    $("#active-count").textContent = String(employees.filter(person => person.isActive).length);
    // The current API does not expose a pending-invitations list. Do not invent a
    // persistent count from localStorage; show only invitations created this session.
    $("#pending-count").textContent = pendingCreatedThisSession ? String(pendingCreatedThisSession) : "—";

    if (!filtered.length) {
      rows.innerHTML = `<tr><td colspan="5" class="empty-cell">${query
        ? "No employees match your search."
        : "No employee accounts have been added yet. Use Add employee to create an invitation."}</td></tr>`;
      return;
    }

    rows.innerHTML = filtered.map(person => {
      const status = statusFor(person);
      const canChange = !["Admin", "admin", "super_admin"].includes(person.role);
      return `<tr>
        <td><span class="employee-name">${escapeHtml(person.fullName || "—")}</span><span class="employee-email">${escapeHtml(person.email)}</span></td>
        <td>${escapeHtml(roleNames[person.role] || person.role || "Employee")}</td>
        <td><span class="status-pill ${status}">${status === "active" ? "Active" : "Disabled"}</span></td>
        <td>${person.lastActiveAtUtc ? new Date(person.lastActiveAtUtc).toLocaleDateString() : "—"}</td>
        <td><div class="row-actions">${canChange
          ? `<button type="button" data-action="toggle" data-id="${escapeHtml(person.id)}" data-status="${status}">${status === "disabled" ? "Enable" : "Disable"}</button>`
          : `<span class="muted">Protected</span>`}</div></td>
      </tr>`;
    }).join("");
  }

  async function loadEmployees() {
    rows.innerHTML = '<tr><td colspan="5" class="empty-cell">Loading employee records from the server…</td></tr>';
    try {
      employees = await API.request("/admin/employees");
      if (!Array.isArray(employees)) throw new Error("The API returned an unexpected employee list.");
      render();
      notify(message, "Employee directory loaded from the live CRM API.", "success");
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="5" class="empty-cell">Could not load employees from the server.</td></tr>`;
      notify(message, error.message || "Unable to load employees. Please try again.");
    }
  }

  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    $("#employee-name").focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    form.reset();
    notify($("#employee-form-message"), "");
  }

  const current = API?.getUser?.() || getCurrentUser();
  if (!API || !API.getToken() || !current) {
    window.location.assign("index.html");
    return;
  }

  $("#admin-identity").textContent = current.email || "Workspace administration";
  loadEmployees();

  $("#open-add").addEventListener("click", openModal);
  $("#close-add").addEventListener("click", closeModal);
  $("#cancel-add").addEventListener("click", closeModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });
  $("#employee-search").addEventListener("input", render);

  $("#sign-out").addEventListener("click", () => {
    sessionStorage.removeItem("zymaCrmAuthenticatedUser");
    sessionStorage.removeItem("zymaCrmAccessToken");
    window.location.assign("index.html");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const email = $("#employee-email").value.trim().toLowerCase();
    const fullName = $("#employee-name").value.trim();
    const role = $("#employee-role").value;

    if (employees.some(person => String(person.email).toLowerCase() === email)) {
      notify($("#employee-form-message"), "An account with this email already exists.");
      return;
    }

    save.disabled = true;
    save.textContent = "Creating…";
    try {
      const invitation = await API.request("/admin/employees", {
        method: "POST",
        body: JSON.stringify({ email, fullName, role })
      });

      pendingCreatedThisSession += 1;
      closeModal();
      await loadEmployees();

      const activationUrl = new URL("activate-account.html", window.location.href);
      activationUrl.searchParams.set("token", invitation.activationToken);
      message.innerHTML = "";
      const text = document.createElement("p");
      text.textContent = `Invitation created for ${invitation.email}. No email was sent. Copy and securely share this activation link with the employee; it expires in 48 hours.`;
      const link = document.createElement("a");
      link.href = activationUrl.href;
      link.textContent = "Open activation link";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "outline-btn";
      copy.textContent = "Copy activation link";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(activationUrl.href);
          notify(message, `Activation link copied for ${invitation.email}. Share it securely; no email was sent.`, "success");
        } catch (_) {
          notify(message, "Clipboard access was blocked. Use “Open activation link” and copy the URL from your browser.", "");
        }
      });
      message.append(text, link, document.createTextNode(" "), copy);
      message.className = "auth-message success";
    } catch (error) {
      notify($("#employee-form-message"), error.message || "Could not create the invitation.");
    } finally {
      save.disabled = false;
      save.textContent = "Create invitation";
    }
  });

  rows.addEventListener("click", async event => {
    const button = event.target.closest('button[data-action="toggle"]');
    if (!button) return;
    const person = employees.find(item => String(item.id) === button.dataset.id);
    if (!person) return;

    button.disabled = true;
    try {
      await API.request(`/admin/employees/${encodeURIComponent(person.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: person.fullName || "",
          role: person.role,
          isActive: !person.isActive
        })
      });
      await loadEmployees();
      notify(message, `Access updated for ${person.email}.`, "success");
    } catch (error) {
      notify(message, error.message || "Could not update employee access.");
    } finally {
      button.disabled = false;
    }
  });
})();
