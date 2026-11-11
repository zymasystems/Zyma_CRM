/* Zyma CRM — client directory cards and the client profile page.
 * Loaded before app.js. Everything here is called lazily by app.js, so it can rely on
 * app.js globals (state, esc, initials, calculatedProjectProgress, communicationDate, $, $$). */

const CP_STATE = { tab: "overview" };
const CP_DONE_STATUSES = ["Completed", "Cancelled"];

/* Each client gets a stable colour from a hand-picked, well-spaced set (names alone cluster too tightly on a hue wheel). */
const CP_HUES = [8, 32, 52, 100, 150, 176, 208, 262, 292, 326];
function cpHue(name) {
  let hash = 2166136261;
  for (const ch of String(name || "").trim().toLowerCase()) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return CP_HUES[hash % CP_HUES.length];
}
const cpNorm = value => String(value || "").trim().toLowerCase();
const cpToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const cpIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? new Date(`${value}T12:00:00`) : null;
function cpDate(value) {
  const date = cpIsoDate(value);
  return date ? date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : (value || "Not set");
}
function cpDaysFromToday(value) {
  const date = cpIsoDate(value);
  if (!date) return null;
  return Math.round((date - cpToday()) / 86400000);
}
function cpRelativeDays(days) {
  if (days === null) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${Math.abs(days)} days overdue`;
}

function cpRelations(client) {
  const name = cpNorm(client.name);
  const id = String(client.id);
  const projects = state.projects.filter(p => cpNorm(p.client) === name || (p.clientId && String(p.clientId) === id));
  const projectNames = new Set(projects.map(p => cpNorm(p.name)));
  const activeProjects = projects.filter(p => !CP_DONE_STATUSES.includes(p.status));
  const avgProgress = projects.length ? Math.round(projects.reduce((sum, p) => sum + calculatedProjectProgress(p), 0) / projects.length) : 0;
  const tasks = state.tasks.filter(t => projectNames.has(cpNorm(t.project)));
  const comms = state.communications.filter(c => cpNorm(c.client) === name);
  const overdueProjects = activeProjects.filter(p => { const d = cpDaysFromToday(p.due); return d !== null && d < 0; });
  const overdueFollowUps = comms.filter(c => c.status !== "Resolved" && (cpDaysFromToday(c.followUp) ?? 1) < 0);
  return {
    projects, activeProjects, avgProgress, tasks,
    openTasks: tasks.filter(t => !t.done && !["done", "completed"].includes(cpNorm(t.status))),
    contacts: state.contacts.filter(c => cpNorm(c.organization) === name && cpNorm(c.name) !== name).filter((c, i, all) => all.findIndex(o => cpNorm(o.name) === cpNorm(c.name) && cpNorm(o.email) === cpNorm(c.email)) === i),
    leads: state.leads.filter(l => cpNorm(l.company) === name),
    meetings: state.meetings.filter(m => cpNorm(m.lead) === name),
    comms, overdueProjects, overdueFollowUps,
    attention: overdueProjects.length + overdueFollowUps.length
  };
}

function cpRing(percent, size = 64, stroke = 6) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return `<svg class="cp-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${value}% average delivery progress">
    <circle class="cp-ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="cp-ring-value" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * value / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="cp-ring-text">${value}%</text>
  </svg>`;
}

function cpMono(client, extra = "") {
  return `<span class="cp-mono ${extra}" aria-hidden="true">${esc(client.short || initials(client.name || "?"))}</span>`;
}

function cpAvatarStack(contacts, max = 3) {
  if (!contacts.length) return `<span class="cp-muted-note">No contacts yet</span>`;
  const shown = contacts.slice(0, max).map(c => `<span class="cp-avatar" title="${esc(c.name)}">${esc(initials(c.name || "?"))}</span>`).join("");
  const more = contacts.length > max ? `<span class="cp-avatar cp-avatar-more">+${contacts.length - max}</span>` : "";
  return `<span class="cp-avatar-stack">${shown}${more}</span>`;
}

function cpStatusPill(client) {
  return `<span class="cp-status ${client.status === "Active" ? "is-active" : "is-inactive"}"><span class="cp-status-dot"></span>${esc(client.status || "Unclassified")}</span>`;
}

/* ---------- Directory card ---------- */
function clientCardMarkup(client) {
  const rel = cpRelations(client);
  const hue = cpHue(client.name);
  const delivery = rel.projects.length
    ? `<div class="cp-card-delivery">${cpRing(rel.avgProgress, 52, 5)}<div><strong>${rel.activeProjects.length} active</strong><span>${rel.projects.length} ${rel.projects.length === 1 ? "project" : "projects"} overall</span></div></div>`
    : `<div class="cp-card-delivery is-empty"><div><strong>No projects yet</strong><span>Start one from the client profile</span></div></div>`;
  return `<article class="cp-card" style="--h:${hue}">
    <div class="cp-card-banner"></div>
    <div class="cp-card-body">
      <div class="cp-card-head">
        ${cpMono(client)}
        ${cpStatusPill(client)}
      </div>
      <h3 class="cp-card-name"><button type="button" class="cp-card-link" data-open-record="client" data-record-id="${esc(client.id)}">${esc(client.name)}</button></h3>
      <p class="cp-card-industry">${esc(client.industry || "Industry not set")}</p>
      ${delivery}
      <dl class="cp-card-meta">
        <div><dt>Primary contact</dt><dd>${esc(client.contact || "Not set")}</dd></div>
        <div><dt>Client since</dt><dd>${esc(client.since || "—")}</dd></div>
      </dl>
      <div class="cp-card-foot">
        <span class="cp-card-people">${cpAvatarStack(rel.contacts)}${rel.attention ? `<span class="cp-flag" title="Overdue projects or follow-ups">${rel.attention} to review</span>` : ""}</span>
        <span class="cp-card-actions">${recordActionButtons("client", client.id)}</span>
      </div>
    </div>
  </article>`;
}

function clientSortValue(client, mode) {
  if (mode === "projects") return -cpRelations(client).projects.length;
  if (mode === "newest") return -(Date.parse(client.createdAt || "") || Number(client.id) || 0);
  return cpNorm(client.name);
}

/* ---------- Profile page ---------- */
function cpSafeEmail(value) { return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(value || "").trim()) ? String(value).trim() : ""; }
function cpSafePhone(value) { const digits = String(value || "").replace(/[^\d+]/g, ""); return digits.length >= 7 ? digits : ""; }

function cpField(label, value, href = "") {
  const body = value ? (href ? `<a href="${esc(href)}">${esc(value)}</a>` : esc(value)) : `<span class="cp-unset">Not provided</span>`;
  return `<div class="cp-field"><dt>${esc(label)}</dt><dd>${body}</dd></div>`;
}

function cpCard(title, body, { action = "", id = "", className = "" } = {}) {
  return `<section class="cp-card-panel ${className}" ${id}><header><h2>${esc(title)}</h2>${action}</header>${body}</section>`;
}


/* ---------- Zyma Pay: client financials ---------- */
function cpFinancialsPanel(client) {
  return cpCard("Financial overview", `
    <div class="cp-financials" data-cp-financials="${esc(client.id)}">
      <div class="cp-financial-loading">
        <span class="cp-financial-spinner" aria-hidden="true"></span>
        <span>Financial records will load when this tab is opened.</span>
      </div>
    </div>
  `);
}

function cpFinancialMoney(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function cpFinancialDate(value) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not set"
    : date.toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric"
      });
}

function cpFinancialStatusLabel(value) {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase();

  // Zyma Pay's payment API currently serializes its status enum as an integer.
  // Keep compatibility with both numeric enum values and text responses.
  const enumLabels = {
    "0": "Awaiting",
    "1": "Paid",
    "2": "Cancelled"
  };
  if (Object.prototype.hasOwnProperty.call(enumLabels, normalized)) {
    return enumLabels[normalized];
  }
  if (["paymentconfirmed", "payment confirmed"].includes(normalized)) return "Paid";
  if (["awaitingreflection", "awaiting reflection", "awaiting_reflection"].includes(normalized)) return "Awaiting";
  if (["canceled"].includes(normalized)) return "Cancelled";
  return raw || "Unknown";
}

function cpFinancialStatus(value) {
  const status = cpFinancialStatusLabel(value);
  const normalized = status.toLowerCase();
  const tone = normalized === "paid" ? "is-paid"
    : normalized.includes("awaiting") ? "is-pending"
    : normalized.includes("cancel") ? "is-cancelled"
    : "is-neutral";
  return `<span class="cp-financial-status ${tone}">${esc(status)}</span>`;
}

function cpFinancialTable(records, columns, emptyText) {
  if (!records.length) return `<p class="cp-empty">${esc(emptyText)}</p>`;
  return `
    <div class="cp-financial-table-wrap">
      <table class="cp-financial-table">
        <thead><tr>${columns.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
        <tbody>
          ${records.map(record => `<tr>${columns.map(c =>
            `<td>${c.render ? c.render(record) : esc(record[c.key] ?? "—")}</td>`
          ).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function cpRenderFinancials(host, data) {
  if (!host) return;

  const invoices = Array.isArray(data.invoices) ? data.invoices : [];
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const receipts = Array.isArray(data.receipts) ? data.receipts : [];

  const paid = payments
    .filter(p => cpFinancialStatusLabel(p.status) === "Paid")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const invoiceTotal = invoices.reduce(
    (sum, item) => sum + (Number(item.amount) || 0), 0
  );

  host.innerHTML = `
    <div class="cp-financial-summary">
      <div class="cp-financial-stat">
        <span>Total invoiced</span>
        <strong>${cpFinancialMoney(invoiceTotal)}</strong>
        <small>${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"}</small>
      </div>
      <div class="cp-financial-stat">
        <span>Payments received</span>
        <strong>${cpFinancialMoney(paid)}</strong>
        <small>${payments.length} ${payments.length === 1 ? "payment" : "payments"}</small>
      </div>
      <div class="cp-financial-stat">
        <span>Sales receipts</span>
        <strong>${receipts.length}</strong>
        <small>Recorded in Zyma Pay</small>
      </div>
    </div>

    <section class="cp-financial-section">
      <div class="cp-financial-heading">
        <h3>Invoices</h3><span>${invoices.length}</span>
      </div>
      ${cpFinancialTable(invoices, [
        {label:"Invoice", key:"invoiceNumber"},
        {label:"Invoice date", render:r=>esc(cpFinancialDate(r.invoiceDate))},
        {label:"Due date", render:r=>esc(cpFinancialDate(r.dueDate))},
        {label:"Amount", render:r=>`<strong>${cpFinancialMoney(r.amount)}</strong>`},
        {label:"Status", render:r=>cpFinancialStatus(r.status)}
      ], "No invoices are currently associated with this client.")}
    </section>

    <section class="cp-financial-section">
      <div class="cp-financial-heading">
        <h3>Payments</h3><span>${payments.length}</span>
      </div>
      ${cpFinancialTable(payments, [
        {label:"Invoice", key:"invoiceNumber"},
        {label:"Receipt", key:"receiptNumber"},
        {label:"Payment date", render:r=>esc(cpFinancialDate(r.paymentDate))},
        {label:"Method", key:"paymentMethod"},
        {label:"Amount", render:r=>`<strong>${cpFinancialMoney(r.amount)}</strong>`},
        {label:"Status", render:r=>cpFinancialStatus(r.status)}
      ], "No payments are currently associated with this client.")}
    </section>

    <section class="cp-financial-section">
      <div class="cp-financial-heading">
        <h3>Sales receipts</h3><span>${receipts.length}</span>
      </div>
      ${cpFinancialTable(receipts, [
        {label:"Receipt", key:"receiptNumber"},
        {label:"Reference", key:"reference"},
        {label:"Date", render:r=>esc(cpFinancialDate(r.receiptDate))},
        {label:"Payment mode", key:"paymentMode"},
        {label:"Amount", render:r=>`<strong>${cpFinancialMoney(r.amount)}</strong>`}
      ], "No sales receipts are currently associated with this client.")}
    </section>
    <p class="cp-financial-footnote">Read-only financial information synchronised from Zyma Pay.</p>
  `;
}

const CP_FINANCIAL_REQUESTS = new Map();

async function cpLoadFinancials(clientId, force = false) {
  const host = document.querySelector(`[data-cp-financials="${CSS.escape(String(clientId))}"]`);
  if (!host) return;

  if (!force && host.dataset.loaded === "true") return;
  if (CP_FINANCIAL_REQUESTS.has(String(clientId))) return;

  if (!window.ZymaCrmApi?.request) {
    host.innerHTML = `<p class="cp-financial-error">The CRM API client is unavailable. Reload the workspace and try again.</p>`;
    return;
  }

  host.innerHTML = `<div class="cp-financial-loading"><span class="cp-financial-spinner"></span><span>Loading financial records...</span></div>`;

  const request = (async () => {
    try {
      const data = await window.ZymaCrmApi.request(
        `/zyma-pay/clients/${encodeURIComponent(clientId)}/financials`,
        { method: "GET" }
      );

      const currentHost = document.querySelector(`[data-cp-financials="${CSS.escape(String(clientId))}"]`);
      if (!currentHost) return;

      if (data?.matched === false) {
        currentHost.innerHTML = `<div class="cp-financial-notice"><strong>No financial match</strong><p>No matching Zyma Pay client association was found. Check the client sync before linking financial records.</p></div>`;
        currentHost.dataset.loaded = "true";
        return;
      }

      cpRenderFinancials(currentHost, data || {});
      currentHost.dataset.loaded = "true";
    } catch (error) {
      const currentHost = document.querySelector(`[data-cp-financials="${CSS.escape(String(clientId))}"]`);
      if (!currentHost) return;
      currentHost.innerHTML = `
        <div class="cp-financial-error">
          <strong>Unable to load financial records</strong>
          <p>${esc(error.message || "An unexpected error occurred.")}</p>
          <button type="button" class="button button-secondary button-small" data-cp-financial-retry="${esc(clientId)}">Try again</button>
        </div>`;
    } finally {
      CP_FINANCIAL_REQUESTS.delete(String(clientId));
    }
  })();

  CP_FINANCIAL_REQUESTS.set(String(clientId), request);
  await request;
}

function cpProjectRow(project) {
  const pct = calculatedProjectProgress(project);
  const days = CP_DONE_STATUSES.includes(project.status) ? null : cpDaysFromToday(project.due);
  const dueNote = days !== null && days < 0 ? `<span class="cp-flag">${cpRelativeDays(days)}</span>` : "";
  return `<button type="button" class="cp-project" data-open-record="project" data-record-id="${esc(project.id)}">
    <span class="cp-project-main"><strong>${esc(project.name)}</strong><small>${esc([project.code, project.manager ? `Led by ${project.manager}` : ""].filter(Boolean).join(" · ") || "No reference yet")}</small></span>
    <span class="cp-project-progress"><span class="cp-bar"><span style="width:${pct}%"></span></span><b>${pct}%</b></span>
    <span class="cp-project-end"><span class="status-pill ${projectStatusClass(project.status)}">${esc(project.status)}</span><small>${project.due ? `Due ${esc(cpDate(project.due))}` : "No target date"}</small>${dueNote}</span>
  </button>`;
}

function cpPersonRow(contact) {
  const decision = /decision/i.test(`${contact.relationship || ""} ${contact.companyRole || ""}`);
  return `<button type="button" class="cp-person" data-open-record="contact" data-record-id="${esc(contact.id)}">
    <span class="cp-avatar cp-avatar-lg">${esc(initials(contact.name || "?"))}</span>
    <span class="cp-person-main"><strong>${esc(contact.name)}</strong><small>${esc(contact.jobTitle || contact.relationship || "Contact")}</small></span>
    <span class="cp-person-end">${decision ? `<span class="cp-tag">Decision maker</span>` : ""}<small>${esc(contact.email || contact.phone || "")}</small></span>
  </button>`;
}

function cpUpcoming(client, rel) {
  const items = [];
  rel.meetings.filter(m => !["Completed", "Cancelled"].includes(m.status)).forEach(m => {
    const days = cpDaysFromToday(m.date);
    if (days !== null) items.push({ days, icon: "▦", title: m.title || "Meeting", note: `${m.type || "Meeting"}${m.time ? ` at ${m.time}` : ""}`, type: "meeting", id: m.id });
  });
  rel.comms.filter(c => c.followUp && c.status !== "Resolved").forEach(c => {
    const days = cpDaysFromToday(c.followUp);
    if (days !== null) items.push({ days, icon: "↗", title: c.subject || "Follow-up", note: `Follow-up · ${c.channel || "Conversation"}` });
  });
  rel.activeProjects.forEach(p => {
    const days = cpDaysFromToday(p.due);
    if (days !== null) items.push({ days, icon: "◎", title: `${p.name} target date`, note: "Project milestone", type: "project", id: p.id });
  });
  return items.sort((a, b) => a.days - b.days).slice(0, 5);
}

function cpTimeline(client, rel) {
  const channelIcon = { Email: "✉", "Phone call": "☎", WhatsApp: "◉", "Microsoft Teams": "▦", "Meeting notes": "▤", "Project update": "↗", "Internal note": "✎" };
  const events = [
    ...rel.comms.map(c => ({ date: c.date || (c.createdAt || "").slice(0, 10), icon: channelIcon[c.channel] || "▤", title: c.subject || c.type || "Communication", note: [c.channel, c.owner, c.notes].filter(Boolean).join(" · "), status: c.status })),
    ...rel.meetings.map(m => ({ date: m.date, icon: "▦", title: m.title || "Meeting", note: [m.type, m.status, m.outcome].filter(Boolean).join(" · "), status: "" }))
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  if (!events.length) return `<p class="cp-empty">No conversations or meetings are logged for ${esc(client.name)} yet. Log a call, email or meeting from Communications and it will show up here.</p>`;
  return `<ol class="cp-timeline">${events.map(e => `<li><span class="cp-timeline-icon">${e.icon}</span><div><strong>${esc(e.title)}</strong><small>${esc(cpDate(e.date))}${e.status ? ` · ${esc(e.status)}` : ""}</small>${e.note ? `<p>${esc(e.note)}</p>` : ""}</div></li>`).join("")}</ol>`;
}

function renderClientProfile(client) {
  const rel = cpRelations(client);
  const hue = cpHue(client.name);
  const email = cpSafeEmail(client.email);
  const phone = cpSafePhone(client.phone);
  const portalActive = client.portalAccess === true || client.hasPortalAccess === true;
  const upcoming = cpUpcoming(client, rel);
  const record = esc(client.id);
  const healthChip = rel.attention
    ? `<span class="cp-chip is-warn">${rel.attention} ${rel.attention === 1 ? "item needs" : "items need"} attention</span>`
    : `<span class="cp-chip is-good">${rel.projects.length ? "Everything on track" : "No open issues"}</span>`;
  const portalBlock = portalActive
    ? `<div class="cp-portal is-on"><span class="cp-portal-dot"></span><div><strong>Portal access is on</strong><small>${esc(client.contact || "The client")} can follow project updates and raise support tickets.</small></div></div>`
    : `<div class="cp-portal"><span class="cp-portal-dot"></span><div><strong>Portal not activated</strong><small>Invite ${esc(client.contact || "the client")} to follow updates and raise tickets themselves.</small></div><a class="button button-secondary button-small" href="invite-client.html?clientId=${encodeURIComponent(client.id)}">Send invite</a></div>`;

  const kpi = (value, label, hint = "") => `<div class="cp-kpi"><strong>${value}</strong><span>${label}</span>${hint ? `<small>${hint}</small>` : ""}</div>`;

  const projectsList = rel.projects.length
    ? `<div class="cp-list">${[...rel.projects].sort((a, b) => Number(CP_DONE_STATUSES.includes(a.status)) - Number(CP_DONE_STATUSES.includes(b.status))).map(cpProjectRow).join("")}</div>`
    : `<p class="cp-empty">No projects are linked to this client yet.</p><button type="button" class="button button-primary button-small" data-create-project-for-client="${record}">＋ Create first project</button>`;
  const peopleList = rel.contacts.length
    ? `<div class="cp-list">${rel.contacts.map(cpPersonRow).join("")}</div>`
    : `<p class="cp-empty">No contacts are linked to this client. Add a contact and set its organization to “${esc(client.name)}”.</p>`;
  const upcomingList = upcoming.length
    ? `<ul class="cp-upcoming">${upcoming.map(u => `<li class="${u.days < 0 ? "is-overdue" : ""}"><span class="cp-upcoming-icon">${u.icon}</span><div>${u.type ? `<button type="button" class="cp-inline-link" data-open-record="${u.type}" data-record-id="${esc(u.id)}">${esc(u.title)}</button>` : `<strong>${esc(u.title)}</strong>`}<small>${esc(u.note)}</small></div><span class="cp-when">${esc(cpRelativeDays(u.days))}</span></li>`).join("")}</ul>`
    : `<p class="cp-empty">Nothing is scheduled. Book a meeting or set a follow-up to keep the relationship moving.</p>`;
  const recentActivity = state.activities.filter(a => String(a.text || "").toLowerCase().includes(cpNorm(client.name))).slice(0, 6);
  const activityList = recentActivity.length
    ? `<ol class="cp-timeline">${recentActivity.map(a => `<li><span class="cp-timeline-icon">${esc(a.icon)}</span><div><strong>${a.text}</strong><small>${esc(a.by)} · ${esc(a.time)}</small></div></li>`).join("")}</ol>`
    : `<p class="cp-empty">Changes made to this client will be listed here.</p>`;
  const origin = rel.leads[0] ? `Converted from a lead (${rel.leads[0].stage || "Won"})` : (client.sourceLeadId ? "Converted from a lead" : "Added directly");

  const tab = (key, label, count) => `<button type="button" role="tab" class="cp-tab${CP_STATE.tab === key ? " is-active" : ""}" id="cp-tab-${key}" aria-selected="${CP_STATE.tab === key}" aria-controls="cp-panel-${key}" tabindex="${CP_STATE.tab === key ? 0 : -1}" data-cp-tab="${key}">${label}${count === undefined ? "" : `<span>${count}</span>`}</button>`;
  const panel = (key, content) => `<div role="tabpanel" id="cp-panel-${key}" aria-labelledby="cp-tab-${key}" data-cp-panel="${key}" ${CP_STATE.tab === key ? "" : "hidden"}>${content}</div>`;
  const seeAll = (key, label) => `<button type="button" class="cp-inline-link" data-cp-tab="${key}">${label}</button>`;

  return `<div class="cp-profile" style="--h:${hue}">
    <div class="cp-crumb"><button class="cp-back" type="button" data-back-to-list><span aria-hidden="true">←</span> All clients</button></div>

    <header class="cp-hero">
      <div class="cp-hero-banner" aria-hidden="true"></div>
      <div class="cp-hero-main">
        ${cpMono(client, "cp-mono-xl")}
        <div class="cp-hero-id">
          <h1>${esc(client.name)}</h1>
          <p>${esc(client.industry || "Industry not set")}${client.since && client.since !== "—" ? ` · Client since ${esc(client.since)}` : ""}</p>
          <div class="cp-hero-chips">${cpStatusPill(client)}${healthChip}${portalActive ? `<span class="cp-chip">Portal active</span>` : ""}</div>
        </div>
        <div class="cp-hero-actions">
          <button class="button button-secondary" type="button" data-edit-record="client" data-record-id="${record}">Edit client</button>
          <button class="button button-primary" type="button" data-create-project-for-client="${record}">＋ New project</button>
        </div>
      </div>
    </header>

    <section class="cp-kpis" aria-label="Client summary">
      ${kpi(rel.projects.length, rel.projects.length === 1 ? "Project" : "Projects", `${rel.activeProjects.length} in delivery`)}
      <div class="cp-kpi cp-kpi-ring">${cpRing(rel.avgProgress, 60, 6)}<div><span>Average delivery</span><small>${rel.projects.length ? "Across all projects" : "No projects yet"}</small></div></div>
      ${kpi(rel.openTasks.length, rel.openTasks.length === 1 ? "Open task" : "Open tasks", `${rel.tasks.length - rel.openTasks.length} completed`)}
      ${kpi(rel.contacts.length, rel.contacts.length === 1 ? "Contact" : "Contacts", rel.contacts.some(c => /decision/i.test(c.relationship || "")) ? "Includes decision maker" : "")}
      ${kpi(rel.comms.length + rel.meetings.length, "Interactions", `${rel.meetings.length} meetings logged`)}
    </section>

    <div class="cp-tabs" role="tablist" aria-label="Client sections">
      ${tab("overview", "Overview")}${tab("projects", "Projects", rel.projects.length)}${tab("people", "People", rel.contacts.length)}${tab("activity", "Activity", rel.comms.length + rel.meetings.length)}${tab("financials", "Financials")}
    </div>

    <div class="cp-layout">
      <div class="cp-main">
        ${panel("overview", `
          ${cpCard("Coming up", upcomingList)}
          ${cpCard("Active work", rel.activeProjects.length ? `<div class="cp-list">${rel.activeProjects.slice(0, 3).map(cpProjectRow).join("")}</div>` : `<p class="cp-empty">${rel.projects.length ? "All projects for this client are complete." : "No projects are linked to this client yet."}</p>`, { action: rel.projects.length > 3 || (rel.projects.length && !rel.activeProjects.length) ? seeAll("projects", "See all projects") : "" })}
          ${cpCard("Key people", rel.contacts.length ? `<div class="cp-list">${rel.contacts.slice(0, 3).map(cpPersonRow).join("")}</div>` : `<p class="cp-empty">No contacts are linked to this client yet.</p>`, { action: rel.contacts.length > 3 ? seeAll("people", "See everyone") : "" })}
        `)}
        ${panel("projects", cpCard("Projects", projectsList))}
        ${panel("people", cpCard("People at " + client.name, peopleList))}
        ${panel("activity", cpCard("Conversations and meetings", cpTimeline(client, rel)) + cpCard("Record changes", activityList))}
        ${panel("financials", cpFinancialsPanel(client))}
      </div>

      <aside class="cp-side">
        ${cpCard("Get in touch", `
          <div class="cp-touch">
            <div class="cp-touch-person">${cpAvatarStack(rel.contacts.length ? rel.contacts.filter(c => cpNorm(c.name) === cpNorm(client.contact)).concat(rel.contacts).slice(0, 1) : [{ name: client.contact || client.name }], 1)}<div><strong>${esc(client.contact || "Primary contact not set")}</strong><small>Primary contact</small></div></div>
            <div class="cp-touch-actions">
              ${email ? `<a class="button button-secondary button-small" href="mailto:${esc(email)}">✉ Email</a>` : `<span class="button button-secondary button-small is-disabled" aria-disabled="true">✉ No email</span>`}
              ${phone ? `<a class="button button-secondary button-small" href="tel:${esc(phone)}">☎ Call</a>` : `<span class="button button-secondary button-small is-disabled" aria-disabled="true">☎ No phone</span>`}
            </div>
          </div>
          ${portalBlock}`)}
        ${cpCard("Details", `<dl class="cp-fields">
          ${cpField("Organization", client.name)}
          ${cpField("Industry", client.industry)}
          ${cpField("Email", client.email, email ? `mailto:${email}` : "")}
          ${cpField("Phone", client.phone, phone ? `tel:${phone}` : "")}
          ${cpField("Status", client.status)}
          ${cpField("Client since", client.since && client.since !== "—" ? client.since : "")}
          ${cpField("Origin", origin)}
          ${cpField("Reference", `ZS-${String(client.id).padStart(3, "0")}`)}
        </dl>`)}
        ${cpCard("Manage", `<div class="cp-manage"><button class="button button-secondary button-small" type="button" data-edit-record="client" data-record-id="${record}">Edit details</button><button class="button button-secondary button-small cp-danger" type="button" data-delete-record="client" data-record-id="${record}">Delete client</button></div>`)}
      </aside>
    </div>
  </div>`;
}

function openClientProfile(client, { resetTab = true } = {}) {
  if (resetTab) CP_STATE.tab = "overview";
  const view = $("#view-record-detail");
  view.dataset.recordType = "client";
  view.dataset.recordId = String(client.id);
  view.innerHTML = renderClientProfile(client);
  view.classList.add("cp-view");
}

/* Called by app.js after any re-render so edits show up without leaving the page. */
function refreshClientProfile() {
  const view = $("#view-record-detail");
  if (!view || !view.classList.contains("active") || view.dataset.recordType !== "client") return;
  const client = state.clients.find(item => String(item.id) === view.dataset.recordId);
  if (client) openClientProfile(client, { resetTab: false });
}

function cpSetTab(key) {
  CP_STATE.tab = key;
  $$("[data-cp-panel]").forEach(panel => { panel.hidden = panel.dataset.cpPanel !== key; });
  $$(".cp-tab[data-cp-tab]").forEach(btn => {
    const on = btn.dataset.cpTab === key;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", String(on));
    btn.tabIndex = on ? 0 : -1;
  });
}

document.addEventListener("click", event => {
  const trigger = event.target.closest("[data-cp-tab]");
  if (!trigger) return;
  cpSetTab(trigger.dataset.cpTab);
  if (trigger.classList.contains("cp-tab")) trigger.focus();
  else $(".cp-tabs")?.scrollIntoView({ block: "nearest", behavior: "smooth" });

  if (trigger.dataset.cpTab === "financials") {
    const clientId = $("#view-record-detail")?.dataset.recordId;
    if (clientId) void cpLoadFinancials(clientId);
  }
});
document.addEventListener("click", event => {
  const retry = event.target.closest("[data-cp-financial-retry]");
  if (!retry) return;
  void cpLoadFinancials(retry.dataset.cpFinancialRetry, true);
});

document.addEventListener("keydown", event => {
  const tab = event.target.closest?.(".cp-tab[data-cp-tab]");
  if (!tab || !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
  const tabs = $$(".cp-tab[data-cp-tab]");
  let index = tabs.indexOf(tab);
  if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
  if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
  if (event.key === "Home") index = 0;
  if (event.key === "End") index = tabs.length - 1;
  event.preventDefault();
  cpSetTab(tabs[index].dataset.cpTab);
  tabs[index].focus();
});
