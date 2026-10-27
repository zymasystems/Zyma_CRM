(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const api = window.ZymaCrmApi;
  if (!api) return;
  let tickets = [], activeTicket = null, filter = "All", busy = false;
  const statusLabel = s => ({InProgress:"In progress",AwaitingClient:"Awaiting client"}[s] || s || "Unknown");
  const date = value => { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-ZA",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d); };
  const feedback = (message, error = false) => { const el = $("#support-feedback"); if (el) { el.textContent = message; el.style.color = error ? "var(--danger, #dc2626)" : "var(--muted-2)"; } };
  const request = (path, options) => api.request(path, options);
  function render() {
    const query = ($("#support-search")?.value || "").trim().toLowerCase();
    const shown = tickets.filter(t => (filter === "All" || t.status === filter) && [t.ticketReference,t.subject,t.clientName,t.projectName,t.category].some(v => String(v || "").toLowerCase().includes(query)));
    $("#support-ticket-rows").innerHTML = shown.length ? shown.map(t => `<tr><td><span class="support-ticket-title">${esc(t.subject)}</span><span class="support-ticket-ref">${esc(t.ticketReference)}</span></td><td><span class="support-client-name">${esc(t.clientName || "Client")}</span><span class="support-project-name">${esc(t.projectName || "Project")}</span></td><td><span class="support-priority" data-priority="${esc(t.priority)}">${esc(t.priority || "Normal")}</span></td><td><span class="support-status" data-status="${esc(t.status)}">${esc(statusLabel(t.status))}</span></td><td>${esc(date(t.updatedAtUtc || t.createdAtUtc))}</td><td><button type="button" class="button button-secondary button-small" data-open-ticket="${esc(t.id)}">View ticket</button></td></tr>`).join("") : `<tr><td colspan="6" class="support-empty">${tickets.length ? "No tickets match these filters." : "No support tickets have been submitted yet."}</td></tr>`;
    $("#support-total").textContent = tickets.length;
    $("#support-open").textContent = tickets.filter(t => t.status === "Open").length;
    $("#support-progress").textContent = tickets.filter(t => t.status === "InProgress").length;
    $("#support-resolved").textContent = tickets.filter(t => ["Resolved","Closed"].includes(t.status)).length;
    $("#support-nav-count").textContent = tickets.filter(t => !["Resolved","Closed"].includes(t.status)).length;
  }
  async function loadTickets(quiet = false) {
    if (busy) return; busy = true;
    if (!quiet) { $("#support-ticket-rows").innerHTML = '<tr><td colspan="6" class="support-empty">Loading support tickets…</td></tr>'; feedback(""); }
    try { const data = await request("/support-requests"); tickets = Array.isArray(data) ? data : []; render(); if (!quiet) feedback(`Loaded ${tickets.length} ticket${tickets.length === 1 ? "" : "s"}.`); if (activeTicket) { const fresh = tickets.find(t => t.id === activeTicket.id); if (fresh) await openTicket(fresh.id, true); else closeDetail(); } }
    catch (e) { feedback(e.message || "Unable to load support tickets.", true); $("#support-ticket-rows").innerHTML = '<tr><td colspan="6" class="support-empty">Could not load tickets. Check the API connection and your staff permissions.</td></tr>'; }
    finally { busy = false; }
  }
  async function openTicket(id, quiet = false) {
    try {
      const t = await request(`/support-requests/${encodeURIComponent(id)}`); activeTicket = t;
      $("#support-detail-panel").hidden = false; $("#support-detail-reference").textContent = t.ticketReference || "SUPPORT TICKET"; $("#support-detail-subject").textContent = t.subject || "Support request";
      $("#support-detail-meta").textContent = `${t.clientName || "Client"} · ${t.projectName || "Project"} · ${t.category || "General"} · ${t.priority || "Normal"} priority · Created ${date(t.createdAtUtc)}`;
      let assignment = $("#support-assignment");
      if (!assignment) {
        assignment = document.createElement("div");
        assignment.id = "support-assignment";
        assignment.className = "support-assignment-row";
        $("#support-detail-meta").insertAdjacentElement("afterend", assignment);
      }
      const user = api.getUser ? api.getUser() : null;
      const userId = String(user?.id || user?.userId || "");
      const assignedId = String(t.assignedToUserId || t.assignedEmployeeId || t.assigneeId || "");
      const assignedName = t.assignedToName || t.assignedEmployeeName || t.assigneeName || "";
      const isAssignedToMe = assignedId && userId && assignedId.toLowerCase() === userId.toLowerCase();
      assignment.innerHTML = `<strong>Assigned to:</strong> ${esc(assignedName || (assignedId ? "Assigned staff member" : "Unassigned"))}${assignedId ? "" : ' <button type="button" class="button button-primary button-small" id="support-accept-ticket">Accept ticket</button>'}${isAssignedToMe ? ' <span class="support-status" data-status="InProgress">Assigned to you</span>' : ""}`;
      const acceptButton = $("#support-accept-ticket");
      if (acceptButton) acceptButton.addEventListener("click", async () => {
        acceptButton.disabled = true;
        try {
          await request(`/support-requests/${encodeURIComponent(t.id)}/accept`, {method:"POST", body:JSON.stringify({})});
          feedback("Ticket accepted and assigned to you.");
          await loadTickets(true);
          if (activeTicket) await openTicket(activeTicket.id, true);
        } catch (err) {
          feedback(err.message || "Unable to accept ticket. The assignment API may not be deployed yet.", true);
          acceptButton.disabled = false;
        }
      });
      $("#support-detail-description").textContent = t.description || "No description provided."; $("#support-status-select").value = t.status || "Open";
      const replies = Array.isArray(t.replies) ? t.replies : [];
      $("#support-replies").innerHTML = replies.length ? replies.map(r => `<article class="support-reply"><div class="support-reply-head"><span>${esc(r.authorName || r.authorRole || "Participant")} <span class="support-project-name">${esc(r.authorRole || "")}</span></span><time>${esc(date(r.createdAtUtc))}</time></div><p>${esc(r.body)}</p></article>`).join("") : '<p class="support-empty">No replies yet.</p>';
      const closed = ["Closed","Resolved"].includes(t.status); $("#support-reply-body").disabled = closed; $("#support-reply-form" ).querySelector('button[type="submit"]').disabled = closed;
      if (!quiet) { $("#support-detail-panel").scrollIntoView({behavior:"smooth",block:"start"}); feedback(`Opened ${t.ticketReference || "ticket"}.`); }
    } catch (e) { feedback(e.message || "Unable to load ticket details.", true); }
  }
  function closeDetail() { activeTicket = null; $("#support-detail-panel").hidden = true; $("#support-reply-body").value = ""; }
  $("#support-refresh")?.addEventListener("click", () => loadTickets());
  $("#support-search")?.addEventListener("input", render);
  $("#support-filters")?.addEventListener("click", e => { const b = e.target.closest("[data-support-filter]"); if (!b) return; filter = b.dataset.supportFilter; $("#support-filters").querySelectorAll("[data-support-filter]").forEach(x => x.classList.toggle("active", x === b)); render(); });
  $("#support-ticket-rows")?.addEventListener("click", e => { const b = e.target.closest("[data-open-ticket]"); if (b) openTicket(b.dataset.openTicket); });
  $("#support-close-detail")?.addEventListener("click", closeDetail);
  $("#support-save-status")?.addEventListener("click", async () => { if (!activeTicket) return; const status = $("#support-status-select").value; try { await request(`/support-requests/${encodeURIComponent(activeTicket.id)}/status`, {method:"PATCH",body:JSON.stringify({status})}); feedback("Ticket status updated."); await loadTickets(true); if (activeTicket) await openTicket(activeTicket.id, true); } catch (e) { feedback(e.message || "Unable to update ticket status.", true); } });
  $("#support-reply-form")?.addEventListener("submit", async e => { e.preventDefault(); if (!activeTicket) return; const body = $("#support-reply-body").value.trim(); if (!body) return; const button = e.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; try { await request(`/support-requests/${encodeURIComponent(activeTicket.id)}/replies`, {method:"POST",body:JSON.stringify({body})}); $("#support-reply-body").value = ""; feedback("Reply sent to the ticket conversation."); await loadTickets(true); if (activeTicket) await openTicket(activeTicket.id, true); } catch (err) { feedback(err.message || "Unable to send reply.", true); } finally { button.disabled = ["Closed","Resolved"].includes(activeTicket?.status); } });
  document.querySelectorAll('[data-view="support"]').forEach(el => el.addEventListener("click", () => loadTickets()));
  if (window.location.hash.replace("#", "") === "support") loadTickets();
})();
