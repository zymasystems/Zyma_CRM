"use strict";

// Theme preference is stored locally in this browser; no backend required.
const THEME_KEY = "zyma-crm-theme";
function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  const toggle = document.querySelector("#theme-toggle");
  if (toggle) {
    toggle.textContent = selected === "dark" ? "☼" : "☾";
    toggle.setAttribute("aria-label", selected === "dark" ? "Switch to light theme" : "Switch to dark theme");
    toggle.title = selected === "dark" ? "Switch to light theme" : "Switch to dark theme";
  }
}
applyTheme(localStorage.getItem(THEME_KEY) || "dark");
const dateLabel = document.querySelector("#dashboard-date");
if (dateLabel) dateLabel.textContent = new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }).format(new Date()).toUpperCase();

// Data access boundary: the UI uses this repository instead of talking to the DOM as storage.
// Local mode is for frontend development only. The eventual API adapter should use
// authenticated /api/v1 endpoints and server-issued antiforgery tokens; do not store auth tokens in localStorage.
const CRM_CONFIG = Object.assign({ apiBaseUrl: "", apiMode: false }, window.ZYMA_CRM_CONFIG || {});
const STORAGE_KEY = "zyma-crm-preview-v2";
const ENTITY_KEYS = ["leads", "clients", "contacts", "projects", "tasks", "activities", "meetings", "communications"];
const crmRepository = {
  load() {
    if (CRM_CONFIG.apiMode) return null; // API mode will be initialized by the async API bootstrap.
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return saved && typeof saved === "object" ? saved : null;
    } catch (error) {
      console.warn("Unable to read saved CRM preview data.", error);
      return null;
    }
  },
  save(currentState) {
    if (CRM_CONFIG.apiMode) return;
    try {
      const snapshot = Object.fromEntries(ENTITY_KEYS.map(key => [key, currentState[key]]));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Unable to persist CRM preview data.", error);
      toast("Changes are visible but could not be saved in this browser.");
    }
  },
  async request(path, options = {}) {
    if (!CRM_CONFIG.apiBaseUrl) throw new Error("CRM API base URL is not configured.");
    const response = await fetch(`${CRM_CONFIG.apiBaseUrl.replace(/\/$/, "")}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `CRM API request failed (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
  }
};

const state = {
  activeView: "dashboard",
  leadFilter: "all",
  clientFilter: "all",
  contactFilter: "all",
  projectFilter: "all",
  taskFilter: "all",
  leads: [],
  clients: [],
  contacts: [],
  projects: [],
  tasks: [],
  meetings: [],
  communications: [],
  communicationFilter: "all",
  activities: []
};

// Leads can be shown as a drag-and-drop board (default) or as a table; the choice is remembered in this browser.
const LEAD_VIEW_KEY = "zyma-crm-lead-view";
try { state.leadView = localStorage.getItem(LEAD_VIEW_KEY) === "table" ? "table" : "board"; } catch { state.leadView = "board"; }

// Start with an empty workspace in a fresh storage namespace; prior preview snapshots are not imported.
crmRepository.save(state);

function persistState() { crmRepository.save(state); }
// Persist clean/user-created records so the Tasks page reads the same dataset.
crmRepository.save(state);
function nextId(items) { return Math.max(0, ...items.map(item => Number(item.id) || 0)) + 1; }
function currentActorName() {
  try { const user = JSON.parse(sessionStorage.getItem("zymaCrmAuthenticatedUser") || "null"); return user?.name || user?.email || "Workspace user"; }
  catch { return "Workspace user"; }
}

// Leads and clients are API-backed when the authenticated CRM session is available.
// Contacts remain browser-local until a contacts endpoint is implemented.
const LEADS_API_ENABLED = Boolean(window.ZymaCrmApi && window.ZymaCrmApi.getToken());
const CLIENTS_API_ENABLED = LEADS_API_ENABLED;
const LEAD_EXTRAS_KEY = "zyma-crm-lead-extras-v1";
const API_LEAD_FIELDS = new Set([
  "id", "company", "contact", "email", "phone", "industry", "service",
  "stage", "owner", "followUp", "initials", "color", "apiBacked"
]);

function readLeadExtras() {
  try {
    const value = JSON.parse(localStorage.getItem(LEAD_EXTRAS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveLeadExtras(lead) {
  if (!lead || !lead.id) return;
  const extras = readLeadExtras();
  extras[String(lead.id)] = Object.fromEntries(
    Object.entries(lead).filter(([key]) => !API_LEAD_FIELDS.has(key))
  );
  try { localStorage.setItem(LEAD_EXTRAS_KEY, JSON.stringify(extras)); }
  catch { toast("Extended lead details could not be saved in this browser."); }
}

function removeLeadExtras(id) {
  const extras = readLeadExtras();
  delete extras[String(id)];
  try { localStorage.setItem(LEAD_EXTRAS_KEY, JSON.stringify(extras)); } catch {}
}

function mapApiLead(apiLead) {
  const deadline = apiLead.deadlineUtc || apiLead.DeadlineUtc || null;
  const deadlineDate = deadline ? String(deadline).slice(0, 10) : "";
  const parsedDeadline = deadlineDate ? parseDisplayDate(deadlineDate) : null;
  const id = String(apiLead.id || apiLead.Id);
  const company = apiLead.companyName || apiLead.CompanyName || "";
  return {
    ...readLeadExtras()[id],
    id,
    company,
    contact: apiLead.contactPerson || apiLead.ContactPerson || "",
    email: apiLead.email || apiLead.Email || "",
    phone: apiLead.phone || apiLead.Phone || "",
    industry: apiLead.industry || apiLead.Industry || "",
    service: apiLead.requirements || apiLead.Requirements || "",
    estimatedValue: apiLead.estimatedValue ?? apiLead.EstimatedValue ?? null,
    assignedToUserId: apiLead.assignedToUserId || apiLead.AssignedToUserId || null,
    stage: apiLead.stage || apiLead.Stage || "New",
    owner: "Unassigned",
    followUp: parsedDeadline
      ? parsedDeadline.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
      : "Not set",
    initials: initials(company),
    color: "orange",
    apiBacked: true
  };
}

function toApiLeadPayload(lead) {
  const parsedDate = parseDisplayDate(lead.followUp);
  return {
    companyName: String(lead.company || "").trim(),
    contactPerson: String(lead.contact || "").trim() || null,
    email: String(lead.email || "").trim(),
    phone: String(lead.phone || "").trim() || null,
    industry: String(lead.industry || "").trim() || null,
    stage: String(lead.stage || "New").trim() || "New",
    requirements: String(lead.service || "").trim() || null,
    estimatedValue: lead.estimatedValue == null || lead.estimatedValue === "" ? null : Number(lead.estimatedValue),
    deadlineUtc: parsedDate
      ? new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate())).toISOString()
      : null,
    assignedToUserId: lead.assignedToUserId || null
  };
}

async function loadApiLeads() {
  if (!LEADS_API_ENABLED) return;
  try {
    const response = await window.ZymaCrmApi.request("/leads");
    if (!Array.isArray(response)) throw new Error("The Leads API returned an unexpected response.");
    state.leads = response.map(mapApiLead);
    renderAll();
  } catch (error) {
    console.error("Unable to load API-backed leads.", error);
    toast(`Could not load leads from the API. ${error.message || "Please try again."}`);
  }
}

async function createApiLead(lead) {
  const response = await window.ZymaCrmApi.request("/leads", {
    method: "POST",
    body: JSON.stringify(toApiLeadPayload(lead))
  });
  return mapApiLead(response);
}

async function updateApiLead(lead) {
  const response = await window.ZymaCrmApi.request(`/leads/${encodeURIComponent(lead.id)}`, {
    method: "PUT",
    body: JSON.stringify(toApiLeadPayload(lead))
  });
  return response;
}

async function deleteApiLead(lead) {
  return window.ZymaCrmApi.request(`/leads/${encodeURIComponent(lead.id)}`, {
    method: "DELETE"
  });
}

function mapApiClient(apiClient) {
  const id = String(apiClient.id || apiClient.Id);
  const name = apiClient.companyName || apiClient.CompanyName || "";
  const createdAt = apiClient.createdAtUtc || apiClient.CreatedAtUtc;
  const createdDate = createdAt ? new Date(createdAt) : null;
  return {
    id,
    name,
    short: initials(name),
    industry: apiClient.industry || apiClient.Industry || "Not specified",
    email: apiClient.email || apiClient.Email || "",
    contact: apiClient.contactPerson || apiClient.ContactPerson || "",
    phone: apiClient.phone || apiClient.Phone || "",
    status: apiClient.status || apiClient.Status || "Active",
    projects: 0,
    since: createdDate && !Number.isNaN(createdDate.getTime())
      ? createdDate.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })
      : "—",
    color: "orange",
    apiBacked: true,
    sourceLeadId: apiClient.sourceLeadId || apiClient.SourceLeadId || null
  };
}

async function loadApiClients() {
  if (!CLIENTS_API_ENABLED) return;
  try {
    const response = await window.ZymaCrmApi.request("/clients");
    if (!Array.isArray(response)) throw new Error("The Clients API returned an unexpected response.");
    state.clients = response.map(mapApiClient);
    renderAll();
  } catch (error) {
    console.error("Unable to load API-backed clients.", error);
    toast(`Could not load clients from the API. ${error.message || "Please try again."}`);
  }
}

async function convertApiLeadToClient(lead) {
  const response = await window.ZymaCrmApi.request(`/leads/${encodeURIComponent(lead.id)}/convert`, {
    method: "POST",
    body: JSON.stringify({})
  });
  if (!response || !(response.id || response.Id)) {
    throw new Error("The conversion endpoint did not return a client record.");
  }
  return mapApiClient(response);
}

async function createApiClient(client) {
  const response = await window.ZymaCrmApi.request("/clients", {
    method: "POST",
    body: JSON.stringify({
      companyName: client.name,
      contactPerson: client.contact || null,
      email: client.email,
      phone: client.phone || null,
      industry: client.industry || null,
      status: client.status || "Active"
    })
  });
  return mapApiClient(response);
}

function calculatedProjectProgress(project) {
  const relatedTasks = state.tasks.filter(task => String(task.projectId ?? "") === String(project.id) || String(task.project || "").trim().toLowerCase() === String(project.name || "").trim().toLowerCase());
  if (!relatedTasks.length) return Math.max(0, Math.min(100, Number(project.progress) || 0));
  const completed = relatedTasks.filter(task => task.done === true || ["done", "completed"].includes(String(task.status || "").toLowerCase())).length;
  return Math.round((completed / relatedTasks.length) * 100);
}
function recordActionButtons(type, id) {
  return `<span class="record-actions"><button type="button" class="row-action-button" data-edit-record="${esc(type)}" data-record-id="${esc(id)}">Edit</button><button type="button" class="row-action-button danger" data-delete-record="${esc(type)}" data-record-id="${esc(id)}">Delete</button></span>`;
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));

function toast(message) {
  const region = $("#toast-region");
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), 3400);
}

function setView(view) {
  const target = $(`#view-${view}`);
  if (!target) return;
  state.activeView = view;
  $$(".view-section").forEach(section => section.classList.toggle("active", section === target));
  $$(".nav-item[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $("#breadcrumb-current").textContent = target.dataset.title || view;
  $("#sidebar").classList.remove("open");
  window.location.hash = view;
}

function stageClass(stage) {
  return ({ New: "status-planning", Discovery: "status-progress", "Follow-up": "status-progress", Requirements: "status-progress", Proposal: "status-planning", Negotiation: "status-hold", Agreement: "status-hold", Won: "status-done", Lost: "status-hold" })[stage] || "status-planning";
}
function projectStatusClass(status) {
  return ({ "In progress": "status-progress", Planning: "status-planning", Completed: "status-done", "On hold": "status-hold" })[status] || "status-planning";
}
function priorityClass(priority) {
  return ({ High: "priority-high", Medium: "priority-medium", Low: "priority-low" })[priority] || "priority-low";
}
function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}
function companyMark(short, color = "blue") {
  return `<span class="company-mark ${esc(color)}">${esc(short)}</span>`;
}
function getDashboardWeekStart(date = new Date()) {
  const day = date.getDay();
  const mondayOffset = (day + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset, 12);
  return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}-${String(monday.getDate()).padStart(2,"0")}`;
}
function renderMetricChangeBadges(metrics) {
  const key = "zyma-crm-dashboard-metric-history-v1";
  const week = getDashboardWeekStart();
  let history = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    history = Array.isArray(parsed) ? parsed.filter(row => row && /^\d{4}-\d{2}-\d{2}$/.test(row.week) && row.metrics && typeof row.metrics === "object") : [];
  } catch { history = []; }
  const previous = history.filter(row => row.week < week).sort((a,b) => a.week.localeCompare(b.week)).slice(-1)[0];
  const current = { week, metrics };
  const existing = history.findIndex(row => row.week === week);
  if (existing >= 0) history[existing] = current; else history.push(current);
  history = history.sort((a,b) => a.week.localeCompare(b.week)).slice(-12);
  try { localStorage.setItem(key, JSON.stringify(history)); } catch {}
  Object.entries(metrics).forEach(([name, value]) => {
    const badge = document.getElementById(`metric-${name}-change`);
    if (!badge) return;
    badge.className = "metric-change is-flat";
    if (!previous || !Number.isFinite(Number(previous.metrics[name]))) {
      badge.textContent = "New";
      badge.title = "Weekly comparison will be available after a previous weekly snapshot is recorded.";
      return;
    }
    const prior = Number(previous.metrics[name]);
    const delta = value - prior;
    if (prior === 0) {
      badge.textContent = delta === 0 ? "0%" : (delta > 0 ? "New" : "−100%");
    } else {
      const percent = Math.round(delta / prior * 100);
      badge.textContent = `${percent > 0 ? "+" : ""}${percent}%`;
    }
    badge.className = `metric-change ${delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat"}`;
    badge.title = `${delta > 0 ? "+" : ""}${delta} compared with the previous weekly snapshot (${prior}).`;
    badge.setAttribute("aria-label", `${badge.textContent} compared with the previous week`);
  });
}
function updateMetrics() {
  const openLeads = state.leads.filter(lead => !["Won", "Lost"].includes(lead.stage)).length;
  const openTasks = state.tasks.filter(task => !task.done && !["Done", "Completed"].includes(task.status)).length;
  const activeProjects = state.projects.filter(project => project.status !== "Completed").length;
  $("#metric-clients").textContent = String(state.clients.length).padStart(2, "0");
  $("#metric-projects").textContent = String(activeProjects).padStart(2, "0");
  $("#metric-leads").textContent = String(openLeads).padStart(2, "0");
  $("#metric-tasks").textContent = String(openTasks).padStart(2, "0");
  renderMetricChangeBadges({ clients: state.clients.length, projects: activeProjects, leads: openLeads, tasks: openTasks });
  $("#lead-nav-count").textContent = openLeads;
  $("#task-nav-count").textContent = openTasks;
  const meetingCount = state.meetings.length;
  if ($("#meeting-nav-count")) $("#meeting-nav-count").textContent = meetingCount;
  $("#lead-total").textContent = String(openLeads).padStart(2, "0");
  $("#lead-discovery").textContent = String(state.leads.filter(lead => lead.stage === "Discovery").length).padStart(2, "0");
  $("#lead-proposal").textContent = String(state.leads.filter(lead => lead.stage === "Proposal").length).padStart(2, "0");
  $("#lead-won").textContent = String(state.leads.filter(lead => lead.stage === "Won").length).padStart(2, "0");
  $("#all-lead-count").textContent = state.leads.length;
  $("#lead-table-count").textContent = `Showing ${state.leads.length} leads`;
  $("#client-total").textContent = String(state.clients.length).padStart(2, "0");
  if ($("#client-active-projects")) $("#client-active-projects").textContent = String(state.projects.filter(project => project.status !== "Completed").length).padStart(2, "0");
  $("#project-total").textContent = String(state.projects.length).padStart(2, "0");
  $("#report-clients").textContent = String(state.clients.length).padStart(2, "0");
  $("#report-leads").textContent = String(openLeads).padStart(2, "0");
}

function renderDashboardProjects() {
  $("#dashboard-projects").innerHTML = state.projects.slice(0, 4).map(project => `
    <div class="project-row">
      <div class="project-main">
        <span class="project-mark">${esc(initials(project.name))}</span>
        <div><strong>${esc(project.name)}</strong><small>${esc(project.client)}</small></div>
      </div>
      <div class="progress-track"><div class="progress-fill ${calculatedProjectProgress(project) >= 70 ? "green" : "blue"}" style="width:${calculatedProjectProgress(project)}%"></div></div>
      <span class="progress-label">${calculatedProjectProgress(project)}%</span>
    </div>`).join("") || `<p class="muted">No projects yet. Add a client, then create the first project.</p>`;
}

function renderDashboardTasks() {
  $("#dashboard-tasks").innerHTML = state.tasks.filter(task => !task.done).slice(0, 4).map(task => `
    <div class="task-row">
      <input class="task-check" type="checkbox" data-complete-task="${task.id}" aria-label="Mark ${esc(task.title)} complete">
      <div class="task-info"><strong>${esc(task.title)}</strong><small>${esc(task.project)} · ${esc(task.due)}</small></div>
      <span class="priority-pill ${priorityClass(task.priority)}">${esc(task.priority)}</span>
    </div>`).join("") || `<p class="muted">No open tasks. Create a project and assign its first task when work is ready.</p>`;
}

function renderActivity() {
  $("#dashboard-activity").innerHTML = state.activities.slice(0, 5).map(activity => `
    <div class="activity-item">
      <span class="activity-icon ${esc(activity.color)}">${esc(activity.icon)}</span>
      <div class="activity-copy"><p>${activity.text}</p><small>${esc(activity.by)} · ${esc(activity.time)}</small></div>
    </div>`).join("") || `<p class="muted">No activity recorded yet. Activity will appear as you create and update records.</p>`;
}

function renderPipeline() {
  const stages = [
    { name: "New", color: "#6aa9ff", hint: "Just added" },
    { name: "Discovery", color: "#b09aff", hint: "Qualifying" },
    { name: "Follow-up", color: "#52c69a", hint: "Next meeting" },
    { name: "Requirements", color: "#6aa9ff", hint: "Scoping solution" },
    { name: "Proposal", color: "#f28b35", hint: "Awaiting reply" },
    { name: "Negotiation", color: "#52c69a", hint: "In discussion" },
    { name: "Agreement", color: "#b09aff", hint: "Contract & deposit" }
  ];
  $("#pipeline-summary").innerHTML = stages.map(stage => {
    const count = state.leads.filter(lead => lead.stage === stage.name).length;
    return `<div class="pipeline-stage" style="--stage-color:${stage.color}"><small>${stage.name}</small><strong>${count}</strong><span>${stage.hint}</span></div>`;
  }).join("");
}

// Pipeline stages shown as board columns (same stage names used by filters, forms and the dashboard).
const LEAD_STAGES = [
  { name: "New", hint: "Just added", color: "var(--blue)" },
  { name: "Discovery", hint: "Qualifying the need", color: "var(--violet)" },
  { name: "Follow-up", hint: "Next meeting booked", color: "var(--green)" },
  { name: "Requirements", hint: "Scoping the solution", color: "var(--blue)" },
  { name: "Proposal", hint: "Offer sent, awaiting reply", color: "var(--orange)" },
  { name: "Negotiation", hint: "Terms in discussion", color: "#f2c06b" },
  { name: "Agreement", hint: "Contract & deposit", color: "var(--violet)" },
  { name: "Won", hint: "Accepted & converted", color: "var(--green)" },
  { name: "Lost", hint: "Rejected or went quiet", color: "var(--red)" }
];
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function parseDisplayDate(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const match = text.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/);
  if (!match) return null;
  const month = MONTH_ABBR.indexOf(match[2].toLowerCase());
  return month < 0 ? null : new Date(Number(match[3]), month, Number(match[1]));
}
function leadFollowUpOverdue(lead) {
  if (["Won", "Lost"].includes(lead.stage)) return false;
  const date = parseDisplayDate(lead.followUp);
  if (!date) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return date < today;
}
function leadFee(lead) {
  const fee = Number(lead.developmentFee);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}
const formatRand = value => `R ${Math.round(value).toLocaleString("en-ZA")}`;

function leadCard(lead) {
  const fee = leadFee(lead);
  const stageOptions = LEAD_STAGES.map(stage => `<option value="${esc(stage.name)}" ${stage.name === lead.stage ? "selected" : ""}>${esc(stage.name)}</option>`).join("");
  const dateText = lead.followUp && lead.followUp !== "—" ? lead.followUp : "No follow-up";
  return `<article class="lead-card${leadFollowUpOverdue(lead) ? " is-overdue" : ""}" draggable="true" data-lead-card="${esc(lead.id)}">
    <div class="lead-card-top">
      ${companyMark(lead.initials || initials(lead.company), lead.color)}
      <div class="lead-card-title"><button type="button" class="record-link" data-open-record="lead" data-record-id="${esc(lead.id)}">${esc(lead.company)}</button><small>${esc(lead.contact)}</small></div>
    </div>
    <p class="lead-service">${esc(lead.service)}</p>
    ${fee ? `<span class="lead-fee">${esc(formatRand(fee))}</span>` : ""}
    <div class="lead-card-meta">
      <span class="lead-owner"><i class="mini-avatar">${esc(initials(lead.owner || "?"))}</i>${esc(lead.owner || "Unassigned")}</span>
      <span class="lead-date" title="Next follow-up">${leadFollowUpOverdue(lead) ? "⚠ " : "◷ "}${esc(dateText)}</span>
    </div>
    <div class="lead-card-foot">
      <select class="lead-move" data-move-lead="${esc(lead.id)}" aria-label="Move ${esc(lead.company)} to another stage">${stageOptions}</select>
      <button type="button" class="row-action-button" data-edit-record="lead" data-record-id="${esc(lead.id)}">Edit</button>
    </div>
  </article>`;
}

function renderLeadBoard(leads) {
  const board = $("#leads-board");
  if (!board) return;
  board.innerHTML = LEAD_STAGES.map(stage => {
    const items = leads.filter(lead => lead.stage === stage.name);
    const total = items.reduce((sum, lead) => sum + leadFee(lead), 0);
    return `<div class="lead-column stage-${esc(stage.name.toLowerCase().replace(/[^a-z]/g, ""))}" data-lead-column="${esc(stage.name)}" style="--stage-color:${stage.color}">
      <div class="lead-column-head">
        <div><strong>${esc(stage.name)}</strong><small>${esc(stage.hint)}</small></div>
        <span class="lead-count">${items.length}</span>
        <button type="button" class="lead-add" data-add-lead-stage="${esc(stage.name)}" aria-label="Add a lead to ${esc(stage.name)}">＋</button>
      </div>
      ${total ? `<div class="lead-column-total">${esc(formatRand(total))} quoted</div>` : ""}
      <div class="lead-stack">${items.map(leadCard).join("") || `<div class="lead-empty">Drop a lead here</div>`}</div>
    </div>`;
  }).join("");
}

async function moveLead(id, stage) {
  const lead = state.leads.find(item => String(item.id) === String(id));
  if (!lead || !LEAD_STAGES.some(item => item.name === stage) || lead.stage === stage) return false;
  const previous = lead.stage;
  const nextLead = { ...lead, stage };
  try {
    if (LEADS_API_ENABLED && lead.apiBacked) await updateApiLead(nextLead);
    lead.stage = stage;
    state.activities.unshift({ icon: "↗", color: stage === "Won" ? "green" : stage === "Lost" ? "orange" : "blue", text: `<strong>Lead moved to ${esc(stage)}</strong> — ${esc(lead.company)} (was ${esc(previous)})`, by: currentActorName(), time: "Just now" });
    persistState(); renderAll();
    toast(`${lead.company} moved to ${stage}${LEADS_API_ENABLED && lead.apiBacked ? " and saved to the CRM database." : "."}`);
    return true;
  } catch (error) {
    toast(`Could not update lead stage. ${error.message || "Please try again."}`);
    renderLeads();
    return false;
  }
}

function renderLeads() {
  const query = ($("#lead-search")?.value || $("#global-search").value || "").trim().toLowerCase();
  const searched = state.leads.filter(lead => [lead.company, lead.contact, lead.service, lead.owner, lead.stage].join(" ").toLowerCase().includes(query));
  const filtered = searched.filter(lead => state.leadFilter === "all" || lead.stage === state.leadFilter);
  $("#leads-table").innerHTML = filtered.map(lead => `
    <tr>
      <td><div class="table-primary">${companyMark(lead.initials, lead.color)}<div><button type="button" class="record-link" data-open-record="lead" data-record-id="${esc(lead.id)}">${esc(lead.company)}</button><small>${esc(lead.contact)}</small></div></div></td>
      <td>${esc(lead.service)}</td>
      <td><span class="status-pill ${stageClass(lead.stage)}">${esc(lead.stage)}</span></td>
      <td>${esc(lead.owner)}</td><td>${esc(lead.followUp)}</td>
      <td>${recordActionButtons("lead", lead.id)}</td>
    </tr>`).join("") || `<tr><td colspan="6">No leads recorded yet. Select “New lead” to add an opportunity.</td></tr>`;
  renderLeadBoard(searched);
  const showBoard = state.leadView !== "table";
  $("#leads-board").classList.toggle("is-hidden", !showBoard);
  $("#leads-table-panel").classList.toggle("is-hidden", showBoard);
  $$("#lead-view-tabs [data-lead-view]").forEach(tab => tab.classList.toggle("active", tab.dataset.leadView === (showBoard ? "board" : "table")));
}

function clientProjectCount(client) {
  const name = String(client.name || "").trim().toLowerCase();
  return state.projects.filter(project => String(project.client || "").trim().toLowerCase() === name).length;
}

function renderClients() {
  const query = (($('#client-search')?.value || $('#global-search')?.value || '')).trim().toLowerCase();
  const activeCount = state.clients.filter(client => client.status === "Active").length;
  const inactiveCount = state.clients.length - activeCount;
  const activeProjects = state.projects.filter(project => ["In progress", "Planning", "Review", "On hold"].includes(project.status)).length;
  const industries = new Set(state.clients.map(client => String(client.industry || "Other").trim()).filter(Boolean));
  const putText = (selector, value) => { const element = $(selector); if (element) element.textContent = value; };
  putText("#client-total", String(state.clients.length).padStart(2, "0"));
  putText("#client-heading-count", String(state.clients.length).padStart(2, "0"));
  putText("#client-active-count", String(activeCount).padStart(2, "0"));
  putText("#client-active-projects", String(activeProjects).padStart(2, "0"));
  putText("#client-industry-count", String(industries.size).padStart(2, "0"));
  putText("#client-filter-all-count", String(state.clients.length).padStart(2, "0"));
  putText("#client-filter-active-count", String(activeCount).padStart(2, "0"));
  putText("#client-filter-inactive-count", String(inactiveCount).padStart(2, "0"));

  const filtered = state.clients.filter(client => {
    const matchesQuery = [client.name, client.industry, client.email, client.contact, client.status].join(" ").toLowerCase().includes(query);
    const matchesStatus = state.clientFilter === "all" || client.status === state.clientFilter;
    return matchesQuery && matchesStatus;
  });
  putText("#client-results-count", `${filtered.length} ${filtered.length === 1 ? "client" : "clients"}`);
  $$("#client-filters [data-client-filter]").forEach(button => button.classList.toggle("active", button.dataset.clientFilter === state.clientFilter));

  $("#client-grid").innerHTML = filtered.map(client => {
    const projects = state.projects.filter(project => String(project.client || "").trim().toLowerCase() === String(client.name || "").trim().toLowerCase());
    const activeForClient = projects.filter(project => project.status !== "Completed" && project.status !== "Cancelled");
    const avgProgress = projects.length ? Math.round(projects.reduce((total, project) => total + calculatedProjectProgress(project), 0) / projects.length) : 0;
    const contactCount = state.contacts.filter(contact => String(contact.organization || "").trim().toLowerCase() === String(client.name || "").trim().toLowerCase()).length;
    return `<article class="client-card client-card-polished">
      <div class="client-card-head">
        ${companyMark(client.short, client.color)}
        <div class="client-card-identity"><h3><button type="button" class="record-link client-title-link" data-open-record="client" data-record-id="${esc(client.id)}">${esc(client.name)}</button></h3><p>${esc(client.industry || "Industry not set")}</p></div>
        <span class="status-pill ${client.status === "Active" ? "status-done" : "status-hold"}">${esc(client.status || "Unclassified")}</span>
      </div>
      <div class="client-contact-line"><span class="client-contact-icon">✉</span><span title="${esc(client.email || "No email provided")}">${esc(client.email || "No email provided")}</span></div>
      <div class="client-contact-line"><span class="client-contact-icon">♧</span><span>${esc(client.contact || "Primary contact not set")}</span></div>
      <div class="client-project-summary"><div class="client-project-summary-top"><span>Project delivery</span><strong>${projects.length ? `${avgProgress}%` : "No projects"}</strong></div><div class="client-progress-track"><span style="width:${projects.length ? avgProgress : 0}%"></span></div><small>${activeForClient.length} active ${activeForClient.length === 1 ? "project" : "projects"}</small></div>
      <div class="client-card-stats"><div><strong>${projects.length}</strong><span>Projects</span></div><div><strong>${contactCount}</strong><span>Contacts</span></div><div><strong>${esc(client.since || "—")}</strong><span>Client since</span></div></div>
      <div class="client-card-footer"><span class="client-status-note"><span class="summary-dot ${client.status === "Active" ? "green-dot" : "orange-dot"}"></span>${client.status === "Active" ? "Relationship active" : "Review relationship"}</span><div class="client-card-actions">${recordActionButtons("client", client.id)}</div></div>
    </article>`;
  }).join("") || `<div class="client-empty-state"><span>⌕</span><h3>No clients found</h3><p>Try another search or change the status filter.</p><button type="button" class="button button-secondary" data-client-reset>Clear filters</button></div>`;
}

function renderContacts() {
  const query = (($("#contact-search")?.value || "").trim()).toLowerCase();
  const all = state.contacts || [];
  const decisionCount = all.filter(c => /decision maker/i.test(c.relationship || "")).length;
  const projectCount = all.filter(c => /project/i.test(c.relationship || "")).length;
  const clientCount = all.filter(c => /client/i.test(c.relationship || "")).length;
  const orgCount = new Set(all.map(c => String(c.organization || "").trim()).filter(Boolean).map(v => v.toLowerCase())).size;
  const setMetric = (id, value) => { const el = $(id); if (el) el.textContent = String(value).padStart(2, "0"); };
  setMetric("#contact-heading-count", all.length);
  setMetric("#contact-total", all.length);
  setMetric("#contact-org-count", orgCount);
  setMetric("#contact-decision-count", decisionCount);
  setMetric("#contact-project-count", projectCount);
  setMetric("#contact-filter-all-count", all.length);
  setMetric("#contact-filter-decision-count", decisionCount);
  setMetric("#contact-filter-project-count", projectCount);
  setMetric("#contact-filter-client-count", clientCount);
  const filtered = all.filter(contact => {
    const values = Object.values(contact).filter(value => value !== null && value !== undefined).join(" ").toLowerCase();
    return (state.contactFilter === "all" || (contact.relationship || "") === state.contactFilter) && values.includes(query);
  });
  const grid = $("#contact-card-grid");
  if (!grid) return;
  grid.innerHTML = filtered.map(contact => {
    const name = contact.name || "Unnamed contact";
    const organization = contact.organization || "Organization not set";
    const relationship = contact.relationship || "Contact";
    const email = contact.email || contact.workEmail || "";
    const phone = contact.phone || contact.mobile || "";
    const title = contact.jobTitle || contact.title || contact.position || "Role not provided";
    const roleClass = /decision maker/i.test(relationship) ? "contact-role-decision" : /project/i.test(relationship) ? "contact-role-project" : /supplier|partner/i.test(relationship) ? "contact-role-partner" : "contact-role-client";
    const safePhone = phone.replace(/[^+\d]/g, "");
    return `<article class="contact-card">
      <div class="contact-card-top"><span class="contact-avatar">${esc(initials(name))}</span><span class="contact-relationship ${roleClass}">${esc(relationship)}</span></div>
      <div class="contact-card-identity"><h3><button type="button" class="record-link contact-name-link" data-open-record="contact" data-record-id="${esc(contact.id)}">${esc(name)}</button></h3><p>${esc(title)}</p></div>
      <div class="contact-organization"><span class="contact-info-icon">▦</span><span><small>Organization</small><strong>${esc(organization)}</strong></span></div>
      <div class="contact-info-list">${email ? `<a class="contact-info-row" href="mailto:${esc(email)}"><span class="contact-info-icon">✉</span><span>${esc(email)}</span></a>` : `<div class="contact-info-row contact-info-muted"><span class="contact-info-icon">✉</span><span>Email not provided</span></div>`}${phone ? `<a class="contact-info-row" href="tel:${esc(safePhone)}"><span class="contact-info-icon">⌕</span><span>${esc(phone)}</span></a>` : `<div class="contact-info-row contact-info-muted"><span class="contact-info-icon">⌕</span><span>Phone not provided</span></div>`}</div>
      <div class="contact-card-footer"><span class="contact-updated-note">${contact.nextFollowUp ? `Follow-up · ${esc(contact.nextFollowUp)}` : contact.department ? esc(contact.department) : "Contact profile"}</span><div class="contact-card-actions">${recordActionButtons("contact", contact.id)}</div></div>
    </article>`;
  }).join("") || `<div class="contact-empty-state"><span>◎</span><h3>No contacts found</h3><p>Try a different search or filter, or add a new contact to your directory.</p><button type="button" class="button button-secondary" data-contact-reset>Clear filters</button></div>`;
  const resultCount = $("#contact-results-count");
  if (resultCount) resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? "contact" : "contacts"}`;
  $$("[data-contact-filter]", $("#contact-filters")).forEach(button => button.classList.toggle("active", button.dataset.contactFilter === state.contactFilter));
}

function renderProjects() {
  const query = ($("#project-search")?.value || $("#global-search")?.value || "").trim().toLowerCase();
  const filtered = state.projects.filter(project => {
    const statusMatch = state.projectFilter === "all" || project.status === state.projectFilter;
    return statusMatch && [project.name, project.client, project.code, project.manager].join(" ").toLowerCase().includes(query);
  });
  $("#projects-table").innerHTML = filtered.map(project => `
    <tr><td><div class="table-primary">${companyMark(initials(project.name), project.color)}<div><button type="button" class="record-link" data-open-record="project" data-record-id="${esc(project.id)}">${esc(project.name)}</button><small>${esc(project.code)}</small></div></div></td><td>${esc(project.client)}</td><td><span class="status-pill ${projectStatusClass(project.status)}">${esc(project.status)}</span></td><td><div style="display:flex;align-items:center;gap:9px;min-width:105px"><div class="progress-track" style="flex:1"><div class="progress-fill ${calculatedProjectProgress(project) >= 70 ? "green" : "blue"}" style="width:${calculatedProjectProgress(project)}%"></div></div><span>${calculatedProjectProgress(project)}%</span></div></td><td>${esc(project.due)}</td><td>${esc(project.manager)}</td><td>${recordActionButtons("project", project.id)}</td></tr>`).join("") || `<tr><td colspan="7">No projects recorded yet. Create a client first, then create a project linked to that client.</td></tr>`;
}

function renderTasks() {
  const query = ($("#task-search")?.value || $("#global-search")?.value || "").trim().toLowerCase();
  const filtered = state.tasks.filter(task => {
    const statusForFilter = state.taskFilter === "all" || (state.taskFilter === "High" ? task.priority === "High" : task.status === state.taskFilter);
    return statusForFilter && [task.title, task.project, task.assignee, task.priority, task.status].join(" ").toLowerCase().includes(query);
  });
  $("#tasks-table").innerHTML = filtered.map(task => `
    <tr><td><div class="table-primary"><input class="task-check" type="checkbox" data-complete-task="${task.id}" aria-label="Complete ${esc(task.title)}" ${task.done ? "checked" : ""}><div><button type="button" class="record-link" data-open-record="task" data-record-id="${esc(task.id)}">${esc(task.title)}</button><small>Task #${String(task.id).padStart(3, "0")}</small></div></div></td><td>${esc(task.project)}</td><td>${esc(task.assignee)}</td><td><span class="priority-pill ${priorityClass(task.priority)}">${esc(task.priority)}</span></td><td><span class="status-pill ${task.done ? "status-done" : task.status === "In progress" ? "status-progress" : "status-planning"}">${task.done ? "Done" : esc(task.status)}</span></td><td>${esc(task.due)}</td><td>${recordActionButtons("task", task.id)}</td></tr>`).join("") || `<tr><td colspan="7">No tasks recorded yet. Create a project, then add tasks and milestones.</td></tr>`;
}

// ---------------------------
// Record detail pages
// ---------------------------

const recordCollections = {
  meeting: "meetings",
  lead: "leads",
  client: "clients",
  contact: "contacts",
  project: "projects",
  task: "tasks"
};

function detailValue(label, value) {
  return `<div class="detail-field"><span>${esc(label)}</span><strong>${esc(value || "Not provided")}</strong></div>`;
}

function detailSection(title, content, emptyText = "No related records yet.") {
  return `<section class="panel detail-panel"><div class="panel-heading"><div><h2>${esc(title)}</h2></div></div>${content || `<p class="muted detail-empty">${esc(emptyText)}</p>`}</section>`;
}

function relatedRecordLink(type, record, title, subtitle = "") {
  return `<button type="button" class="related-record" data-open-record="${esc(type)}" data-record-id="${esc(record.id)}"><span><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</span><span aria-hidden="true">↗</span></button>`;
}

function openRecordDetail(type, id) {
  const collection = recordCollections[type];
  const record = collection && state[collection].find(item => String(item.id) === String(id));
  if (!record) return toast("Record not found.");

  const title = record.name || record.company || record.title || record.code || "Record details";
  const subtitleMap = {meeting:"MEETING DETAILS",client:"CLIENT PROFILE",lead:"LEAD PROFILE",contact:"CONTACT PROFILE",project:"PROJECT DETAILS",task:"TASK DETAILS"};
  let fields = [];
  let related = "";
  let activities = state.activities.filter(a => (a.text || "").toLowerCase().includes(String(title).toLowerCase()));

  if (type === "meeting") {
    const safeMeetingUrl = getSafeMeetingUrl(record.location);
    const dateLabel = record.date ? new Date(`${record.date}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date not set";
    fields = [
      detailValue("Meeting title", record.title), detailValue("Lead / client", record.lead),
      detailValue("Meeting type", record.type), detailValue("Date", dateLabel),
      detailValue("Start time", record.time || "Not set"), detailValue("Duration", `${record.duration || 30} minutes`),
      detailValue("Status", record.status), detailValue("Attendees", record.attendees),
      detailValue("Next action", record.nextAction)
    ];
    related = detailSection("Meeting link", safeMeetingUrl
      ? `<div class="meeting-link-card"><div><strong>Microsoft Teams</strong><p>Join this scheduled session using the saved meeting link.</p></div><a class="button button-primary" href="${esc(safeMeetingUrl)}" target="_blank" rel="noopener noreferrer">Join meeting ↗</a><button type="button" class="button button-secondary" data-copy-meeting-link="${esc(safeMeetingUrl)}">Copy link</button></div>`
      : `<p class="muted">No valid Microsoft Teams link has been saved. Edit this meeting to add its join URL.</p><button type="button" class="button button-secondary" data-edit-record="meeting" data-record-id="${esc(record.id)}">Add meeting link</button>`, "Add the Teams link when scheduling the meeting.")
      + detailSection("Agenda", `<div class="meeting-rich-text">${esc(record.agenda || "No agenda added yet.")}</div>`)
      + detailSection("Meeting notes", `<div class="meeting-rich-text">${esc(record.notes || "No notes captured yet.")}</div>`)
      + detailSection("Outcome & next steps", `<div class="meeting-rich-text">${esc(record.outcome || "Outcome not recorded.")}</div><p class="meeting-next-action"><strong>Next action:</strong> ${esc(record.nextAction || "No next action recorded.")}</p>`);
  } else if (type === "client") {
    fields = [detailValue("Organization", record.name), detailValue("Industry", record.industry), detailValue("Primary email", record.email), detailValue("Primary contact", record.contact), detailValue("Status", record.status), detailValue("Client since", record.since)];
    const contacts = state.contacts.filter(c => c.organization === record.name);
    const projects = state.projects.filter(p => p.client === record.name);
    related = detailSection("Contacts", contacts.map(c => relatedRecordLink("contact", c, c.name, `${c.relationship} · ${c.email}`)).join(""), "No contacts are linked to this client.") + detailSection("Projects", projects.map(p => relatedRecordLink("project", p, p.name, `${p.code} · ${p.status} · ${calculatedProjectProgress(p)}% complete`)).join(""), "No projects are linked to this client.") + detailSection("Leads", state.leads.filter(l => l.company === record.name).map(l => relatedRecordLink("lead", l, l.company, l.stage)).join(""), "No leads use this organization name.");
  } else if (type === "lead") {
    fields = [detailValue("Company", record.company), detailValue("Contact person", record.contact), detailValue("Service interest", record.service), detailValue("Pipeline stage", record.stage), detailValue("Owner", record.owner), detailValue("Next follow-up", record.followUp), detailValue("Email", record.email)];
    related = detailSection("Related client", state.clients.filter(c => c.name.toLowerCase() === record.company.toLowerCase()).map(c => relatedRecordLink("client", c, c.name, c.industry)).join(""), "This lead has not been converted to a client.") + detailSection("Potentially related projects", state.projects.filter(p => p.client.toLowerCase() === record.company.toLowerCase()).map(p => relatedRecordLink("project", p, p.name, p.status)).join(""));
  } else if (type === "contact") {
    fields = [detailValue("Full name", record.name), detailValue("Job title", record.jobTitle), detailValue("Department", record.department), detailValue("Organization", record.organization), detailValue("Role in company", record.companyRole), detailValue("Industry", record.industry), detailValue("Work email", record.email), detailValue("Alternative email", record.alternateEmail), detailValue("Direct phone", record.phone), detailValue("Mobile", record.mobile), detailValue("Preferred contact", record.preferredContact), detailValue("LinkedIn", record.linkedin), detailValue("Company website", record.companyWebsite), detailValue("Company email", record.companyEmail), detailValue("Company phone", record.companyPhone), detailValue("Company size", record.companySize), detailValue("Registration number", record.registrationNumber), detailValue("VAT number", record.vatNumber), detailValue("Street address", record.address), detailValue("City", record.city), detailValue("Province / state", record.province), detailValue("Postal code", record.postalCode), detailValue("Country", record.country), detailValue("Relationship", record.relationship), detailValue("Contact source", record.source), detailValue("Last contacted", record.lastContactDate), detailValue("Next follow-up", record.nextFollowUp), detailValue("Notes", record.notes)];
    const client = state.clients.find(c => c.name === record.organization);
    related = detailSection("Organization", client ? relatedRecordLink("client", client, client.name, `${client.industry} · ${client.status}`) : "", "No matching client record was found.") + detailSection("Organization projects", state.projects.filter(p => p.client === record.organization).map(p => relatedRecordLink("project", p, p.name, p.status)).join(""));
  } else if (type === "project") {
    fields = [detailValue("Project reference", record.code), detailValue("Project name", record.name), detailValue("Client", record.client), detailValue("Status", record.status), detailValue("Progress", `${calculatedProjectProgress(record)}%`), detailValue("Start date", record.startDate), detailValue("Target date", record.due), detailValue("Project manager", record.manager), detailValue("Agreed scope", record.scope)];
    const client = state.clients.find(c => c.name === record.client);
    related = detailSection("Client", client ? relatedRecordLink("client", client, client.name, client.industry) : "", "No matching client record was found.") + detailSection("Project tasks", state.tasks.filter(t => t.project === record.name).map(t => relatedRecordLink("task", t, t.title, `${t.status} · ${t.priority} priority · Due ${t.due}`)).join(""));
  } else if (type === "task") {
    fields = [detailValue("Task", record.title), detailValue("Project", record.project), detailValue("Assignee", record.assignee), detailValue("Priority", record.priority), detailValue("Status", record.done ? "Done" : record.status), detailValue("Due date", record.due)];
    const project = state.projects.find(p => p.name === record.project);
    related = detailSection("Project", project ? relatedRecordLink("project", project, project.name, `${project.code} · ${project.status}`) : "", "No matching project record was found.");
  }

  const detailView = $("#view-record-detail");
  detailView.dataset.recordType = type;
  detailView.dataset.recordId = String(id);
  detailView.innerHTML = `
    <div class="detail-back-row"><button class="button button-secondary" type="button" data-back-to-list>← Back to ${esc(type === "client" ? "clients" : type === "lead" ? "leads" : type === "contact" ? "contacts" : type === "project" ? "projects" : type === "meeting" ? "meetings" : "tasks")}</button><span class="eyebrow">${esc(subtitleMap[type] || "RECORD DETAILS")}</span></div>
    <div class="page-heading detail-heading"><div><p class="eyebrow">${esc(record.code || `ZS-${String(record.id).padStart(3,"0")}`)}</p><h1>${esc(title)}</h1><p class="page-subtitle">${esc(type === "client" ? record.industry : type === "lead" ? record.service : type === "contact" ? record.relationship : type === "project" ? record.client : type === "meeting" ? `${record.type || "Meeting"} · ${record.date || "Date not set"}` : record.project)}</p></div><div class="heading-actions"><button class="button button-secondary" type="button" data-edit-record="${esc(type)}" data-record-id="${esc(record.id)}">Edit record</button></div></div>
    <div class="detail-layout"><div class="detail-main">${detailSection("Overview", `<div class="detail-fields">${fields.join("")}</div>`)}${related}</div><aside class="detail-side">${detailSection("Record activity", activities.map(a => `<div class="activity-item"><span class="activity-icon ${esc(a.color)}">${esc(a.icon)}</span><div class="activity-copy"><p>${a.text}</p><small>${esc(a.by)} · ${esc(a.time)}</small></div></div>`).join(""), "Activity history will appear here as actions are recorded.")}${detailSection("Record actions", `<div class="detail-action-stack">${type === "lead" && record.stage !== "Lost" && !state.clients.some(client => String(client.name).toLowerCase() === String(record.company).toLowerCase()) ? `<button class="button button-primary" type="button" data-convert-lead="${esc(record.id)}">Convert to client</button>` : ""}${type === "client" ? `<button class="button button-primary" type="button" data-create-project-for-client="${esc(record.id)}">＋ Create project for this client</button><a class="button button-secondary" href="invite-client.html?clientId=${encodeURIComponent(record.id)}">Invite client to portal ↗</a>` : ""}${type === "project" ? `<a class="button button-primary" href="tasks.html?project=${encodeURIComponent(record.id)}">Manage tasks & milestones ↗</a>` : ""}<button class="button button-secondary" type="button" data-edit-record="${esc(type)}" data-record-id="${esc(record.id)}">Edit details</button><button class="button button-secondary danger-text" type="button" data-delete-record="${esc(type)}" data-record-id="${esc(record.id)}">Delete record</button></div>`)}</aside></div>${type === "lead" ? renderLeadWorkspace(record) : ""}`;
  setView("record-detail");
  if (type === "lead") updateCommercialCalculations();
  window.location.hash = `${type}/${id}`;
}

function returnToList() {
  const type = $("#view-record-detail").dataset.recordType;
  const target = {client:"clients",lead:"leads",contact:"contacts",project:"projects",task:"tasks",meeting:"meetings"}[type] || "dashboard";
  setView(target);
  window.location.hash = target;
}

function getSafeMeetingUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return "";
    if (!(host === "teams.microsoft.com" || host.endsWith(".teams.microsoft.com") || host === "teams.live.com" || host.endsWith(".teams.live.com"))) return "";
    return url.href;
  } catch { return ""; }
}

function renderMeetings() {
  const body = $("#meetings-table");
  if (!body) return;
  const query = ($("#meeting-search")?.value || "").trim().toLowerCase();
  const rows = state.meetings.filter(m => [m.title,m.lead,m.type,m.status,m.attendees,m.nextAction].join(" ").toLowerCase().includes(query)).sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  body.innerHTML = rows.map(m => `<tr><td><div class="table-primary"><span class="company-mark orange">ME</span><div><button type="button" class="record-link" data-open-record="meeting" data-record-id="${esc(m.id)}">${esc(m.title)}</button><small>${getSafeMeetingUrl(m.location) ? "Teams link available · View details to join" : "Meeting link not added"}</small></div></div></td><td>${esc(m.lead)}</td><td>${esc(m.date || "Not set")}<small class="table-subline">${esc(m.time || "Time not set")}</small></td><td>${esc(m.type)}</td><td><span class="status-pill ${m.status === "Completed" ? "status-done" : m.status === "Cancelled" ? "status-hold" : "status-progress"}">${esc(m.status)}</span></td><td>${esc(m.nextAction || "—")}</td><td><span class="record-actions"><button class="row-action-button" data-open-record="meeting" data-record-id="${esc(m.id)}">View</button><button class="row-action-button" data-edit-record="meeting" data-record-id="${esc(m.id)}">Edit</button><button class="row-action-button danger" data-delete-record="meeting" data-record-id="${esc(m.id)}">Delete</button></span></td></tr>`).join("") || `<tr><td colspan="7">No meetings scheduled yet. Schedule a discovery or financial meeting when a lead or client is ready.</td></tr>`;
  $("#meeting-total").textContent = String(state.meetings.length).padStart(2,"0");
  $("#meeting-upcoming").textContent = String(state.meetings.filter(m => m.status === "Scheduled").length).padStart(2,"0");
  $("#meeting-completed").textContent = String(state.meetings.filter(m => m.status === "Completed").length).padStart(2,"0");
  $("#meeting-followup").textContent = String(state.meetings.filter(m => m.status === "Completed" && m.nextAction).length).padStart(2,"0");
}

function renderLeadWorkspace(lead) {
  const money = value => value === "" || value == null ? "Not set" : `R ${Number(value).toLocaleString("en-ZA", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  const depositRequired = Number(lead.developmentFee || 0) * Number(lead.minimumDepositPercent || 0) / 100;
  const outstandingDeposit = Math.max(0, depositRequired - Number(lead.depositPaid || 0));
  const linkedMeetings = state.meetings.filter(m => String(m.leadId) === String(lead.id) || m.lead === lead.company);
  return `<section class="lead-workspace panel">
    <div class="panel-heading"><div><h2>Lead workspace</h2><p>Capture the discovery outcome, solution scope and commercial terms before converting this lead.</p></div><span class="status-pill ${stageClass(lead.stage)}">${esc(lead.stage)}</span></div>
    <form id="lead-workspace-form" data-lead-id="${esc(lead.id)}">
      <div class="workspace-section"><div class="workspace-section-heading"><div><p class="eyebrow">01 · DISCOVERY & REQUIREMENTS</p><h3>What does the client need?</h3></div><button type="button" class="button button-secondary" data-export-discovery-pdf>Download PDF</button></div><div class="workspace-form-grid">
        ${workspaceField("discoveryNotes","Discovery call notes",lead.discoveryNotes,"textarea","What did the client explain? Current process, pain points, goals...",true)}
        ${workspaceField("requirements","Application requirements",lead.requirements,"textarea","Business problem, expected outcomes and core requirements...",true)}
        ${workspaceField("requiredFeatures","Required features",lead.requiredFeatures,"textarea","Feature list, workflows, dashboards, reports and user actions...",true)}
        ${workspaceField("userRoles","Users and permissions",lead.userRoles,"textarea","User types, roles, approval levels and access requirements...")}
        ${workspaceField("integrations","Integrations and dependencies",lead.integrations,"textarea","Email, payment services, APIs, existing systems, data migration...")}
        ${workspaceField("hostingSecurity","Hosting, security and technical notes",lead.hostingSecurity,"textarea","Hosting preference, privacy, backups, security or compliance needs...")}
        ${workspaceField("scope","Proposed scope and deliverables",lead.scope,"textarea","What Zyma Systems will deliver and what is excluded...",true)}
        ${workspaceField("acceptanceCriteria","Acceptance criteria",lead.acceptanceCriteria,"textarea","How will the client confirm that the solution is complete?")}
        ${workspaceField("targetDeadline","Required deadline",lead.targetDeadline,"date")}
      </div></div>
      <div class="workspace-section"><div class="workspace-section-heading"><div><p class="eyebrow">02 · PRICING & PAYMENT TERMS</p><h3>Commercial agreement</h3></div><p class="muted">Amounts are in South African rand (ZAR).</p></div><div class="workspace-form-grid">
        ${workspaceField("developmentFee","Once-off development fee (R)",lead.developmentFee,"number","",false,"min=0 step=0.01")}
        ${workspaceField("minimumDepositPercent","Minimum deposit (%)",lead.minimumDepositPercent,"select","",false,"",["Select after financial meeting","30","40","50"])}
        ${workspaceField("depositPaid","Deposit received (R)",lead.depositPaid,"number","",false,"min=0 step=0.01")}
        ${workspaceField("depositDate","Deposit received date",lead.depositDate,"date")}
        ${workspaceField("billingModel","Billing model",lead.billingModel,"select","",false,"",["Once-off","Milestone payments","Month-to-month","Once-off + recurring"])}
        ${workspaceField("paymentSchedule","Payment schedule / invoice dates",lead.paymentSchedule,"textarea","Invoice dates, milestones, balances and payment due terms...")}
        ${workspaceField("monthlyFee","Monthly maintenance / support fee (R)",lead.monthlyFee,"number","",false,"min=0 step=0.01")}
        ${workspaceField("freeMonths","Free months after deployment",lead.freeMonths,"number","",false,"min=0 step=1")}
        ${workspaceField("deploymentDate","Expected / actual deployment date",lead.deploymentDate,"date")}
        ${workspaceField("recurringPaymentDay","Recurring payment day",lead.recurringPaymentDay || "01", "select", "", false, "", ["15","22","25","30","01"])}
        ${workspaceField("recurringPaymentDay","Recurring payment day",lead.recurringPaymentDay || "01", "select", "", false, "", ["15","22","25","30","01"])}
        ${workspaceField("firstRecurringDate","First recurring payment date",lead.firstRecurringDate,"date")}
        ${workspaceField("commercialNotes","Additional commercial terms",lead.commercialNotes,"textarea","Contract term, cancellation notice, annual increases, exclusions...")}
      </div><div class="financial-summary"><div><span>Minimum deposit required</span><strong id="calc-deposit-required">${money(depositRequired)}</strong></div><div><span>Deposit received</span><strong id="calc-deposit-paid">${money(lead.depositPaid)}</strong></div><div><span>Deposit outstanding</span><strong id="calc-deposit-outstanding">${money(outstandingDeposit)}</strong></div><div><span>Remaining development balance</span><strong id="calc-development-balance">${money(Math.max(0,Number(lead.developmentFee||0)-Number(lead.depositPaid||0)))}</strong></div><div><span>Monthly recurring total</span><strong id="calc-recurring-total">${money(Number(lead.monthlyFee||0)+Number(lead.zohoMonthlyFee||0))}</strong></div></div><p class="form-hint">Project start should be confirmed only after the required deposit is received and the agreement is signed. These figures are planning aids, not payment confirmations.</p></div>
      <div class="workspace-section"><div class="workspace-section-heading"><div><p class="eyebrow">03 · ZOHO & THIRD-PARTY SUBSCRIPTIONS</p><h3>Recurring services</h3></div></div><div class="workspace-form-grid">
        ${workspaceField("zohoProduct","Zoho service",lead.zohoProduct,"select","",false,"",["Not selected","Zoho Mail","Zoho Workplace"])}
        ${workspaceField("zohoPlan","Zoho plan",lead.zohoPlan,"select","",false,"",["Not selected","Mail Lite","Mail Premium","Workplace Standard","Workplace Professional"])}
        ${workspaceField("zohoBillingPeriod","Zoho billing period",lead.zohoBillingPeriod,"select","",false,"",["Annual billing","Monthly billing"])}
        ${workspaceField("zohoSeats","Number of users / seats",lead.zohoSeats,"number","",false,"min=0 step=1")}
        ${workspaceField("zohoMonthlyFee","Zoho subscription total (R/month)",lead.zohoMonthlyFee,"number","",false,"min=0 step=0.01")}
        <div class="workspace-field full zoho-price-helper"><span class="field-label">Estimated Zoho cost</span><p id="zoho-price-estimate">Choose a plan and enter user count to calculate.</p><small>Converted from the supplied Zoho comparison PDF using R16.5594 per US$1 (15 Oct 2026). Source pricing is dated 15 Mar 2022, excludes applicable tax, and should be verified with Zoho before quoting.</small></div>
        ${workspaceField("zohoBillingDate","Zoho renewal / billing date",lead.zohoBillingDate,"date")}
        ${workspaceField("otherSubscriptions","Other subscriptions and renewal dates",lead.otherSubscriptions,"textarea","Service, amount, billing cycle, renewal date and who pays...")}
      </div></div>
      <div class="workspace-form-actions"><span class="muted">Saved to this browser preview until the backend is connected.</span><button class="button button-primary" type="submit">Save lead workspace</button></div>
    </form>
    <div class="workspace-section linked-meetings"><div class="panel-heading"><div><h3>Meetings for ${esc(lead.company)}</h3><p>Schedule the next meeting after the discovery call.</p></div><button class="button button-secondary" type="button" data-schedule-for-lead="${esc(lead.id)}">＋ Schedule meeting</button></div>
      ${linkedMeetings.length ? linkedMeetings.map(m=>`<div class="meeting-inline"><div><strong>${esc(m.title)}</strong><small>${esc(m.date)} · ${esc(m.time)} · ${esc(m.type)}</small><p>${esc(m.outcome || m.notes || "No meeting notes recorded yet.")}</p></div><span class="status-pill ${m.status === "Completed" ? "status-done" : "status-progress"}">${esc(m.status)}</span><button class="row-action-button" data-edit-record="meeting" data-record-id="${esc(m.id)}">Edit</button></div>`).join("") : `<p class="muted">No meetings recorded for this lead yet.</p>`}
    </div>
  </section>`;
}
function workspaceField(name,label,value,type="text",placeholder="",full=false,attrs="",options=[]) {
  const wrap = `workspace-field${full ? " full" : ""}`;
  if (type === "textarea") return `<div class="${wrap}"><label for="ws-${name}">${esc(label)}</label><textarea id="ws-${name}" name="${name}" placeholder="${esc(placeholder)}">${esc(value || "")}</textarea></div>`;
  if (type === "select") return `<div class="${wrap}"><label for="ws-${name}">${esc(label)}</label><select id="ws-${name}" name="${name}">${options.map(o=>`<option ${String(value)===o?"selected":""} value="${esc(o)}">${esc(o)}</option>`).join("")}</select></div>`;
  return `<div class="${wrap}"><label for="ws-${name}">${esc(label)}</label><input id="ws-${name}" name="${name}" type="${type}" value="${esc(value ?? "")}" placeholder="${esc(placeholder)}" ${attrs}></div>`;
}


const LEAD_TREND_KEY = "zyma-crm-lead-trend-weekly-v3";
function getWeekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Monday-based week
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function recordLeadTrendSnapshot() {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const snapshot = { date: weekStart, total: state.leads.length, open: state.leads.filter(lead => !["Won", "Lost"].includes(lead.stage)).length, won: state.leads.filter(lead => lead.stage === "Won").length, lost: state.leads.filter(lead => lead.stage === "Lost").length };
  try {
    const history = JSON.parse(localStorage.getItem(LEAD_TREND_KEY) || "[]");
    const safeHistory = Array.isArray(history) ? history.filter(item => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(Number(item.total))) : [];
    const existing = safeHistory.findIndex(item => item.date === weekStart);
    if (existing >= 0) safeHistory[existing] = snapshot; else safeHistory.push(snapshot);
    const ordered = safeHistory.sort((a,b) => a.date.localeCompare(b.date)).slice(-12);
    localStorage.setItem(LEAD_TREND_KEY, JSON.stringify(ordered));
    return ordered;
  } catch (error) {
    return [snapshot];
  }
}
function renderLeadTrendChart() {
  const target = $("#chart-lead-trend");
  if (!target) return;
  const history = recordLeadTrendSnapshot();
  const latest = history[history.length - 1];
  if (!latest) return;
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const delta = previous ? latest.total - previous.total : 0;
  const deltaLabel = previous ? `${delta > 0 ? "+" : ""}${delta} vs previous week` : "First snapshot · tracking starts this week";
  const deltaClass = delta > 0 ? "trend-up" : delta < 0 ? "trend-down" : "trend-flat";
  const width = 900, height = 250, left = 48, right = 22, top = 22, bottom = 38;
  const values = history.map(item => Math.max(0, Number(item.total) || 0));
  const max = Math.max(4, ...values) * 1.18;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = i => history.length < 2 ? width - right : left + i * plotWidth / (history.length - 1);
  const y = value => top + plotHeight * (1 - value / max);
  const recordedCoords = values.map((value, i) => ({ x: x(i), y: y(value), value }));
  // With only one real weekly snapshot, draw a visual 0-to-current baseline.
  // The zero anchor is not saved as historical data and is not marked as a snapshot.
  const coords = history.length === 1
    ? [{ x: left, y: y(0), value: 0, baseline: true }, recordedCoords[0]]
    : recordedCoords;
  const smoothPath = coords.length > 1 ? coords.reduce((path, point, i, arr) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    const prev = arr[i - 1];
    const mid = (prev.x + point.x) / 2;
    return `${path} C ${mid} ${prev.y}, ${mid} ${point.y}, ${point.x} ${point.y}`;
  }, "") : `M ${left} ${y(0)} L ${width-right} ${y(latest.total)}`;
  const areaPath = `${smoothPath} L ${width-right} ${height-bottom} L ${left} ${height-bottom} Z`;
  const tickValues = [0, Math.round(max / 2), Math.ceil(max)];
  const grid = tickValues.map(val => {
    const gy = y(val);
    return `<line x1="${left}" y1="${gy}" x2="${width-right}" y2="${gy}" class="trend-grid-line"/><text x="${left-12}" y="${gy+4}" text-anchor="end" class="trend-axis-text">${val}</text>`;
  }).join("");
  const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  const firstLabel = formatDate(history[0].date);
  const lastLabel = formatDate(latest.date);
  const pointMarks = recordedCoords.map((point, i) => `<circle cx="${point.x}" cy="${point.y}" r="${i === recordedCoords.length-1 ? 5 : 3.5}" class="trend-point"><title>Week of ${esc(formatDate(history[i].date))}: ${point.value} leads</title></circle>`).join("");
  const firstPointNote = history.length === 1 ? `<text x="${width-right-8}" y="${Math.max(top+15,y(latest.total)-13)}" text-anchor="end" class="trend-point-label">${latest.total} leads · baseline</text>` : "";
  target.innerHTML = `<div class="trend-summary"><div class="trend-total"><strong>${latest.total}</strong><span>Total leads tracked</span></div><span class="${deltaClass} trend-change"><span class="trend-change-dot"></span>${esc(deltaLabel)}</span></div><div class="trend-svg-wrap"><svg class="lead-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lead count trend across ${history.length} recorded weekly snapshots"><defs><linearGradient id="leadTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--orange)" stop-opacity=".32"/><stop offset="72%" stop-color="var(--orange)" stop-opacity=".09"/><stop offset="100%" stop-color="var(--orange)" stop-opacity="0"/></linearGradient><linearGradient id="leadTrendStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="var(--orange)"/><stop offset="100%" stop-color="var(--trend-accent, #ff8a24)"/></linearGradient></defs>${grid}<path d="${areaPath}" class="trend-area"/><path d="${smoothPath}" pathLength="1" class="trend-line"/>${pointMarks}${firstPointNote}<text x="${left}" y="${height-8}" class="trend-axis-text">${esc(firstLabel)}</text><text x="${width-right}" y="${height-8}" text-anchor="end" class="trend-axis-text">${esc(lastLabel)}</text></svg></div><div class="trend-legend"><span><i></i> Weekly lead total</span><span>${history.length} ${history.length === 1 ? "snapshot" : "snapshots"} recorded</span></div><p class="chart-footnote">One snapshot is recorded per week (Monday-based). Changes during the current week update this week's point. Earlier weekly history begins when tracking is enabled; no historical figures are fabricated.</p>`;
}

function renderDashboardCharts() {
  const leadStages = ["New", "Discovery", "Follow-up", "Requirements", "Proposal", "Negotiation", "Agreement", "Won", "Lost"];
  const stageColors = ["#6aa9ff", "#b09aff", "#52c69a", "#7db8ff", "#f58220", "#e7b65c", "#b09aff", "#52c69a", "#ff7b83"];
  const leadCounts = leadStages.map(name => ({ name, value: state.leads.filter(lead => lead.stage === name).length }));
  const maxLeadCount = Math.max(1, ...leadCounts.map(item => item.value));
  const leadChart = $("#chart-lead-stages");
  if (leadChart) leadChart.innerHTML = leadCounts.map((item, i) => `
    <div class="chart-bar-row"><span class="chart-axis-label">${esc(item.name)}</span><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:${stageColors[i]};width:${item.value / maxLeadCount * 100}%"></div></div><strong class="chart-value">${item.value}</strong></div>`).join("");

  const projectChart = $("#chart-project-progress");
  if (projectChart) projectChart.innerHTML = state.projects.length ? state.projects.map(project => {
    const progress = calculatedProjectProgress(project);
    return `<div class="project-chart-row"><div class="project-chart-label"><span title="${esc(project.name)}">${esc(project.name)}</span><strong>${progress}%</strong></div><div class="chart-bar-track project-chart-track"><div class="chart-bar" style="--bar-color:${progress >= 75 ? "#52c69a" : progress >= 40 ? "#6aa9ff" : "#f58220"};width:${progress}%"></div></div></div>`;
  }).join("") : `<p class="chart-empty">No projects recorded yet.</p>`;

  const taskStatus = [
    { name: "To do", value: state.tasks.filter(task => !task.done && !["In progress", "In review"].includes(task.status)).length, color: "#6aa9ff" },
    { name: "In progress / review", value: state.tasks.filter(task => !task.done && ["In progress", "In review"].includes(task.status)).length, color: "#f58220" },
    { name: "Completed", value: state.tasks.filter(task => task.done || ["Done", "Completed"].includes(task.status)).length, color: "#52c69a" }
  ];
  const totalTasks = taskStatus.reduce((sum, item) => sum + item.value, 0);
  const taskChart = $("#chart-task-status");
  if (taskChart) {
    let cursor = 0;
    const segments = taskStatus.map(item => {
      const start = cursor;
      cursor += totalTasks ? item.value / totalTasks * 100 : 0;
      return `${item.color} ${start}% ${cursor}%`;
    });
    taskChart.innerHTML = `<div class="donut-layout"><div class="donut-chart" style="--donut-stops:${totalTasks ? segments.join(",") : "var(--border) 0% 100%"}" role="img" aria-label="${taskStatus.map(item => `${item.name}: ${item.value}`).join(", ")}"><div class="donut-hole"><strong>${totalTasks}</strong><span>Total tasks</span></div></div><div class="chart-legend">${taskStatus.map(item => `<div><span class="legend-dot" style="--legend-color:${item.color}"></span><span>${esc(item.name)}</span><strong>${item.value}</strong></div>`).join("")}</div></div>`;
  }

  const priorities = [
    { name: "High", color: "#ff7b83" },
    { name: "Medium", color: "#e7b65c" },
    { name: "Low", color: "#52c69a" }
  ].map(item => ({ ...item, value: state.tasks.filter(task => !task.done && !["Done", "Completed"].includes(task.status) && task.priority === item.name).length }));
  const maxPriority = Math.max(1, ...priorities.map(item => item.value));
  const priorityChart = $("#chart-task-priority");
  if (priorityChart) priorityChart.innerHTML = priorities.map(item => `<div class="chart-bar-row priority-chart-row"><span class="chart-axis-label">${item.name}</span><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:${item.color};width:${item.value / maxPriority * 100}%"></div></div><strong class="chart-value">${item.value}</strong></div>`).join("") + `<p class="chart-footnote">Counts include open tasks only.</p>`;

  renderLeadTrendChart();

  const funnel = $("#chart-sales-funnel");
  if (funnel) {
    const total = state.leads.length;
    const won = state.leads.filter(lead => lead.stage === "Won").length;
    const lost = state.leads.filter(lead => lead.stage === "Lost").length;
    const open = Math.max(0, total - won - lost);
    const conversion = total ? Math.round(won / total * 100) : 0;
    const items = [{name:"Open opportunities",value:open,color:"#f58220"},{name:"Won",value:won,color:"#52c69a"},{name:"Lost",value:lost,color:"#ff7b83"}];
    let cursor = 0;
    const segments = items.map(item => {
      const start = cursor;
      cursor += total ? item.value / total * 100 : 0;
      return `${item.color} ${start}% ${cursor}%`;
    });
    const donutStops = total ? segments.join(",") : "var(--border) 0% 100%";
    funnel.innerHTML = `<div class="funnel-conversion"><strong>${conversion}%</strong><span>Won / all recorded leads</span></div><div class="donut-layout sales-funnel-donut-layout"><div class="donut-chart sales-funnel-donut" style="--donut-stops:${donutStops}" role="img" aria-label="Sales funnel distribution: ${items.map(item => `${item.name} ${item.value}`).join(", ")}"><div class="donut-hole"><strong>${total}</strong><span>Total leads</span></div></div><div class="chart-legend sales-pie-legend">${items.map(item=>`<div><span class="legend-dot" style="--legend-color:${item.color}"></span><span>${esc(item.name)}</span><strong>${item.value} <small>${total ? Math.round(item.value/total*100) : 0}%</small></strong></div>`).join("")}</div></div><p class="chart-footnote">Lead distribution by current stage. Conversion is based on won leads divided by all recorded leads.</p>`;
  }

  const industries = $("#chart-client-industries");
  if (industries) {
    const counts = state.clients.reduce((acc, client) => { const industry = (client.industry || "Unspecified").trim() || "Unspecified"; acc[industry] = (acc[industry] || 0) + 1; return acc; }, {});
    const items = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,value],i)=>({name,value,color:["#f58220","#6aa9ff","#52c69a","#b09aff","#e7b65c","#ff7b83"][i]}));
    const max = Math.max(1,...items.map(item=>item.value));
    industries.innerHTML = items.length ? items.map(item=>`<div class="chart-bar-row"><span class="chart-axis-label" title="${esc(item.name)}">${esc(item.name)}</span><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:${item.color};width:${item.value/max*100}%"></div></div><strong class="chart-value">${item.value}</strong></div>`).join("") : `<p class="chart-empty">Add clients to see your portfolio mix.</p>`;
  }

  const meetingChart = $("#chart-meeting-status");
  if (meetingChart) {
    const statuses = [{name:"Scheduled",value:state.meetings.filter(m=>!['Completed','Cancelled'].includes(m.status)).length,color:"#6aa9ff"},{name:"Completed",value:state.meetings.filter(m=>m.status==='Completed').length,color:"#52c69a"},{name:"Cancelled",value:state.meetings.filter(m=>m.status==='Cancelled').length,color:"#ff7b83"}];
    const max = Math.max(1,...statuses.map(item=>item.value));
    meetingChart.innerHTML = statuses.map(item=>`<div class="chart-bar-row"><span class="chart-axis-label">${item.name}</span><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:${item.color};width:${item.value/max*100}%"></div></div><strong class="chart-value">${item.value}</strong></div>`).join("") + `<p class="chart-footnote">${state.meetings.length} meeting${state.meetings.length===1?"":"s"} recorded in the CRM.</p>`;
  }

  const date = $("#dashboard-date");
  const now = new Date();
  const saTime = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(saTime.find(part => part.type === "hour")?.value ?? now.getHours());
  if (date) date.textContent = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now).toUpperCase();
  const greeting = $("#dashboard-greeting");
  if (greeting) {
    const salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    let currentUser = null; try { currentUser = JSON.parse(sessionStorage.getItem("zymaCrmAuthenticatedUser") || "null"); } catch {} const firstName = (currentUser?.name || currentUser?.email || "there").trim().split(/\s+/)[0]; greeting.innerHTML = `${salutation}, ${esc(firstName)} <span class="wave">✳</span>`;
  }
}

function communicationDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}
function renderCommunications() {
  const host = $("#communication-list");
  if (!host) return;
  const items = Array.isArray(state.communications) ? state.communications : [];
  const today = new Date(); today.setHours(0,0,0,0);
  const due = items.filter(item => item.followUp && new Date(`${item.followUp}T00:00:00`) <= today && item.status !== "Resolved").length;
  const awaiting = items.filter(item => item.status === "Awaiting response").length;
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
  const meetingsThisWeek = state.meetings.filter(item => {
    const raw = item.date || ""; const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : null;
    return date && date >= today && date < weekEnd && !["Cancelled", "Completed"].includes(item.status);
  }).length;
  [["#comm-total", items.length], ["#comm-followups", due], ["#comm-awaiting", awaiting], ["#comm-meetings", meetingsThisWeek], ["#comm-count-all", items.length], ["#comm-count-followup", items.filter(x=>x.status === "Follow-up required").length], ["#comm-count-awaiting", awaiting]].forEach(([selector, value]) => { const el=$(selector); if(el) el.textContent=String(value).padStart(2,"0"); });
  const activeFilter = state.communicationFilter || "all";
  const q = String($("#communication-search")?.value || "").trim().toLowerCase();
  const visible = [...items].filter(item => (activeFilter === "all" || item.status === activeFilter) && [item.client,item.project,item.subject,item.channel,item.type,item.notes,item.owner,item.status].join(" ").toLowerCase().includes(q)).sort((a,b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")) || Number(b.id)-Number(a.id));
  const count = $("#communication-results-count"); if(count) count.textContent = `${visible.length} interaction${visible.length===1?"":"s"}`;
  if (!visible.length) {
    host.innerHTML = `<div class="communication-empty"><span class="communication-empty-icon">▤</span><h3>${items.length ? "No matching interactions" : "Your communication timeline starts here"}</h3><p>${items.length ? "Try a different search or filter." : "Log a client call, email, meeting outcome or project update. Keep the context and next action attached to the right relationship."}</p>${items.length ? `<button type="button" class="button button-secondary" data-communication-reset>Clear filters</button>` : `<button type="button" class="button button-primary" data-action="new-communication">＋ Log first communication</button>`}</div>`;
    return;
  }
  const icons = {Email:"✉", "Phone call":"☎", WhatsApp:"◉", "Microsoft Teams":"▦", "Meeting notes":"▤", "Project update":"↗", "Internal note":"✎", Other:"•"};
  host.innerHTML = visible.map(item => {
    const statusClass = item.status === "Resolved" ? "comm-status-resolved" : item.status === "Awaiting response" ? "comm-status-awaiting" : item.status === "Follow-up required" ? "comm-status-followup" : "comm-status-logged";
    const follow = item.followUp ? `<span class="communication-followup ${item.followUp < `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}` && item.status !== "Resolved" ? "is-overdue" : ""}">↗ Follow-up ${esc(communicationDate(item.followUp))}</span>` : "";
    return `<article class="communication-entry"><div class="communication-entry-icon">${icons[item.channel] || "▤"}</div><div class="communication-entry-body"><div class="communication-entry-top"><div><div class="communication-entry-meta"><span>${esc(item.channel || "Other")}</span><span>·</span><span>${esc(communicationDate(item.date))}</span></div><h3>${esc(item.subject || item.type || "Communication")}</h3></div><span class="communication-status ${statusClass}">${esc(item.status || "Logged")}</span></div><div class="communication-related"><span class="communication-related-client">${esc(item.client || "No client linked")}</span>${item.project ? `<span>Project: ${esc(item.project)}</span>` : ""}<span>Owner: ${esc(item.owner || "Khutjo M.")}</span></div>${item.notes ? `<p class="communication-notes">${esc(item.notes)}</p>` : ""}<div class="communication-entry-footer">${follow}<span class="communication-actions"><button type="button" class="row-action-button" data-edit-record="communication" data-record-id="${esc(item.id)}">Edit</button><button type="button" class="row-action-button danger" data-delete-record="communication" data-record-id="${esc(item.id)}">Delete</button></span></div></div></article>`;
  }).join("");
}


function reportDate(value) {
  if (!value) return null;
  if (value === "Today") return new Date();
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = String(value).match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?$/);
  if (!match) return null;
  const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const month = months[match[2]];
  return month === undefined ? null : new Date(Number(match[3] || new Date().getFullYear()), month, Number(match[1]));
}
function isTaskComplete(task) { return Boolean(task.done) || ["Done", "Completed"].includes(task.status); }
function getReportAttentionItems() {
  const today = new Date(); today.setHours(0,0,0,0);
  const projects = state.projects.filter(p => !["Completed", "Cancelled"].includes(p.status) && Number(p.progress || 0) < 30).map(p => ({kind:"Project", item:p.name, relation:p.client || "—", issue:`Low progress · ${Number(p.progress || 0)}%`, owner:p.manager || "Unassigned", date:p.due || "Not set"}));
  const tasks = state.tasks.filter(t => !isTaskComplete(t)).map(t => { const due=reportDate(t.due); if(!due)return null; due.setHours(0,0,0,0); return due<today ? {kind:"Task",item:t.title,relation:t.project||"—",issue:"Overdue task",owner:t.assignee||"Unassigned",date:t.due||"Not set"}:null; }).filter(Boolean);
  return [...projects,...tasks];
}
function renderReportTrend() {
  const target=$("#report-lead-trend"); if(!target)return;
  const period=Number($("#reports-period")?.value||12), history=recordLeadTrendSnapshot().slice(-period);
  const w=820,h=230,l=38,r=16,t=20,b=34,values=history.map(p=>Math.max(0,Number(p.total)||0)),max=Math.max(4,...values)*1.15,pw=w-l-r,ph=h-t-b;
  const x=i=>history.length<2?w-r:l+i/(history.length-1)*pw, y=v=>t+ph*(1-v/max), recordedPts=values.map((v,i)=>({x:x(i),y:y(v),v}));
  // If this is the first recorded week, show a visual rise from zero to the current total.
  // This anchor is presentation-only; it is not stored or counted as a past snapshot.
  const pts=history.length===1?[{x:l,y:y(0),v:0,baseline:true},recordedPts[0]]:recordedPts;
  const path=pts.length>1?pts.reduce((d,p,i,a)=>i===0?`M ${p.x} ${p.y}`:`${d} C ${(a[i-1].x+p.x)/2} ${a[i-1].y}, ${(a[i-1].x+p.x)/2} ${p.y}, ${p.x} ${p.y}`,""):`M ${l} ${y(0)} L ${w-r} ${y(values[0]||0)}`;
  const area=`${path} L ${w-r} ${h-b} L ${l} ${h-b} Z`, ticks=[0,Math.round(max/2),Math.ceil(max)];
  const grid=ticks.map(v=>`<line x1="${l}" y1="${y(v)}" x2="${w-r}" y2="${y(v)}" class="report-grid-line"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end" class="report-axis-label">${v}</text>`).join("");
  const label=d=>new Date(`${d}T12:00:00`).toLocaleDateString("en-ZA",{day:"numeric",month:"short"}), marks=recordedPts.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="${i===recordedPts.length-1?5:3.5}" class="report-trend-point"><title>Week of ${esc(label(history[i].date))}: ${p.v} leads</title></circle>`).join("");
  const latest=history[history.length-1], previous=history.length>1?history[history.length-2]:null, delta=previous?Number(latest.total)-Number(previous.total):null;
  target.innerHTML=`<div class="report-trend-summary"><div><strong>${latest?.total??state.leads.length}</strong><span>Total leads</span></div><span class="report-trend-delta ${delta===null?'neutral':delta>0?'positive':delta<0?'negative':'neutral'}">${delta===null?'First weekly snapshot':`${delta>0?'+':''}${delta} vs previous week`}</span></div><div class="report-trend-svg-wrap"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Weekly lead totals from recorded snapshots">${grid}<defs><linearGradient id="reportLeadFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--orange)" stop-opacity=".28"/><stop offset="100%" stop-color="var(--orange)" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#reportLeadFill)"/><path d="${path}" pathLength="1" class="report-trend-line"/>${marks}<text x="${l}" y="${h-7}" class="report-axis-label">${esc(label(history[0].date))}</text><text x="${w-r}" y="${h-7}" text-anchor="end" class="report-axis-label">${esc(label(latest.date))}</text></svg></div><p class="chart-footnote">${history.length} weekly snapshot${history.length===1?'':'s'} available. Historical tracking begins when enabled.</p>`;
  const badge=$("#report-trend-period"); if(badge)badge.textContent=`${period} WEEKS`;
}
function renderReports() {
  const openLeads=state.leads.filter(x=>!["Won","Lost"].includes(x.stage)).length, activeProjects=state.projects.filter(x=>!["Completed","Cancelled"].includes(x.status)).length, openTasks=state.tasks.filter(x=>!isTaskComplete(x)).length;
  $("#report-clients").textContent=String(state.clients.length).padStart(2,"0"); $("#report-leads").textContent=String(openLeads).padStart(2,"0"); $("#report-projects").textContent=String(activeProjects).padStart(2,"0"); $("#report-tasks").textContent=String(openTasks).padStart(2,"0");
  const names=["New","Discovery","Follow-up","Requirements","Proposal","Negotiation","Agreement","Won","Lost"], colors=["#6aa9ff","#b09aff","#52c69a","#7db8ff","#f58220","#e7b65c","#b09aff","#52c69a","#ff7b83"], stages=names.map((name,i)=>({name,count:state.leads.filter(x=>x.stage===name).length,color:colors[i]})), maxStage=Math.max(1,...stages.map(x=>x.count));
  const stageTarget=$("#report-lead-stages"); if(stageTarget)stageTarget.innerHTML=stages.map(x=>`<div class="chart-bar-row"><span class="chart-axis-label">${esc(x.name)}</span><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:${x.color};width:${x.count/maxStage*100}%"></div></div><strong class="chart-value">${x.count}</strong></div>`).join("")+`<p class="chart-footnote">${state.leads.length} total lead records.</p>`;
  const won=state.leads.filter(x=>x.stage==="Won").length,lost=state.leads.filter(x=>x.stage==="Lost").length,conversion=state.leads.length?Math.round(won/state.leads.length*100):0, conv=$("#report-conversion");
  if(conv){
     const openCount=Math.max(0,state.leads.length-won-lost);
     const total=Math.max(1,state.leads.length), ring=2*Math.PI*42;
     let offset=0;
     const donutSegments=[{value:won,color:"#52c69a"},{value:lost,color:"#ff7b83"},{value:openCount,color:"#f58220"}];
     const donutCircles=donutSegments.map(segment=>{
       const length=ring*(segment.value/total), circle=`<circle cx="60" cy="60" r="42" fill="none" stroke="${segment.color}" stroke-width="16" stroke-dasharray="${length} ${ring-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
       offset+=length; return circle;
     }).join("");
     conv.innerHTML=`<div class="report-conversion-layout"><div class="report-conversion-donut" role="img" aria-label="Lead conversion ${conversion} percent"><svg class="report-conversion-svg" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="42" fill="none" stroke="#f0ede8" stroke-width="16"/>${donutCircles}</svg><div class="report-conversion-center"><strong>${conversion}%</strong><span>Won / all leads</span></div></div><div class="report-conversion-legend"><div><i style="--legend-color:#52c69a"></i><span>Won</span><strong>${won}</strong></div><div><i style="--legend-color:#ff7b83"></i><span>Lost</span><strong>${lost}</strong></div><div><i style="--legend-color:#f58220"></i><span>Open</span><strong>${openCount}</strong></div></div></div><p class="chart-footnote">Won leads divided by all recorded leads.</p>`;
   }
  const projectTarget=$("#report-project-progress"); if(projectTarget)projectTarget.innerHTML=state.projects.length?state.projects.map(p=>{const v=Math.max(0,Math.min(100,Number(p.progress)||0)),c=v>=75?"#52c69a":v>=40?"#6aa9ff":"#f58220";return `<div class="report-project-progress"><div><span title="${esc(p.name)}">${esc(p.name)}</span><strong>${v}%</strong></div><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:${c};width:${v}%"></div></div><small>${esc(p.status||"Unspecified status")} · ${esc(p.client||"No client linked")}</small></div>`}).join(""):`<p class="chart-empty">No projects recorded.</p>`;
  const done=state.tasks.filter(isTaskComplete).length, progress=state.tasks.filter(t=>!isTaskComplete(t)&&["In progress","In review"].includes(t.status)).length, todo=Math.max(0,state.tasks.length-done-progress), taskTarget=$("#report-task-status"), taskStats=[{name:"To do",value:todo,color:"#6aa9ff"},{name:"In progress / review",value:progress,color:"#f58220"},{name:"Completed",value:done,color:"#52c69a"}];
  if(taskTarget)taskTarget.innerHTML=taskStats.map(x=>`<div class="chart-bar-row"><span class="chart-axis-label">${esc(x.name)}</span><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:${x.color};width:${state.tasks.length?x.value/state.tasks.length*100:0}%"></div></div><strong class="chart-value">${x.value}</strong></div>`).join("")+`<p class="chart-footnote">${state.tasks.length} total task records.</p>`;
  const attention=$("#report-attention-table"); if(attention){const rows=getReportAttentionItems();attention.innerHTML=rows.length?rows.map(x=>`<tr><td><strong>${esc(x.item)}</strong><small class="report-kind">${esc(x.kind)}</small></td><td>${esc(x.relation)}</td><td><span class="report-issue">${esc(x.issue)}</span></td><td>${esc(x.owner)}</td><td>${esc(x.date)}</td></tr>`).join(""):`<tr><td colspan="5"><div class="report-table-empty"><strong>No immediate delivery risks found</strong><span>Low-progress active projects and overdue tasks appear here.</span></div></td></tr>`;}
  const meetings=$("#report-meetings"); if(meetings){const stats=[{name:"Scheduled",value:state.meetings.filter(x=>x.status==="Scheduled").length,color:"#6aa9ff"},{name:"Completed",value:state.meetings.filter(x=>x.status==="Completed").length,color:"#52c69a"},{name:"Cancelled",value:state.meetings.filter(x=>x.status==="Cancelled").length,color:"#ff7b83"}],max=Math.max(1,...stats.map(x=>x.value));meetings.innerHTML=stats.map(x=>`<div class="chart-bar-row"><span class="chart-axis-label">${x.name}</span><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:${x.color};width:${x.value/max*100}%"></div></div><strong class="chart-value">${x.value}</strong></div>`).join("")+`<p class="chart-footnote">${state.meetings.length} meeting records.</p>`;}
  const industry=$("#report-client-industries"); if(industry){const counts={};state.clients.forEach(x=>{const k=x.industry||"Unspecified";counts[k]=(counts[k]||0)+1});const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...rows.map(x=>x[1]));industry.innerHTML=rows.length?rows.map(([name,count])=>`<div class="chart-bar-row"><span class="chart-axis-label">${esc(name)}</span><div class="chart-bar-track"><div class="chart-bar" style="--bar-color:#f58220;width:${count/max*100}%"></div></div><strong class="chart-value">${count}</strong></div>`).join(""):`<p class="chart-empty">No client records.</p>`;}
  renderReportTrend();
}
function exportReport(type) {
  const reportView = document.querySelector("#view-reports");
  if (!reportView) return toast("The Reports page is not available to export.");

  // Print the rendered report view itself so SVG charts, status bars, tables,
  // current filters and current CRM values are included in the PDF.
  const report = reportView.cloneNode(true);
  report.classList.add("report-pdf-content");
  report.querySelectorAll("button, select, input, .reports-period, [data-report-export]").forEach(el => {
    if (el.matches("button, select, input, [data-report-export]")) el.remove();
  });
  report.querySelectorAll(".heading-actions").forEach(el => {
    if (!el.textContent.trim()) el.remove();
  });

  const period = Number(document.querySelector("#reports-period")?.value || 12);
  const generated = new Date().toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  const printableTitle = type === "leads" ? "Lead Performance Report" :
    type === "projects" ? "Project Delivery Report" :
    type === "attention" ? "Items Requiring Attention Report" :
    type === "activity" ? "Client Engagement Report" : "Business Overview Report";

  const win = window.open("", "_blank", "noopener=false,width=1200,height=900");
  if (!win) return toast("Please allow pop-ups to export the report as a PDF.");
  const stylesheet = new URL("styles.css", window.location.href).href;
  win.document.open();
  win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(printableTitle)} — Zyma CRM</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="${stylesheet}"><style>
    :root{color-scheme:light;--surface:#fff;--surface-raised:#fff;--text:#101722;--text-muted:#596575;--border:#dedbd6;--page:#fff;--orange:#f58220;--shadow:none}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;opacity:1!important;text-shadow:none!important}
    html,body{background:#fff!important;color:#101722!important;margin:0!important;padding:0!important;font-family:'DM Sans',Arial,sans-serif!important}
    .report-pdf-header{padding:0 0 18px;margin:0 0 22px;border-bottom:2px solid #f58220;display:flex;justify-content:space-between;gap:24px;align-items:flex-end}
    .report-pdf-brand{display:flex;align-items:center;width:220px;max-width:100%;min-height:54px;padding:8px 12px;background:#080808;border-radius:7px;box-sizing:border-box}.report-pdf-brand img{display:block;width:100%;max-height:48px;object-fit:contain}
    .report-pdf-header h1{font:700 25px Manrope,Arial,sans-serif;margin:8px 0 4px}.report-pdf-meta{font-size:10px;color:#596575;text-align:right;line-height:1.6}
    .app-shell,.sidebar,.topbar,.toast-region,.modal-backdrop{display:none!important}.main-column,.content,#view-reports{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:#fff!important}
    .view-section{display:none!important}.view-section.report-pdf-content{display:block!important}
    .report-pdf-content .page-heading{margin:0 0 18px!important}.report-pdf-content .page-heading h1{font-size:23px!important}
    .report-pdf-content .heading-actions,.report-pdf-content button,.report-pdf-content select,.report-pdf-content input{display:none!important}
    .report-pdf-content .metric-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important}
    .report-pdf-content .reports-chart-grid{grid-template-columns:minmax(0,1fr)!important;gap:12px!important}.report-pdf-content .reports-chart-grid>.panel{width:100%!important;grid-column:1!important}
    .report-pdf-content .report-chart-wide{grid-column:1/-1!important}
    .report-pdf-content .metric-card,.report-pdf-content .panel{background:#fff!important;border:1px solid #dedbd6!important;box-shadow:none!important;break-inside:avoid;page-break-inside:avoid}
    .report-pdf-content .metric-card{padding:13px!important;min-height:0!important}.report-pdf-content .metric-value{font-size:23px!important}
    .report-pdf-content .panel{padding:14px!important}.report-pdf-content .reports-section-heading{margin:20px 0 10px!important;break-after:avoid}
    .report-pdf-content .report-trend-svg-wrap svg{width:100%!important;height:auto!important;max-height:240px!important;overflow:visible}
    .report-pdf-content .chart-content{overflow:visible!important}.report-pdf-content .table-wrap,.report-pdf-content .report-table-wrap{overflow:visible!important;max-width:100%!important;width:100%!important}
    .report-pdf-content table{width:100%!important;min-width:0!important;max-width:100%!important;table-layout:fixed!important;border-collapse:collapse!important;font-size:8.5px!important}
    .report-pdf-content th,.report-pdf-content td{padding:6px 5px!important;border-bottom:1px solid #e6e2dc!important;color:#101722!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;vertical-align:top!important}
    .report-pdf-content th{font-size:7.5px!important;letter-spacing:.02em!important;line-height:1.25!important}
    .report-pdf-content .report-table-wrap table th:nth-child(1),.report-pdf-content .report-table-wrap table td:nth-child(1){width:29%!important}
    .report-pdf-content .report-table-wrap table th:nth-child(2),.report-pdf-content .report-table-wrap table td:nth-child(2){width:23%!important}
    .report-pdf-content .report-table-wrap table th:nth-child(3),.report-pdf-content .report-table-wrap table td:nth-child(3){width:18%!important}
    .report-pdf-content .report-table-wrap table th:nth-child(4),.report-pdf-content .report-table-wrap table td:nth-child(4){width:14%!important}
    .report-pdf-content .report-table-wrap table th:nth-child(5),.report-pdf-content .report-table-wrap table td:nth-child(5){width:16%!important}
    .report-pdf-content .report-issue{white-space:normal!important;display:inline-block!important;max-width:100%!important}
    .report-pdf-content .reports-disclaimer,.report-pdf-content .chart-footnote{font-size:9px!important;color:#465263!important}
    .report-pdf-content,.report-pdf-content p,.report-pdf-content span,.report-pdf-content small,.report-pdf-content label{opacity:1!important}
    .report-pdf-content .metric-label,.report-pdf-content .page-subtitle,.report-pdf-content .chart-axis-label{color:#465263!important}
    .report-pdf-footer{border-top:1px solid #dedbd6;margin-top:18px;padding-top:8px;font-size:9px;color:#596575;display:flex;justify-content:space-between}
    .preview-toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 20px;background:#101722;color:#fff;box-shadow:0 2px 10px #10172222}
    .preview-toolbar strong{font:700 13px Manrope,Arial,sans-serif}.preview-toolbar span{font-size:12px;color:#d7dce4}
    .preview-actions{display:flex;gap:8px}.preview-actions button{border:1px solid #ffffff44;border-radius:8px;padding:9px 14px;background:transparent;color:#fff;font:600 12px 'DM Sans',Arial,sans-serif;cursor:pointer}.preview-actions .primary{background:#f58220;border-color:#f58220;color:#101722}
    .preview-stage{background:#e9edf1;min-height:calc(100vh - 58px);padding:26px 16px 40px;overflow:auto}
    .paper{box-sizing:border-box;width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:13mm 12mm 14mm;box-shadow:0 8px 28px #10172224}
    @page{size:A4 portrait;margin:13mm 12mm 14mm}
    @media(max-width:760px){.preview-toolbar{align-items:flex-start;flex-direction:column}.preview-stage{padding:12px 0}.paper{width:100%;min-height:0;padding:24px 18px;box-shadow:none}.report-pdf-header{gap:10px;align-items:flex-start;flex-direction:column}.report-pdf-meta{text-align:left}}
    @media print{html,body{width:auto!important;height:auto!important;min-width:0!important;overflow:visible!important;background:#fff!important}.preview-toolbar{display:none!important}.preview-stage{display:block!important;min-height:0!important;padding:0!important;background:#fff!important;overflow:visible!important}.paper{width:auto!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important}.paper,.paper *{max-width:100%!important}.report-pdf-content{width:100%!important;min-width:0!important;overflow:visible!important}.report-pdf-content .panel,.report-pdf-content .metric-card{break-inside:avoid;page-break-inside:avoid}.report-pdf-content .report-table-wrap,.report-pdf-content .table-wrap{overflow:visible!important;width:100%!important}.report-pdf-content table{width:100%!important;min-width:0!important;table-layout:fixed!important}.report-pdf-content tr{break-inside:avoid;page-break-inside:avoid}.reports-section-heading{break-after:avoid}.report-pdf-footer{position:static}}
  </style></head><body><div class="preview-toolbar"><div><strong>PDF preview · ${esc(printableTitle)}</strong><br><span>A4 portrait · Review the report before saving</span></div><div class="preview-actions"><button type="button" id="close-preview">Close preview</button><button type="button" class="primary" id="save-pdf">Download PDF</button></div></div><div class="preview-stage"><div class="paper"><header class="report-pdf-header"><div><div class="report-pdf-brand"><img src="assets/zyma-systems-logo-full.png" alt="Zyma Systems — Shaping ideas, Driving growth"></div><h1>${esc(printableTitle)}</h1><div style="font-size:11px;color:#596575">CRM business intelligence · Last ${period} weeks selected</div></div><div class="report-pdf-meta"><strong>ZYMA CRM</strong><br>Generated ${esc(generated)} (South Africa)<br>Source: current CRM preview records</div></header><main class="content">${report.outerHTML}</main><footer class="report-pdf-footer"><span>Zyma Systems · Confidential business report</span><span>Generated ${esc(generated)}</span></footer></div></div><script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script><script>
(function(){
  const button=document.getElementById('save-pdf');
  button.addEventListener('click',async function(){
    if(typeof window.html2pdf !== 'function'){
      button.textContent='PDF library unavailable';
      button.disabled=true;
      alert('The PDF download library could not load. Check your internet connection and reopen the report preview.');
      return;
    }
    const original=button.textContent;
    button.textContent='Generating PDF…';
    button.disabled=true;
    try{
      const target=document.querySelector('.paper');
      // The .paper element already contains its A4 margins as CSS padding.
      // Adding html2pdf margins as well makes the effective canvas narrower
      // than the page and clips the right side of charts, headings and tables.
      // Let html2canvas use the preview window's real viewport and scroll
      // coordinates. Forcing scrollX/scrollY to zero or overriding windowWidth
      // can shift a centered A4 sheet off-canvas and crop its left edge.
      // The sheet itself is already 210mm wide and has its page margins in CSS.
      await window.html2pdf().set({
        margin:0,
        filename:'zyma-crm-report-${esc(printableTitle).replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')}.pdf',
        image:{type:'jpeg',quality:0.98},
        html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false,removeContainer:true},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},
        pagebreak:{mode:['css','legacy'],avoid:['.panel','.metric-card','tr','.reports-section-heading']}
      }).from(target).save();
      button.textContent='PDF downloaded';
    }catch(error){
      console.error('PDF generation failed',error);
      alert('The PDF could not be generated. Please try again.');
      button.textContent=original;
    }finally{button.disabled=false;}
  });
  document.getElementById('close-preview').addEventListener('click',function(){window.close();});
})();
<\/script></body></html>`);
  win.document.close();
  toast("Report preview opened. Review the A4 layout, then choose Download / Save as PDF.");
}

function renderAll() {
  updateMetrics();
  renderDashboardProjects();
  renderDashboardTasks();
  renderActivity();
  renderPipeline();
  renderDashboardCharts();
  renderLeads();
  renderClients();
  renderContacts();
  renderProjects();
  renderTasks();
  renderMeetings();
  renderCommunications();
  renderReports();
}

function fieldMarkup(field) {
  if (field.type === "section") return `<div class="form-section-heading full"><strong>${esc(field.label)}</strong>${field.description ? `<p>${esc(field.description)}</p>` : ""}</div>`;
  const required = field.required ? "required" : "";
  const full = field.full ? "full" : "";
  if (field.type === "select") {
    return `<div class="form-field ${full}"><label for="${field.name}">${esc(field.label)}</label><select id="${field.name}" name="${field.name}" ${required}>${field.options.map(option => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join("")}</select></div>`;
  }
  if (field.type === "textarea") {
    return `<div class="form-field ${full}"><label for="${field.name}">${esc(field.label)}</label><textarea id="${field.name}" name="${field.name}" ${required} placeholder="${esc(field.placeholder || "")}"></textarea></div>`;
  }
  return `<div class="form-field ${full}"><label for="${field.name}">${esc(field.label)}</label><input id="${field.name}" name="${field.name}" type="${field.type || "text"}" ${required} placeholder="${esc(field.placeholder || "")}"></div>`;
}

const modalDefinitions = {
  "new-lead": {
    title: "Add a new lead", eyebrow: "SALES PIPELINE",
    fields: [
      { name: "company", label: "Company name", required: true, full: true, placeholder: "e.g. Example Company" },
      { name: "contact", label: "Contact person", required: true, placeholder: "Full name" },
      { name: "email", label: "Email address", type: "email", required: true, placeholder: "name@company.co.za" },
      { name: "service", label: "Service interest", required: true, full: true, placeholder: "e.g. Workflow automation" },
      { name: "stage", label: "Pipeline stage", type: "select", options: [{value:"New",label:"New"},{value:"Discovery",label:"Discovery"},{value:"Follow-up",label:"Follow-up meeting"},{value:"Requirements",label:"Requirements & scoping"},{value:"Proposal",label:"Proposal"},{value:"Negotiation",label:"Negotiation"},{value:"Agreement",label:"Agreement & deposit"},{value:"Won",label:"Won / converted"},{value:"Lost",label:"Lost"}] },
      { name: "followUp", label: "Next follow-up", type: "date" }
    ],
    async save(data) {
      const date = data.followUp ? new Date(`${data.followUp}T12:00:00`) : null;
      const draft = {
        company: data.company, contact: data.contact, email: data.email || "",
        service: data.service, stage: data.stage || "New", owner: currentActorName(),
        followUp: date ? date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "Not set",
        initials: initials(data.company), color: "orange"
      };
      try {
        if (LEADS_API_ENABLED) {
          const created = await createApiLead(draft);
          state.leads.unshift(created);
        } else {
          draft.id = Math.max(0, ...state.leads.map(item => Number(item.id) || 0)) + 1;
          state.leads.unshift(draft);
        }
        state.activities.unshift({ icon: "＋", color: "orange", text: `<strong>New lead added</strong> — ${esc(data.company)}`, by: currentActorName(), time: "Just now" });
        persistState(); renderAll(); setView("leads");
        toast(LEADS_API_ENABLED ? "Lead saved to the CRM database." : "Lead saved in this browser preview.");
      } catch (error) {
        toast(`Lead was not saved. ${error.message || "Please try again."}`);
      }
    }
  },
  "new-meeting": {
    title: "Schedule a meeting", eyebrow: "MEETING MANAGEMENT",
    fields: [
      { name: "title", label: "Meeting title", required: true, full: true, placeholder: "e.g. Discovery follow-up and solution scoping" },
      { name: "lead", label: "Lead / client name", required: true, full: true, placeholder: "Organization name" },
      { name: "type", label: "Meeting type", type: "select", required: true, options: [{value:"Discovery",label:"1 · Discovery"},{value:"Financial",label:"2 · Financial / payment options"}] },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "time", label: "Start time", type: "time" },
      { name: "duration", label: "Duration (minutes)", type: "number" },
      { name: "location", label: "Microsoft Teams meeting link", full: true, placeholder: "Paste the Microsoft Teams meeting URL" },
      { name: "attendees", label: "Attendees", full: true, placeholder: "Client attendees and Zyma team members" },
      { name: "agenda", label: "Agenda", type: "textarea", full: true, placeholder: "Topics to cover..." },
      { name: "notes", label: "Meeting notes", type: "textarea", full: true, placeholder: "Capture notes during or after the meeting..." },
      { name: "outcome", label: "Outcome", type: "textarea", full: true, placeholder: "Decision, requirements confirmed, proposal requested..." },
      { name: "nextAction", label: "Next action", full: true, placeholder: "e.g. Prepare proposal and send by Friday" },
      { name: "status", label: "Status", type: "select", options: [{value:"Scheduled",label:"Scheduled"},{value:"Completed",label:"Completed"},{value:"Cancelled",label:"Cancelled"}] }
    ],
    save(data) {
      const lead = state.leads.find(l => l.company.toLowerCase() === (data.lead || "").toLowerCase());
      state.meetings.unshift({ id: nextId(state.meetings), ...data, leadId: lead ? lead.id : "", duration: Number(data.duration || 30) });
      persistState(); renderAll(); setView("meetings"); toast("Meeting saved in this browser preview.");
    }
  },
  "new-client": {
    title: "Add a client", eyebrow: "CLIENT DIRECTORY",
    fields: [
      { name: "name", label: "Organization name", required: true, full: true, placeholder: "Registered or trading name" },
      { name: "industry", label: "Industry", required: true, placeholder: "e.g. Logistics" },
      { name: "email", label: "Main email", type: "email", required: true, placeholder: "contact@company.co.za" },
      { name: "contact", label: "Primary contact", full: true, placeholder: "Contact person or department" }
    ],
    async save(data) {
      const draft = { name: data.name, industry: data.industry, email: data.email, contact: data.contact || "Not specified", status: "Active", phone: "", projects: 0, since: new Date().toLocaleDateString("en-ZA", { month: "short", year: "numeric" }), color: "orange" };
      try {
        const client = CLIENTS_API_ENABLED ? await createApiClient(draft) : { id: nextId(state.clients), ...draft };
        state.clients.unshift(client);
        if (!CLIENTS_API_ENABLED) state.contacts.push({ id: nextId(state.contacts), name: data.contact || "Primary contact", organization: data.name, email: data.email, phone: "—", relationship: "Client contact" });
        state.activities.unshift({ icon: "＋", color: "green", text: `<strong>Client added</strong> — ${esc(data.name)}`, by: currentActorName(), time: "Just now" });
        persistState(); renderAll(); setView("clients");
        toast(CLIENTS_API_ENABLED ? "Client saved to the CRM database." : "Client created in this browser preview.");
      } catch (error) {
        toast(`Client was not saved. ${error.message || "Please try again."}`);
      }
    }
  },
  "new-contact": {
    title: "Add a contact", eyebrow: "CONTACT DIRECTORY",
    fields: [
      { type: "section", label: "Personal information", description: "Capture the person’s details and role." },
      { name: "name", label: "Full name", required: true, full: true, placeholder: "First and last name" },
      { name: "jobTitle", label: "Job title", placeholder: "e.g. Operations Manager" },
      { name: "department", label: "Department", placeholder: "e.g. Finance, Operations, IT" },
      { name: "email", label: "Work email address", type: "email", required: true, placeholder: "name@company.co.za" },
      { name: "alternateEmail", label: "Alternative email address", type: "email", placeholder: "Personal or secondary email" },
      { name: "phone", label: "Direct phone number", type: "tel", placeholder: "+27 ..." },
      { name: "mobile", label: "Mobile number", type: "tel", placeholder: "+27 ..." },
      { name: "preferredContact", label: "Preferred contact method", type: "select", options: [{value:"Email",label:"Email"},{value:"Phone",label:"Phone call"},{value:"WhatsApp",label:"WhatsApp"},{value:"Microsoft Teams",label:"Microsoft Teams"}] },
      { name: "linkedin", label: "LinkedIn profile", type: "url", full: true, placeholder: "https://www.linkedin.com/in/..." },
      { type: "section", label: "Company information", description: "Record the organization this person represents." },
      { name: "organization", label: "Company / organization name", required: true, full: true, placeholder: "Registered or trading name" },
      { name: "companyRole", label: "Relationship to company", type: "select", options: [{value:"Employee",label:"Employee"},{value:"Owner / Founder",label:"Owner / Founder"},{value:"Director / Executive",label:"Director / Executive"},{value:"Contractor / Consultant",label:"Contractor / Consultant"},{value:"Other",label:"Other"}] },
      { name: "industry", label: "Industry", placeholder: "e.g. Logistics, Energy, Non-profit" },
      { name: "companyWebsite", label: "Company website", type: "url", placeholder: "https://company.co.za" },
      { name: "companyEmail", label: "General company email", type: "email", placeholder: "info@company.co.za" },
      { name: "companyPhone", label: "Main company phone", type: "tel", placeholder: "+27 ..." },
      { name: "companySize", label: "Company size", type: "select", options: [{value:"",label:"Select company size"},{value:"1",label:"Just me"},{value:"2-10",label:"2–10 employees"},{value:"11-50",label:"11–50 employees"},{value:"51-200",label:"51–200 employees"},{value:"201-500",label:"201–500 employees"},{value:"501+",label:"501+ employees"}] },
      { name: "registrationNumber", label: "Company registration number", placeholder: "Optional" },
      { name: "vatNumber", label: "VAT number", placeholder: "Optional" },
      { name: "address", label: "Street address", full: true, placeholder: "Building, street and number" },
      { name: "city", label: "City", placeholder: "e.g. Johannesburg" },
      { name: "province", label: "Province / state", placeholder: "e.g. Gauteng" },
      { name: "postalCode", label: "Postal code", placeholder: "Postal code" },
      { name: "country", label: "Country", placeholder: "e.g. South Africa" },
      { type: "section", label: "CRM relationship", description: "Help your team understand the relationship and follow-up context." },
      { name: "relationship", label: "Relationship type", type: "select", options: [{value:"Client contact",label:"Client contact"},{value:"Decision maker",label:"Decision maker"},{value:"Project contact",label:"Project contact"},{value:"Prospect",label:"Prospect"},{value:"Supplier / Partner",label:"Supplier / Partner"},{value:"Other",label:"Other"}] },
      { name: "source", label: "How did we meet?", type: "select", options: [{value:"",label:"Select source"},{value:"Referral",label:"Referral"},{value:"Website",label:"Website enquiry"},{value:"LinkedIn",label:"LinkedIn"},{value:"Networking",label:"Networking event"},{value:"Cold outreach",label:"Cold outreach"},{value:"Existing relationship",label:"Existing relationship"},{value:"Other",label:"Other"}] },
      { name: "lastContactDate", label: "Last contact date", type: "date" },
      { name: "nextFollowUp", label: "Next follow-up date", type: "date" },
      { name: "notes", label: "Notes", type: "textarea", full: true, placeholder: "Communication preferences, responsibilities, interests, requirements or follow-up context..." }
    ],
    save(data) {
      const contact = { id: nextId(state.contacts), ...data, phone: data.phone || data.mobile || "—", relationship: data.relationship || "Client contact" };
      state.contacts.push(contact);
      state.activities.unshift({ icon: "＋", color: "orange", text: `<strong>Contact added</strong> — ${esc(data.name)} at ${esc(data.organization)}`, by: currentActorName(), time: "Just now" });
      persistState(); renderAll(); setView("contacts"); toast("Contact saved in this browser preview.");
    }
  },
  "new-communication": {
    title: "Log a communication", eyebrow: "CLIENT RELATIONSHIPS",
    fields: [
      { type: "section", label: "Interaction details", description: "Record what happened and keep the history attached to the right relationship." },
      { name: "type", label: "Interaction type", type: "select", required: true, options: [{value:"Client conversation",label:"Client conversation"},{value:"Meeting outcome",label:"Meeting outcome"},{value:"Project update",label:"Project update"},{value:"Payment follow-up",label:"Payment follow-up"},{value:"Internal note",label:"Internal note"}] },
      { name: "channel", label: "Channel", type: "select", required: true, options: [{value:"Email",label:"Email"},{value:"Phone call",label:"Phone call"},{value:"WhatsApp",label:"WhatsApp"},{value:"Microsoft Teams",label:"Microsoft Teams"},{value:"Meeting notes",label:"Meeting notes"},{value:"Project update",label:"Project update"},{value:"Internal note",label:"Internal note"},{value:"Other",label:"Other"}] },
      { name: "date", label: "Interaction date", type: "date", required: true },
      { name: "subject", label: "Subject / summary", required: true, full: true, placeholder: "e.g. Reviewed homepage feedback with client" },
      { name: "client", label: "Client organization", type: "select", required: true, options: [{value:"",label:"Select client"}] },
      { name: "project", label: "Related project", type: "select", options: [{value:"",label:"No project linked"}] },
      { name: "status", label: "Follow-up status", type: "select", required: true, options: [{value:"Logged",label:"Logged — no action pending"},{value:"Follow-up required",label:"Follow-up required"},{value:"Awaiting response",label:"Awaiting response"},{value:"Resolved",label:"Resolved"}] },
      { name: "followUp", label: "Next follow-up date", type: "date" },
      { name: "owner", label: "Assigned to", required: true, placeholder: "e.g. Khutjo M." },
      { name: "notes", label: "Notes and next actions", type: "textarea", full: true, placeholder: "What was discussed? Decisions made, promised actions, client feedback, next steps..." }
    ],
    save(data) {
      const item = { id: nextId(state.communications), ...data, createdAt: new Date().toISOString() };
      state.communications.unshift(item);
      state.activities.unshift({ icon: "▤", color: "orange", text: `<strong>Communication logged</strong> — ${esc(data.subject)}`, by: data.owner || currentActorName(), time: "Just now" });
      persistState(); renderAll(); setView("communications"); toast("Communication logged in this browser preview.");
    }
  },
  "new-project": {
    title: "Create a project", eyebrow: "PROJECT DELIVERY",
    fields: [
      { name: "name", label: "Project name", required: true, full: true, placeholder: "Enter the agreed project name" },
      { name: "client", label: "Client organization", type: "select", required: true, full: true, options: [{value:"",label:"Select an existing client"}] },
      { name: "code", label: "Project reference", placeholder: "Leave blank to generate automatically" },
      { name: "startDate", label: "Start date", type: "date" },
      { name: "due", label: "Target completion date", type: "date" },
      { name: "status", label: "Initial status", type: "select", required: true, options: [{value:"Planning",label:"Planning"},{value:"In progress",label:"In progress"},{value:"On hold",label:"On hold"}] },
      { name: "scope", label: "Agreed scope / deliverables", type: "textarea", full: true, placeholder: "Record the agreed deliverables, boundaries and acceptance criteria." }
    ],
    save(data) {
      const client = state.clients.find(item => item.name === data.client);
      if (!client) { toast("Create a client record first, then create the project."); setView("clients"); return; }
      const id = nextId(state.projects);
      const code = (data.code || `ZS-${String(id).padStart(3, "0")}`).trim().toUpperCase();
      if (state.projects.some(project => project.code.toLowerCase() === code.toLowerCase())) { toast("That project reference is already in use. Choose a unique reference."); return; }
      state.projects.push({ id, code, name: data.name.trim(), client: client.name, clientId: client.id, startDate: data.startDate || "", scope: data.scope || "", status: data.status || "Planning", progress: 0, due: data.due || "", manager: currentActorName(), color: "orange" });
      client.projects = state.projects.filter(project => project.clientId === client.id || project.client === client.name).length;
      state.activities.unshift({ icon: "▣", color: "blue", text: `<strong>Project created</strong> — ${esc(data.name)}`, by: currentActorName(), time: "Just now" });
      persistState(); renderAll(); setView("projects"); toast("Project created. Next, add milestones and tasks.");
    }
  },
  "new-task": {
    title: "Create a task", eyebrow: "WORK MANAGEMENT",
    fields: [
      { name: "title", label: "Task title", required: true, full: true, placeholder: "What needs to be done?" },
      { name: "project", label: "Project", required: true, full: true, placeholder: "Project name" },
      { name: "assignee", label: "Assignee", required: true, placeholder: "Team member" },
      { name: "due", label: "Due date", type: "date" },
      { name: "priority", label: "Priority", type: "select", options: [{value:"High",label:"High"},{value:"Medium",label:"Medium"},{value:"Low",label:"Low"}] },
      { name: "status", label: "Status", type: "select", options: [{value:"To do",label:"To do"},{value:"In progress",label:"In progress"},{value:"Done",label:"Done"}] }
    ],
    save(data) {
      state.tasks.unshift({ id: Math.max(0, ...state.tasks.map(item => item.id)) + 1, title: data.title, project: data.project, assignee: data.assignee, due: data.due || "Not set", priority: data.priority, status: data.status || "To do", done: (data.status || "To do") === "Done" });
      persistState(); renderAll(); setView("tasks"); toast("Task saved in this browser preview.");
    }
  }
};

function openModal(key, record = null) {
  const definition = modalDefinitions[key];
  if (!definition) return;
  if (key === "new-project" && state.clients.length === 0) {
    toast("Add a client first. The project must be linked to a client record.");
    setView("clients");
    openModal("new-client");
    return;
  }
  $("#modal-title").textContent = definition.title;
  $("#modal-eyebrow").textContent = definition.eyebrow;
  const fields = definition.fields.map(field => {
    if (field.name === "client") return { ...field, options: [{ value: "", label: state.clients.length ? "Select client" : "No clients yet — add a client first" }, ...state.clients.map(client => ({ value: client.name, label: client.name }))] };
    if (field.name === "project") return { ...field, options: [{ value: "", label: state.projects.length ? "Select project" : "No projects yet — create a project first" }, ...state.projects.map(project => ({ value: project.name, label: project.name }))] };
    return field;
  });
  $("#modal-fields").innerHTML = fields.map(fieldMarkup).join("");
  $("#record-form").dataset.modalKey = key;
  $("#record-form").dataset.editId = record ? String(record.id) : "";
  if (record) {
    fields.forEach(field => {
      const input = $(`#${field.name}`, $("#modal-fields"));
      if (!input) return;
      let value = record[field.name] ?? "";
      if (field.type === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) value = "";
      input.value = value === "—" || value === "Not set" ? "" : String(value);
    });
    $("#modal-title").textContent = `Edit ${definition.title.replace(/^(Add a new |Add a |Create a )/i, "")}`;
  }
  const dialog = $("#record-modal");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}
function closeModal() {
  const dialog = $("#record-modal");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function exportCurrentView() {
  let rows = [];
  let filename = "zyma-crm-export.csv";
  if (state.activeView === "leads") {
    rows = [["Company", "Contact", "Service", "Stage", "Owner", "Next follow-up"], ...state.leads.map(x => [x.company, x.contact, x.service, x.stage, x.owner, x.followUp])];
    filename = "zyma-crm-leads.csv";
  } else if (state.activeView === "clients") {
    rows = [["Client", "Industry", "Email", "Status", "Projects"], ...state.clients.map(x => [x.name, x.industry, x.email, x.status, x.projects])];
    filename = "zyma-crm-clients.csv";
  } else if (state.activeView === "projects") {
    rows = [["Reference", "Project", "Client", "Status", "Progress", "Target date"], ...state.projects.map(x => [x.code, x.name, x.client, x.status, `${x.progress}%`, x.due])];
    filename = "zyma-crm-projects.csv";
  } else if (state.activeView === "communications") {
    rows = [["Date", "Type", "Channel", "Subject", "Client", "Project", "Status", "Follow-up", "Owner", "Notes"], ...state.communications.map(x => [x.date, x.type, x.channel, x.subject, x.client, x.project, x.status, x.followUp, x.owner, x.notes])];
    filename = "zyma-crm-communications.csv";
  } else {
    rows = [["Metric", "Value"], ["Clients", state.clients.length], ["Open leads", state.leads.filter(x => !["Won", "Lost"].includes(x.stage)).length], ["Projects", state.projects.length], ["Open tasks", state.tasks.filter(x => !x.done).length]];
  }
  const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
  toast("CSV exported from the current preview data.");
}


const USD_TO_ZAR = 16.5594;
const ZOHO_PLAN_PRICES_USD = {
  "Mail Lite": { annual: 1, monthly: null },
  "Mail Premium": { annual: 1.25, monthly: null },
  "Workplace Standard": { annual: 3, monthly: 4 },
  "Workplace Professional": { annual: 6, monthly: 7 }
};
function currentWorkspaceValues() {
  const form = $("#lead-workspace-form");
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}
function updateCommercialCalculations() {
  const form = $("#lead-workspace-form");
  if (!form) return;
  const values = currentWorkspaceValues();
  const money = value => `R ${Number(value || 0).toLocaleString("en-ZA", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  const fee = Number(values.developmentFee || 0);
  const pct = [30,40,50].includes(Number(values.minimumDepositPercent)) ? Number(values.minimumDepositPercent) : 0;
  const required = fee * pct / 100;
  const paid = Number(values.depositPaid || 0);
  const update = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  update("calc-deposit-required", pct ? money(required) : "Select after finance meeting");
  update("calc-deposit-paid", money(paid));
  update("calc-deposit-outstanding", money(Math.max(0, required-paid)));
  update("calc-development-balance", money(Math.max(0, fee-paid)));
  update("calc-recurring-total", money(Number(values.monthlyFee || 0) + Number(values.zohoMonthlyFee || 0)));
  const plan = values.zohoPlan;
  const period = values.zohoBillingPeriod === "Monthly billing" ? "monthly" : "annual";
  const seats = Number(values.zohoSeats || 0);
  const price = ZOHO_PLAN_PRICES_USD[plan];
  const estimate = $("#zoho-price-estimate");
  const totalInput = $("#ws-zohoMonthlyFee");
  if (estimate) {
    if (price && seats > 0 && price[period] != null) {
      const perUserMonthly = price[period] * USD_TO_ZAR;
      const total = perUserMonthly * seats;
      estimate.textContent = `${money(perUserMonthly)} per user/month × ${seats} user(s) = ${money(total)}/month${period === "annual" ? ` (${money(total * 12)}/year, billed annually)` : ""}.`;
      if (totalInput && document.activeElement !== totalInput) totalInput.value = total.toFixed(2);
      update("calc-recurring-total", money(Number(values.monthlyFee || 0) + total));
    } else if (price && price[period] == null) {
      estimate.textContent = `${plan} is shown as annual subscription only in the supplied comparison. Select Annual billing.`;
    } else {
      estimate.textContent = "Choose a Zoho plan and enter the number of users to calculate an estimate.";
    }
  }
}
function exportDiscoveryPDF() {
  const form = $("#lead-workspace-form");
  if (!form) return;
  const lead = state.leads.find(item => String(item.id) === form.dataset.leadId);
  const rows = [...form.querySelectorAll(".workspace-section:first-of-type .workspace-field")].map(field => {
    const label = field.querySelector("label")?.textContent || "";
    const input = field.querySelector("input, textarea, select");
    const value = input?.value?.trim() || "Not provided";
    return `<section><h3>${esc(label)}</h3><p>${esc(value).replace(/\n/g,"<br>")}</p></section>`;
  }).join("");
  const win = window.open("", "_blank");
  if (!win) return toast("Please allow pop-ups to export the PDF.");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Discovery & Requirements - ${esc(lead?.company || "Lead")}</title><style>
  body{font:14px Arial,sans-serif;color:#18202b;margin:36px;line-height:1.5}header{border-bottom:3px solid #f58220;padding-bottom:16px;margin-bottom:24px}h1{margin:0 0 6px;font-size:24px}h2{font-size:17px;color:#f58220;margin:0 0 8px}h3{font-size:13px;margin:0 0 5px}p{margin:0;white-space:normal;overflow-wrap:anywhere}.meta{color:#596273}section{padding:12px 0;border-bottom:1px solid #d9dee6;break-inside:avoid}@media print{body{margin:18mm}}</style></head><body>
  <header><h1>Zyma Systems · Discovery & Requirements</h1><p class="meta">Lead: ${esc(lead?.company || "Unlinked lead")} · Contact: ${esc(lead?.contact || "Not set")} · Generated: ${new Date().toLocaleDateString("en-ZA")}</p></header>
  <h2>01 · Discovery & Requirements</h2>${rows}<script>window.onload=()=>window.print();<\/script></body></html>`);
  win.document.close();
}

document.addEventListener("click", async event => {
  const leadViewTab = event.target.closest("[data-lead-view]");
  if (leadViewTab) {
    state.leadView = leadViewTab.dataset.leadView === "table" ? "table" : "board";
    try { localStorage.setItem(LEAD_VIEW_KEY, state.leadView); } catch { /* preference just won't persist */ }
    renderLeads();
    return;
  }

  const addLeadButton = event.target.closest("[data-add-lead-stage]");
  if (addLeadButton) {
    openModal("new-lead");
    const stageInput = $("#stage", $("#modal-fields"));
    if (stageInput) stageInput.value = addLeadButton.dataset.addLeadStage;
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { setView(viewButton.dataset.view); return; }

  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) { setView(viewLink.dataset.viewLink); return; }

  if (event.target.closest("[data-export-discovery-pdf]")) { exportDiscoveryPDF(); return; }

  const reportExport = event.target.closest("[data-report-export]");
  if (reportExport) { exportReport(reportExport.dataset.reportExport); return; }

  const convertButton = event.target.closest("[data-convert-lead]");
  if (convertButton) {
    const lead = state.leads.find(item => String(item.id) === convertButton.dataset.convertLead);
    if (!lead) return toast("Lead not found.");
    if (convertButton.dataset.busy === "true") return;
    convertButton.dataset.busy = "true";
    convertButton.disabled = true;
    try {
      let client;
      if (LEADS_API_ENABLED && lead.apiBacked) {
        client = await convertApiLeadToClient(lead);
        lead.stage = "Won";
        lead.convertedClientId = client.id;
        state.clients = state.clients.filter(item => String(item.id) !== String(client.id));
        state.clients.unshift(client);
        // The API conversion is authoritative; reload to reconcile any existing linked client.
        await loadApiClients();
      } else {
        const existing = state.clients.find(item => String(item.name).toLowerCase() === String(lead.company).toLowerCase());
        if (existing) {
          lead.stage = "Won";
          client = existing;
        } else {
          client = {
            id: nextId(state.clients), name: lead.company, short: initials(lead.company),
            industry: lead.industry || "Not specified", email: lead.email || "",
            contact: lead.contact || "", phone: lead.phone || "", status: "Active", projects: 0,
            since: new Date().toLocaleDateString("en-ZA", { month: "short", year: "numeric" }),
            color: "orange", sourceLeadId: lead.id
          };
          state.clients.push(client);
          if (lead.contact || lead.email) state.contacts.push({
            id: nextId(state.contacts), name: lead.contact || lead.company,
            organization: lead.company, email: lead.email || "", phone: lead.phone || "",
            relationship: "Client contact", sourceLeadId: lead.id
          });
          lead.stage = "Won";
        }
      }
      state.activities.unshift({ icon: "✓", color: "green", text: `<strong>Lead converted to client</strong> — ${esc(lead.company)}`, by: currentActorName(), time: "Just now" });
      persistState(); renderAll(); openRecordDetail("client", client.id);
      toast("Lead converted and client saved. You can now create a project from the client profile.");
    } catch (error) {
      toast(`Could not convert this lead. ${error.message || "Please try again."}`);
    } finally {
      convertButton.disabled = false;
      delete convertButton.dataset.busy;
    }
    return;
  }

  const createProjectForClient = event.target.closest("[data-create-project-for-client]");
  if (createProjectForClient) {
    const client = state.clients.find(item => String(item.id) === createProjectForClient.dataset.createProjectForClient);
    if (!client) return toast("Client not found.");
    openModal("new-project");
    const clientSelect = $("#client", $("#modal-fields"));
    if (clientSelect) clientSelect.value = client.name;
    return;
  }

  const action = event.target.closest("[data-action]");
  if (action) {
    if (action.dataset.action === "export" || action.dataset.action === "export-communications") exportCurrentView();
    else openModal(action.dataset.action);
    return;
  }

  const scheduleButton = event.target.closest("[data-schedule-for-lead]");
  if (scheduleButton) {
    const lead = state.leads.find(item => String(item.id) === scheduleButton.dataset.scheduleForLead);
    if (lead) { openModal("new-meeting"); const leadInput = $("#lead", $("#modal-fields")); if (leadInput) { leadInput.value = lead.company; leadInput.readOnly = true; } }
    return;
  }

  const copyMeetingLink = event.target.closest("[data-copy-meeting-link]");
  if (copyMeetingLink) {
    const link = copyMeetingLink.dataset.copyMeetingLink;
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(link).then(() => toast("Teams meeting link copied.")).catch(() => toast("Copy failed. Open the meeting link and copy it from the address bar."));
    else toast("Clipboard access is unavailable here. Open the meeting link and copy it from the address bar.");
    return;
  }

  const backButton = event.target.closest("[data-back-to-list]");
  if (backButton) { returnToList(); return; }

  const openButton = event.target.closest("[data-open-record]");
  if (openButton) { openRecordDetail(openButton.dataset.openRecord, openButton.dataset.recordId); return; }

  const editButton = event.target.closest("[data-edit-record]");
  if (editButton) {
    const type = editButton.dataset.editRecord;
    const collectionName = ({ lead: "leads", client: "clients", contact: "contacts", project: "projects", task: "tasks", meeting: "meetings", communication: "communications" })[type];
    const record = collectionName && state[collectionName].find(item => String(item.id) === editButton.dataset.recordId);
    const key = `new-${type}`;
    if (record && modalDefinitions[key]) openModal(key, record);
    else toast("This record cannot be edited yet.");
    return;
  }
  const deleteButton = event.target.closest("[data-delete-record]");
  if (deleteButton) {
    const type = deleteButton.dataset.deleteRecord;
    const collectionName = ({ lead: "leads", client: "clients", contact: "contacts", project: "projects", task: "tasks", meeting: "meetings", communication: "communications" })[type];
    const collection = collectionName && state[collectionName];
    const index = collection ? collection.findIndex(item => String(item.id) === deleteButton.dataset.recordId) : -1;
    if (index < 0) return;
    const record = collection[index];
    const label = record.name || record.company || record.title || record.code || "this record";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      if (type === "lead" && LEADS_API_ENABLED && record.apiBacked) await deleteApiLead(record);
      collection.splice(index, 1);
      if (type === "lead" && record.apiBacked) removeLeadExtras(record.id);
      if (type === "client") state.contacts = state.contacts.filter(item => item.organization !== record.name);
      persistState(); renderAll();
      toast(type === "lead" && LEADS_API_ENABLED && record.apiBacked
        ? "Lead deleted from the CRM database."
        : "Record deleted from this browser preview.");
    } catch (error) {
      toast(`Could not delete the record. ${error.message || "Please try again."}`);
    }
    return;
  }

  const leadMenu = event.target.closest("[data-lead-menu]");
  if (leadMenu) {
    const lead = state.leads.find(item => item.id === Number(leadMenu.dataset.leadMenu));
    if (lead) toast(`Lead: ${lead.company} · Stage: ${lead.stage}. Editing will be added in a later step.`);
  }
});

document.addEventListener("change", event => {
  const moveSelect = event.target.closest("[data-move-lead]");
  if (moveSelect) { moveLead(moveSelect.dataset.moveLead, moveSelect.value); return; }
  const taskCheckbox = event.target.closest("[data-complete-task]");
  if (!taskCheckbox) return;
  const task = state.tasks.find(item => item.id === Number(taskCheckbox.dataset.completeTask));
  if (!task) return;
  task.done = taskCheckbox.checked;
  if (task.done) task.status = "Done";
  else task.status = "To do";
  persistState(); renderAll();
  toast(task.done ? "Task marked complete." : "Task reopened.");
});

document.addEventListener("submit", event => {
  const form = event.target.closest("#lead-workspace-form");
  if (!form) return;
  event.preventDefault();
  const lead = state.leads.find(item => String(item.id) === form.dataset.leadId);
  if (!lead) return toast("Lead record not found.");
  const data = Object.fromEntries(new FormData(form).entries());
  Object.entries(data).forEach(([key,value]) => {
    if (key === "minimumDepositPercent" && !["30","40","50"].includes(value)) lead[key] = "";
    else lead[key] = ["developmentFee","minimumDepositPercent","depositPaid","monthlyFee","freeMonths","zohoSeats","zohoMonthlyFee"].includes(key) ? (value === "" ? "" : Number(value)) : value;
  });
  const required = Number(lead.developmentFee || 0) * Number(lead.minimumDepositPercent || 0) / 100;
  if (lead.apiBacked) saveLeadExtras(lead);
  if (Number(lead.depositPaid || 0) > Number(lead.developmentFee || 0)) toast("Workspace saved in this browser only. Note: deposit received exceeds the development fee; please verify the amount.");
  else if (required > Number(lead.depositPaid || 0)) toast("Workspace saved in this browser only. Minimum deposit is not yet fully received.");
  else toast("Extended discovery, pricing and payment details are saved in this browser only; the current API schema does not yet store these fields.");
  persistState(); renderAll(); openRecordDetail("lead", lead.id);
});

$("#record-form").addEventListener("submit", async event => {
  event.preventDefault();
  const key = event.currentTarget.dataset.modalKey;
  const definition = modalDefinitions[key];
  if (!definition) return;
  const formData = new FormData(event.currentTarget);
  const data = Object.fromEntries(formData.entries());
  if (!event.currentTarget.reportValidity()) return;
  const editId = event.currentTarget.dataset.editId;
  if (editId) {
    const type = key.replace("new-", "");
    const collectionName = ({ lead: "leads", client: "clients", contact: "contacts", project: "projects", task: "tasks", meeting: "meetings", communication: "communications" })[type];
    const record = collectionName && state[collectionName].find(item => String(item.id) === editId);
    if (record) {
      const previousName = record.name;
      const changes = Object.fromEntries(Object.entries(data).filter(([field, value]) => field in record && value !== ""));
      if (type === "lead" && LEADS_API_ENABLED && record.apiBacked) {
        const candidate = { ...record, ...changes };
        try {
          await updateApiLead(candidate);
          Object.assign(record, changes);
          record.initials = initials(record.company);
          record.apiBacked = true;
        } catch (error) {
          toast(`Lead was not updated. ${error.message || "Please try again."}`);
          return;
        }
      } else {
        Object.assign(record, changes);
      }
      if (type === "lead") record.initials = initials(record.company);
      if (type === "meeting") { record.leadId = state.leads.find(l => l.company.toLowerCase() === String(record.lead).toLowerCase())?.id || record.leadId || ""; }
      if (type === "client") { const oldName = record.name; record.short = initials(record.name); state.contacts.filter(item => item.organization === oldName).forEach(contact => { contact.organization = record.name; }); const contact = state.contacts.find(item => item.organization === record.name); if (contact) contact.email = record.email; state.projects.filter(project => project.client === oldName).forEach(project => { project.client = record.name; }); }
      if (type === "project") { record.code = (record.code || "").toUpperCase(); record.progress = Math.max(0, Math.min(100, Number(record.progress) || 0)); state.tasks.filter(task => task.project === previousName).forEach(task => { task.project = record.name; }); }
      if (type === "task") { record.done = record.status === "Done"; }
      state.activities.unshift({ icon: "✎", color: "orange", text: `<strong>Record updated</strong> — ${esc(record.name || record.company || record.title || record.code || "CRM record")}`, by: currentActorName(), time: "Just now" });
      persistState(); renderAll();
      toast(type === "lead" && LEADS_API_ENABLED && record.apiBacked
        ? "Lead updated in the CRM database."
        : "Record updated in this browser preview.");
    }
  } else definition.save(data);
  closeModal();
  event.currentTarget.reset();
  delete event.currentTarget.dataset.editId;
});
$("#modal-close").addEventListener("click", closeModal);
$("#modal-cancel").addEventListener("click", closeModal);
$("#record-modal").addEventListener("click", event => {
  if (event.target === $("#record-modal")) closeModal();
});
$("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#notifications-button").addEventListener("click", () => toast("You're all caught up. Notification delivery will be connected to the backend later."));
$("#profile-button").addEventListener("click", () => { let user = null; try { user = JSON.parse(sessionStorage.getItem("zymaCrmAuthenticatedUser") || "null"); } catch {} const name = user?.name || user?.email || "Unknown user"; const role = ({super_admin:"Super Admin",employee:"Employee",sales:"Sales & Client Relations",project_manager:"Project Manager",viewer:"Read-only"})[user?.role] || user?.role || "User"; toast(`Signed in as ${name} · ${role}.`); });
$("#theme-toggle").addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
  toast(`${nextTheme === "light" ? "Light" : "Dark"} theme enabled.`);
});
$("#global-search").addEventListener("input", () => {
  if (state.activeView === "leads") renderLeads();
  if (state.activeView === "clients") renderClients();
  if (state.activeView === "contacts") renderContacts();
  if (state.activeView === "projects") renderProjects();
  if (state.activeView === "tasks") renderTasks();
});
$("#lead-search").addEventListener("input", renderLeads);

// Drag & drop between pipeline stages
const leadBoard = $("#leads-board");
leadBoard.addEventListener("dragstart", event => {
  const card = event.target.closest("[data-lead-card]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.leadCard);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("dragging");
  leadBoard.classList.add("is-dragging");
});
leadBoard.addEventListener("dragend", () => {
  leadBoard.classList.remove("is-dragging");
  $$(".dragging, .drop-target", leadBoard).forEach(node => node.classList.remove("dragging", "drop-target"));
});
leadBoard.addEventListener("dragover", event => {
  const column = event.target.closest("[data-lead-column]");
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  $$(".drop-target", leadBoard).forEach(node => node !== column && node.classList.remove("drop-target"));
  column.classList.add("drop-target");
});
leadBoard.addEventListener("drop", event => {
  const column = event.target.closest("[data-lead-column]");
  if (!column) return;
  event.preventDefault();
  const moved = moveLead(event.dataTransfer.getData("text/plain"), column.dataset.leadColumn);
  if (!moved) renderLeads();
});
$("#communication-search")?.addEventListener("input", renderCommunications);
$("#communication-filters")?.addEventListener("click", event => {
  const button = event.target.closest("[data-communication-filter]");
  if (!button) return;
  state.communicationFilter = button.dataset.communicationFilter;
  $$("#communication-filters [data-communication-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderCommunications();
});
$("#communication-list")?.addEventListener("click", event => {
  if (!event.target.closest("[data-communication-reset]")) return;
  state.communicationFilter = "all";
  const search = $("#communication-search"); if (search) search.value = "";
  $$("#communication-filters [data-communication-filter]").forEach(item => item.classList.toggle("active", item.dataset.communicationFilter === "all"));
  renderCommunications();
});

$("#client-search").addEventListener("input", renderClients);
$("#client-filters")?.addEventListener("click", event => {
  const button = event.target.closest("[data-client-filter]");
  if (!button) return;
  state.clientFilter = button.dataset.clientFilter;
  renderClients();
});
$("#client-grid")?.addEventListener("click", event => {
  if (!event.target.closest("[data-client-reset]")) return;
  state.clientFilter = "all";
  const search = $("#client-search");
  if (search) search.value = "";
  renderClients();
});
$("#contact-search").addEventListener("input", renderContacts);
$("#contact-filters")?.addEventListener("click", event => {
  const button = event.target.closest("[data-contact-filter]");
  if (!button) return;
  state.contactFilter = button.dataset.contactFilter;
  renderContacts();
});
$("#contact-card-grid")?.addEventListener("click", event => {
  if (!event.target.closest("[data-contact-reset]")) return;
  state.contactFilter = "all";
  const search = $("#contact-search");
  if (search) search.value = "";
  renderContacts();
});
$("#project-search").addEventListener("input", renderProjects);
$("#task-search").addEventListener("input", renderTasks);
$("#meeting-search")?.addEventListener("input", renderMeetings);
$("#reports-period")?.addEventListener("change", renderReportTrend);

$("#lead-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.leadFilter = button.dataset.filter;
  $$(".filter-tab", $("#lead-filters")).forEach(tab => tab.classList.toggle("active", tab === button));
  renderLeads();
});
$("#project-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.projectFilter = button.dataset.filter;
  $$(".filter-tab", $("#project-filters")).forEach(tab => tab.classList.toggle("active", tab === button));
  renderProjects();
});
$("#task-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.taskFilter = button.dataset.filter;
  $$(".filter-tab", $("#task-filters")).forEach(tab => tab.classList.toggle("active", tab === button));
  renderTasks();
});
document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault(); $("#global-search").focus();
  }
  if (event.key === "Escape") $("#sidebar").classList.remove("open");
});


// Settings: browser-preview preferences only; sensitive integration credentials stay server-side.
const SETTINGS_KEY = "zyma-crm-settings-v1";
const DEFAULT_SETTINGS = {
  workspaceName: "Zyma Systems", website: "https://zyma.co.za", currency: "ZAR", timezone: "Africa/Johannesburg",
  dateFormat: "DD MMM YYYY", compactTables: false, followups: true, meetings: true, projectAlerts: true
};
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
let settingsPreferences = loadSettings();
function saveSettings(partial = {}) {
  settingsPreferences = { ...settingsPreferences, ...partial };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsPreferences)); toast("Settings saved in this browser."); }
  catch { toast("Settings updated for this session, but browser storage is unavailable."); }
}
function populateSettings() {
  const setValue = (selector, value) => { const el = $(selector); if (el) el.value = value; };
  const setChecked = (selector, value) => { const el = $(selector); if (el) el.checked = Boolean(value); };
  setValue("#setting-workspace-name", settingsPreferences.workspaceName);
  setValue("#setting-workspace-website", settingsPreferences.website);
  setValue("#setting-currency", settingsPreferences.currency);
  setValue("#setting-timezone", settingsPreferences.timezone);
  setValue("#setting-date-format", settingsPreferences.dateFormat);
  setChecked("#setting-compact-tables", settingsPreferences.compactTables);
  setChecked("#setting-followups", settingsPreferences.followups);
  setChecked("#setting-meetings", settingsPreferences.meetings);
  setChecked("#setting-project-alerts", settingsPreferences.projectAlerts);
  $$('[data-setting-theme]').forEach(button => button.classList.toggle("active", button.dataset.settingTheme === document.documentElement.dataset.theme));
}
$("#workspace-settings-form")?.addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const website = String(form.get("website") || "").trim();
  if (website && !/^https?:\/\//i.test(website)) { toast("Enter a website starting with https:// or http://."); return; }
  saveSettings({ workspaceName: String(form.get("workspaceName") || "Zyma Systems").trim() || "Zyma Systems", website, currency: String(form.get("currency") || "ZAR"), timezone: String(form.get("timezone") || "Africa/Johannesburg") });
});
$("#save-preferences")?.addEventListener("click", () => saveSettings({ dateFormat: $("#setting-date-format").value, compactTables: $("#setting-compact-tables").checked }));
$("#save-notifications")?.addEventListener("click", () => saveSettings({ followups: $("#setting-followups").checked, meetings: $("#setting-meetings").checked, projectAlerts: $("#setting-project-alerts").checked }));
$$('[data-setting-theme]').forEach(button => button.addEventListener("click", () => {
  const theme = button.dataset.settingTheme;
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  populateSettings();
  toast(`${theme === "light" ? "Light" : "Dark"} theme enabled.`);
}));
$$('[data-settings-nav]').forEach(link => link.addEventListener("click", event => {
  event.preventDefault();
  const target = document.getElementById(`settings-${link.dataset.settingsNav}`);
  if (!target) return;
  $$('[data-settings-nav]').forEach(item => item.classList.toggle("active", item === link));
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}));
populateSettings();

renderAll();
if (LEADS_API_ENABLED) {
  loadApiLeads();
  loadApiClients();
}
const initialView = window.location.hash.replace("#", "");
const [hashType, hashId] = initialView.split("/");
if (hashId && recordCollections[hashType]) openRecordDetail(hashType, decodeURIComponent(hashId));
else if (initialView && document.getElementById(`view-${initialView}`)) setView(initialView);


/* Accessible scroll reveals + replayable chart entrance effects for dynamically rendered CRM content. */
(function initZymaScrollMotion() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  const revealSelector = '.page-heading, .analytics-heading, .metric-card, .chart-panel, .report-card, .settings-card, .table-panel, .communication-entry, .project-choice, .milestone, .task, .column, .client-card, .contact-card';
  const seen = new WeakSet();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add('is-visible');
      if (el.matches('.chart-panel')) {
        el.querySelectorAll('.chart-content').forEach(content => content.classList.add('is-chart-visible'));
      }
      if (el.matches('.chart-content')) el.classList.add('is-chart-visible');
      observer.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });
  function observe(root) {
    if (!root || root.nodeType !== 1 && root !== document) return;
    if (root.matches && root.matches(revealSelector) && !seen.has(root)) {
      seen.add(root);
      root.classList.add('scroll-reveal');
      observer.observe(root);
    }
    if (root.querySelectorAll) root.querySelectorAll(revealSelector).forEach(el => {
      if (seen.has(el)) return;
      seen.add(el);
      el.classList.add('scroll-reveal');
      observer.observe(el);
    });
    if (root.matches && root.matches('.chart-content')) observer.observe(root);
    if (root.querySelectorAll) root.querySelectorAll('.chart-content').forEach(el => observer.observe(el));
  }
  observe(document.documentElement);
  const mutations = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === 1) observe(node);
    const parentChart = node.parentElement && node.parentElement.closest('.chart-content');
    if (parentChart && parentChart.classList.contains('is-chart-visible')) parentChart.classList.remove('is-chart-visible'), requestAnimationFrame(() => parentChart.classList.add('is-chart-visible'));
  })));
  mutations.observe(document.body, { childList: true, subtree: true });
})();
