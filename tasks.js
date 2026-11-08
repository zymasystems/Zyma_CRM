(() => {
"use strict";

/* ---------------------------------------------------------------
   Zyma CRM — Tasks & milestones
   Reads projects, tasks, leads and meetings from the main CRM's browser records
   (same origin) so every number matches the main CRM.
   --------------------------------------------------------------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const CRM_KEY = "zyma-crm-preview-v2";
const MILESTONE_KEY = "zyma-crm-project-milestones-v2";
const THEME_KEY = "zyma-crm-theme";
const STATUSES = ["To do", "In progress", "In review", "Done"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const norm = value => String(value ?? "").trim().toLowerCase();
const pad = n => String(n).padStart(2, "0");
const initials = name => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- dates (local time, never UTC-shifted) ---------- */
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const isIso = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const dateOnly = value => {
  if (!value) return "";
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};
function normalizeDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const isoDate = dateOnly(raw);
  if (isoDate) return isoDate;
  if (raw.toLowerCase() === "today") return todayStr();
  const match = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?(?:\s+(\d{4}))?/);
  if (match) {
    const month = MONTHS.findIndex(m => m.toLowerCase() === match[2].toLowerCase());
    if (month >= 0) return ymd(new Date(match[3] ? Number(match[3]) : new Date().getFullYear(), month, Number(match[1])));
  }
  return "";
}
function fmt(iso) {
  if (!isIso(iso)) return "No due date";
  const [y, m, d] = iso.split("-").map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

/* ---------- reading the shared CRM records ---------- */
function readCrm() {
  try {
    const raw = localStorage.getItem(CRM_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : null;
  } catch { return null; }
}
function readMilestones() {
  try {
    const value = JSON.parse(localStorage.getItem(MILESTONE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function normalizeCrm(crm) {
  const arr = key => (Array.isArray(crm?.[key]) ? crm[key] : []);
  const projects = arr("projects").map((p, i) => {
    return {
      id: String(p.id ?? p.projectId ?? p.name ?? `project-${i + 1}`),
      sourceId: p.id ?? p.projectId ?? p.name ?? `project-${i + 1}`,
      name: p.name || p.title || "Untitled project",
      code: p.code || "", status: p.status || "Planning", progress: Number(p.progress) || 0,
      due: p.due || p.dueDate || "", manager: p.manager || p.assignee || ""
    };
  });
  const tasks = arr("tasks").map((t, i) => {
    const byName = norm(t.project || t.projectName || t.project_name);
    const byId = t.projectId ?? t.project_id;
    const project = projects.find(p =>
      (byName && norm(p.name) === byName) ||
      (byId != null && (String(p.sourceId) === String(byId) || String(p.id) === String(byId))));
    const isDone = t.done === true || String(t.done).toLowerCase() === "true" || ["done", "completed"].includes(norm(t.status));
    return {
      id: String(t.id ?? `task-${i + 1}`), sourceId: t.id ?? `task-${i + 1}`,
      projectId: project ? project.id : "", projectLabel: t.project || "",
      milestoneId: t.milestoneId ? String(t.milestoneId) : "",
      title: t.title || t.name || "Untitled task", description: t.description || "",
      assignee: t.assignee || "", priority: t.priority || "Medium",
      status: isDone ? "Done" : (STATUSES.includes(t.status) ? t.status : "To do"),
      due: normalizeDate(t.due || t.dueDate), sourceRecord: t
    };
  });
  const milestones = readMilestones()
    .map(m => ({ ...m, id: String(m.id), projectId: String(m.projectId) }))
    .filter(m => projects.some(p => p.id === m.projectId));
  return { hasCrm: !!crm, projects, tasks, milestones, leads: arr("leads"), meetings: arr("meetings") };
}
const loadState = () => normalizeCrm(readCrm());
let apiMode = false;
let apiLoadError = "";

const fromApiStatus = value => {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  const mapped = {
    "to do": "To do", "todo": "To do", "in progress": "In progress",
    "in review": "In review", "completed": "Done", "done": "Done",
    "blocked": "In review"
  }[key];
  return mapped || (STATUSES.includes(raw) ? raw : "To do");
};
const toApiStatus = value => ({
  "To do": "To Do", "In progress": "In Progress", "In review": "In Review", "Done": "Completed"
})[value] || "To Do";
const fromApiMilestoneStatus = value => ({
  pending: "Planned", "in progress": "In progress", completed: "Completed",
  delayed: "Blocked", cancelled: "Blocked", blocked: "Blocked", planned: "Planned"
})[String(value || "").trim().toLowerCase()] || "Planned";
const toApiMilestoneStatus = value => ({
  "Planned": "Pending", "In progress": "In Progress", "Completed": "Completed", "Blocked": "Delayed"
})[value] || "Pending";
const apiDate = value => {
  if (!value) return null;
  const d = isIso(value) ? `${value}T00:00:00Z` : value;
  return d;
};
function mapApiState(projects, tasks, milestones) {
  const mappedProjects = projects.map(p => ({
    id: String(p.id || p.Id), sourceId: p.id || p.Id, name: p.name || p.Name || "Untitled project", description: p.description || p.Description || "", requirements: p.requirements || p.Requirements || "",
    code: "", clientName: p.clientName || p.ClientName || "", status: p.status || p.Status || "Planning",
    progress: 0, startDate: normalizeDate(p.startDateUtc || p.StartDateUtc), due: normalizeDate(p.targetEndDateUtc || p.TargetEndDateUtc), manager: p.clientName || p.ClientName || ""
  }));
  const mappedTasks = tasks.map(t => ({
    id: String(t.id || t.Id), sourceId: t.id || t.Id, projectId: String(t.projectId || t.ProjectId), projectLabel: mappedProjects.find(p => p.id === String(t.projectId || t.ProjectId))?.name || "",
    milestoneId: String(t.milestoneId || t.MilestoneId || ""),
    title: t.title || t.Title || "Untitled task", description: t.description || t.Description || "",
    assignee: t.assignedToName || t.AssignedToName || "", priority: t.priority || t.Priority || "Medium",
    status: fromApiStatus(t.status || t.Status), due: normalizeDate(t.dueDateUtc || t.DueDateUtc),
    startDate: normalizeDate(t.startDateUtc || t.StartDateUtc),
    sourceRecord: t
  }));
  const mappedMilestones = milestones.map(m => ({
    id: String(m.id || m.Id), sourceId: m.id || m.Id, projectId: String(m.projectId || m.ProjectId),
    title: m.title || m.Title || "Untitled milestone", description: m.description || m.Description || "",
    status: fromApiMilestoneStatus(m.status || m.Status), due: normalizeDate(m.targetDateUtc || m.TargetDateUtc),
    isApprovedForClientView: !!(m.isApprovedForClientView ?? m.IsApprovedForClientView), sourceRecord: m
  }));
  return { hasCrm: true, projects: mappedProjects, tasks: mappedTasks,
    milestones: mappedMilestones, leads: [], meetings: [] };
}
async function loadApiState() {
  if (!window.ZymaCrmApi || !window.ZymaCrmApi.getToken()) return false;
  const api = window.ZymaCrmApi;
  try {
    const [projects, tasks, milestones] = await Promise.all([
      api.request("/projects"), api.request("/tasks"), api.request("/milestones")
    ]);
    state = mapApiState(projects || [], tasks || [], milestones || []);

    // Load sidebar counts from the same live CRM API as the main workspace.
    // Keep these requests independent so a non-essential count endpoint cannot
    // prevent the task board from loading.
    const countRequests = await Promise.allSettled([
      api.request("/leads"),
      api.request("/meetings"),
      api.request("/clients"),
      api.request("/contacts")
    ]);
    const countValue = result => result.status === "fulfilled" && Array.isArray(result.value)
      ? result.value.length : 0;
    // Keep count collections as arrays: sidebar rendering and other views use .length.
    state.leads = countRequests[0].status === "fulfilled" && Array.isArray(countRequests[0].value) ? countRequests[0].value : [];
    state.meetings = countRequests[1].status === "fulfilled" && Array.isArray(countRequests[1].value) ? countRequests[1].value : [];
    state.clients = countRequests[2].status === "fulfilled" && Array.isArray(countRequests[2].value) ? countRequests[2].value : [];
    state.contacts = countRequests[3].status === "fulfilled" && Array.isArray(countRequests[3].value) ? countRequests[3].value : [];
    apiMode = true;
    apiLoadError = "";
    return true;
  } catch (error) {
    apiLoadError = error?.message || "Could not load project data from the API.";
    return false;
  }
}

let state = loadState();
let tab = "board", statusFilter = "all", priorityFilter = "all", query = "";
let projectFilter = "all", pickerQuery = "";
let timelineData = null, timelineLoading = false, timelineError = "";
let timelineRange = "project", timelineView = "gantt", timelineType = "all", timelineFilter = "all", timelineSearch = "", timelineCustomStart = "", timelineCustomEnd = "";

/* ---------- lookups ---------- */
const project = id => state.projects.find(p => p.id === id);
const isCompletedProject = p => String(p?.status || "").trim().toLowerCase() === "completed";
const isActiveProjectId = id => { const p = project(id); return !!p && !isCompletedProject(p); };
const pname = id => project(id)?.name || "Unassigned";
const mname = id => state.milestones.find(m => m.id === id)?.title || "";
const isOpen = t => t.status !== "Done";
const overdue = t => !!t.due && isIso(t.due) && t.due < todayStr() && isOpen(t);
function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  $("#toast-region").append(item);
  setTimeout(() => item.remove(), 3400);
}

/* ---------- sidebar counts (same rules as the main CRM) ---------- */
function renderSidebarCounts() {
  const setCount = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };
  setCount("lead-nav-count", state.leads.length);
  setCount("meeting-nav-count", state.meetings.length);
  setCount("client-nav-count", state.clients.length);
  setCount("contact-nav-count", state.contacts.length);
  setCount("project-nav-count", state.projects.filter(p => !isCompletedProject(p)).length);
  // Count actionable items consistently: open tasks plus milestones not yet completed.
  // Match the main CRM badge: total task records plus total milestone records.
  setCount("task-nav-count", state.tasks.filter(t => isActiveProjectId(t.projectId) && t.status === "In progress").length);
}

/* =========================================================
   Step 1 — project picker
   ========================================================= */
function renderPicker() {
  renderSidebarCounts();
  renderPickerMetrics();
  renderProjectCards();
  renderDataNote();
}
function renderPickerMetrics() {
  const activeProjects = state.projects.filter(p => !isCompletedProject(p));
  const inDelivery = activeProjects.length;
  const cards = [
    ["Projects", activeProjects.length, "blue", "▣", `${inDelivery} in delivery`],
    ["Open tasks", state.tasks.filter(t => isActiveProjectId(t.projectId) && isOpen(t)).length, "green", "☑", "Across active projects"],
    ["In progress", state.tasks.filter(t => isActiveProjectId(t.projectId) && t.status === "In progress").length, "violet", "↗", "Currently being worked on"],
    ["Overdue", state.tasks.filter(t => isActiveProjectId(t.projectId) && overdue(t)).length, "orange", "◎", "Past their due date"]
  ];
  $("#picker-metrics").innerHTML = cards.map(([label, value, color, icon, caption]) =>
    `<article class="metric-card"><div class="metric-top"><span class="metric-label">${esc(label)}</span><span class="metric-icon icon-${color}">${icon}</span></div><div class="metric-value">${pad(value)}</div><div class="metric-foot"><span class="metric-neutral">${esc(caption)}</span></div></article>`).join("");
}
function visiblePickerProjects() {
  const q = norm(pickerQuery);
  return state.projects.filter(p => !isCompletedProject(p) && (!q || [p.name, p.code, p.status, p.manager].join(" ").toLowerCase().includes(q)));
}
function renderProjectCards() {
  const list = visiblePickerProjects();
  $("#project-picker-count").textContent = plural(list.length, "project");
  let html = list.map(p => {
    const tasks = state.tasks.filter(t => t.projectId === p.id);
    const done = tasks.filter(t => t.status === "Done").length;
    const active = tasks.filter(t => t.status === "In progress").length;
    const late = tasks.filter(overdue).length;
    const ms = state.milestones.filter(m => m.projectId === p.id);
    const msDone = ms.filter(m => m.status === "Completed").length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const stateClass = ({ "In progress": "status-progress", Planning: "status-planning", Completed: "status-done", "On hold": "status-hold" })[p.status] || "status-planning";
    return `<article class="project-choice">
      <div class="project-choice-top"><div class="project-choice-id"><span class="company-mark">${esc(initials(p.name))}</span><div><h2>${esc(p.name)}</h2><div class="project-choice-client">${esc(p.clientName ? "Client: " + p.clientName : (p.manager ? "Manager: " + p.manager : "No client linked"))} · Target ${esc(p.due || "not set")}</div></div></div><span class="project-code">${esc(p.code || "PROJECT")}</span></div>
      <div><span class="status-pill ${stateClass}">${esc(p.status)}</span></div>
      <div class="project-choice-stats">
        <div class="project-choice-stat"><b>${pad(tasks.length - done)}</b><span>Open tasks</span></div>
        <div class="project-choice-stat"><b>${pad(active)}</b><span>In progress</span></div>
        <div class="project-choice-stat"><b>${pad(late)}</b><span>Overdue</span></div>
      </div>
      <div class="project-choice-progress"><div><span>Task completion</span><b>${pct}%</b></div><div class="progress-track"><div class="progress-fill ${pct >= 70 ? "green" : ""}" style="width:${pct}%"></div></div></div>
      <div class="project-choice-footer"><small>${msDone}/${ms.length} milestones complete</small><button type="button" class="button button-primary" data-open-project="${esc(p.id)}">Open project →</button></div>
    </article>`;
  }).join("");
  if (!html) {
    if (!state.hasCrm) html = `<div class="picker-empty"><strong>No CRM data found in this browser.</strong><br>Open the <a href="index.html">main CRM</a> first, on this same address, then come back here.</div>`;
    else if (!state.projects.length) html = `<div class="picker-empty"><strong>No projects in the CRM yet.</strong><br>Create a project in the main CRM, then return here to manage its tasks and milestones.</div>`;
    else html = `<div class="picker-empty">No projects match your search.</div>`;
  }
  $("#project-picker-grid").innerHTML = html;
}
function renderDataNote() {
  const unlinkedTasks = state.tasks.filter(t => !t.projectId);
  const notes = [];
  if (apiMode) notes.push("Connected to the live CRM API. Project, task and milestone changes are saved to the shared database.");
  else if (apiLoadError) notes.push(`Live API data could not be loaded: ${apiLoadError}. Showing browser preview data instead.`);
  else notes.push("Showing browser-local preview data. Sign in to load shared project records.");
  if (unlinkedTasks.length) notes.push(`${plural(unlinkedTasks.length, "task")} ${unlinkedTasks.length === 1 ? "isn't" : "aren't"} linked to a project.`);
  $("#data-note").innerHTML = `<span>ⓘ</span> ${esc(notes.join(" "))}`;
  $("#data-note").classList.remove("hidden");
}

/* =========================================================
   Step 2 — project workspace
   ========================================================= */
function openProject(id) {
  if (!project(id)) return;
  projectFilter = id; statusFilter = "all"; priorityFilter = "all"; query = "";
  $("#task-search").value = ""; $("#global-search").value = ""; $("#priority-filter").value = "all";
  $("#project-picker-view").classList.add("hidden");
  $("#project-workspace-view").classList.remove("hidden");
  renderWorkspace();
  if (tab === "timeline") void loadProjectTimeline();
  window.scrollTo(0, 0);
}
function closeProject() {
  projectFilter = "all"; statusFilter = "all"; priorityFilter = "all"; query = "";
  $("#task-search").value = ""; $("#global-search").value = pickerQuery;
  $("#project-workspace-view").classList.add("hidden");
  $("#project-picker-view").classList.remove("hidden");
  $("#breadcrumb-current").textContent = "Tasks & milestones";
  document.title = "Tasks & Milestones | Zyma CRM";
  renderPicker();
}
function renderWorkspace() {
  renderSidebarCounts();
  renderHeader();
  renderOptions();
  renderMetrics();
  renderBoard();
  renderList();
  renderMilestones();
  renderTimeline();
  ["board", "list", "milestones", "timeline"].forEach(name => $(`#${name}`).classList.toggle("hidden", tab !== name));
  $$("#view-tabs [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $$("#filters [data-status]").forEach(b => b.classList.toggle("active", b.dataset.status === statusFilter));
}
function renderHeader() {
  const p = project(projectFilter);
  $("#ws-eyebrow").textContent = p ? (p.code || "PROJECT").toUpperCase() : "PROJECT DELIVERY";
  $("#ws-title").textContent = p ? p.name : "All projects";
  $("#ws-sub").textContent = p
    ? `${p.status} · Target ${p.due || "not set"} · Project manager ${p.manager || "—"}`
    : "Tasks and milestones across every project.";
  $("#breadcrumb-current").textContent = p ? p.name : "Tasks & milestones";
  document.title = `${p ? p.name + " | " : ""}Tasks & Milestones | Zyma CRM`;
}
function renderOptions() {
  const opts = state.projects.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  $("#project-filter").innerHTML = `<option value="all">All projects</option>${opts}`;
  $("#project-filter").value = projectFilter;
  $("#task-project").innerHTML = opts;
  $("#milestone-project").innerHTML = opts;
}
function scopedTasks() { return projectFilter === "all" ? state.tasks.filter(t => isActiveProjectId(t.projectId)) : state.tasks.filter(t => t.projectId === projectFilter); }
function scopedMilestones() { return projectFilter === "all" ? state.milestones.filter(m => isActiveProjectId(m.projectId)) : state.milestones.filter(m => m.projectId === projectFilter); }
function visibleTasks() {
  const q = norm(query);
  return scopedTasks().filter(t =>
    (statusFilter === "all" || t.status === statusFilter) &&
    (priorityFilter === "all" || t.priority === priorityFilter) &&
    (!q || [t.title, t.assignee, t.description, pname(t.projectId), mname(t.milestoneId)].join(" ").toLowerCase().includes(q)));
}
function renderMetrics() {
  const ts = scopedTasks(), ms = scopedMilestones();
  const open = ts.filter(isOpen);
  $("#metric-open").textContent = pad(open.length);
  $("#metric-progress").textContent = pad(ts.filter(t => t.status === "In progress").length);
  $("#metric-overdue").textContent = pad(ts.filter(overdue).length);
  $("#metric-milestones").textContent = `${ms.filter(m => m.status === "Completed").length}/${ms.length}`;
  $("#all-count").textContent = ts.length;
  const pct = ts.length ? Math.round((ts.length - open.length) / ts.length * 100) : 0;
  $("#progress-value").textContent = `${pct}%`;
  $("#progress-bar").style.width = `${pct}%`;
  $("#progress-label").textContent = projectFilter === "all" ? "Overall task completion" : `${pname(projectFilter)} · task completion`;
}
const priorityClass = p => ({ High: "priority-high", Medium: "priority-medium", Low: "priority-low" })[p] || "priority-low";
const taskStatusClass = s => ({ "To do": "status-planning", "In progress": "status-progress", "In review": "status-hold", Done: "status-done" })[s] || "status-planning";
const milestoneStatusClass = s => ({ Planned: "status-planning", "In progress": "status-progress", Completed: "status-done", Blocked: "status-blocked" })[s] || "status-planning";

function taskCard(t) {
  const p = project(t.projectId);
  const tag = p?.name || "Unassigned";
  const ms = mname(t.milestoneId);
  return `<article class="task" draggable="true" data-task="${esc(t.id)}">
    <div class="task-top"><span class="project-tag">${esc(tag)}</span><span class="priority-pill ${priorityClass(t.priority)}">${esc(t.priority)}</span></div>
    <h3>${esc(t.title)}</h3>
    ${t.description ? `<p>${esc(t.description.length > 90 ? t.description.slice(0, 90) + "…" : t.description)}</p>` : ""}
    ${ms ? `<span class="milestone-tag">⚑ ${esc(ms)}</span>` : ""}
    <div class="task-foot"><span>${esc(t.assignee || "Unassigned")}</span><span class="${overdue(t) ? "overdue" : ""}">${esc(fmt(t.due))}</span></div>
  </article>`;
}
function renderBoard() {
  const list = visibleTasks();
  $("#board").innerHTML = STATUSES.map(s => {
    const items = list.filter(t => t.status === s);
    return `<div class="column" data-column="${esc(s)}"><div class="column-head"><span>${esc(s)}<small>${items.length}</small></span><button type="button" data-add="${esc(s)}" aria-label="Add task to ${esc(s)}">＋</button></div><div class="stack">${items.map(taskCard).join("") || '<div class="empty">No tasks here</div>'}</div></div>`;
  }).join("");
}
function renderList() {
  const items = visibleTasks();
  const rows = items.map(t => {
    const p = project(t.projectId);
    return `<tr>
      <td><div class="table-primary"><div><button type="button" class="record-link task-link" data-task="${esc(t.id)}">${esc(t.title)}</button><small>Task #${esc(String(t.id).padStart(3, "0"))}</small></div></div></td>
      <td>${esc(p?.name || "Unassigned")}</td><td>${esc(mname(t.milestoneId) || "—")}</td><td>${esc(t.assignee || "—")}</td>
      <td><span class="priority-pill ${priorityClass(t.priority)}">${esc(t.priority)}</span></td>
      <td><span class="status-pill ${taskStatusClass(t.status)}">${esc(t.status)}</span></td>
      <td class="${overdue(t) ? "overdue" : ""}">${esc(fmt(t.due))}</td></tr>`;
  }).join("") || `<tr><td colspan="7">No tasks match these filters.</td></tr>`;
  $("#list").innerHTML = `<div class="table-toolbar"><div><h2 class="toolbar-title">Task list</h2><p class="muted">${plural(items.length, "task")}</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Task</th><th>Project</th><th>Milestone</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Due</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderMilestones() {
  const ms = scopedMilestones();
  const cards = ms.map(m => {
    const ts = state.tasks.filter(t => t.milestoneId === m.id);
    const done = ts.filter(t => t.status === "Done").length;
    const pct = ts.length ? Math.round(done / ts.length * 100) : 0;
    const p = project(m.projectId);
    return `<article class="milestone">
      <div class="milestone-head"><h3>${esc(m.title)}</h3><span class="status-pill ${milestoneStatusClass(m.status)}">${esc(m.status)}</span></div>
      <p>${esc(p?.name || "Unassigned")} · Target ${esc(fmt(m.due))}</p>
      ${m.description ? `<p>${esc(m.description)}</p>` : ""}
      <div class="progress-track"><div class="progress-fill ${pct >= 70 ? "green" : ""}" style="width:${pct}%"></div></div>
      <p>${done}/${ts.length} tasks done</p>
      <span class="record-actions"><button type="button" class="row-action-button" data-edit-ms="${esc(m.id)}">Edit</button><button type="button" class="row-action-button danger" data-del-ms="${esc(m.id)}">Delete</button></span>
    </article>`;
  }).join("") || `<div class="empty" style="grid-column:1/-1">No milestones yet. Use “New milestone” to add one.</div>`;
  $("#milestones").innerHTML = `<div class="table-toolbar"><div><h2 class="toolbar-title">Milestones</h2><p class="muted">${plural(ms.length, "milestone")}</p></div></div><div class="milestone-grid">${cards}</div>`;
}

/* ---------- project timeline (live API endpoint) ---------- */
const readField = (value, camel, pascal) => value?.[camel] ?? value?.[pascal] ?? null;
function timelineDate(value) {
  const normalized = normalizeDate(value);
  return normalized ? fmt(normalized) : "Date not set";
}
function timelineStatusClass(value) {
  return ({
    "Completed": "status-done", "Overdue": "status-blocked", "Delayed": "status-blocked",
    "Upcoming": "status-progress", "On Schedule": "status-planning",
    "Unscheduled": "status-hold", "Cancelled": "status-hold"
  })[value] || "status-planning";
}
function renderTimeline() {
  const root = $("#timeline");
  if (!root) return;
  if (projectFilter === "all") {
    root.innerHTML = `<div class="timeline-empty"><strong>Select a project to view its timeline.</strong><p>The timeline is available within an individual project workspace.</p></div>`;
    return;
  }
  if (timelineLoading) {
    root.innerHTML = `<div class="timeline-empty"><span class="timeline-spinner"></span><strong>Loading project timeline…</strong></div>`;
    return;
  }
  if (timelineError) {
    root.innerHTML = `<div class="timeline-empty"><strong>Timeline could not be loaded.</strong><p>${esc(timelineError)}</p><button type="button" class="button button-secondary" id="timeline-retry">Try again</button></div>`;
    return;
  }
  if (!timelineData) {
    root.innerHTML = `<div class="timeline-empty"><strong>Project timeline not loaded.</strong><p>Open this tab while connected to the live CRM API.</p></div>`;
    return;
  }

  const summary = timelineData.summary || {};
  const projectData = timelineData.project || {};
  const milestones = Array.isArray(timelineData.milestones) ? timelineData.milestones : [];
  const tasks = Array.isArray(timelineData.tasks) ? timelineData.tasks : [];
  const items = [
    ...milestones.map(item => ({ id: readField(item,"id","Id"), kind:"Milestone", title:readField(item,"title","Title")||"Untitled milestone", description:readField(item,"description","Description"), status:readField(item,"scheduleStatus","ScheduleStatus")||readField(item,"status","Status")||"Unscheduled", start:readField(item,"startDateUtc","StartDateUtc"), due:readField(item,"targetDateUtc","TargetDateUtc"), completed:readField(item,"completedAtUtc","CompletedAtUtc"), raw:item })),
    ...tasks.map(item => ({ id:readField(item,"id","Id"), kind:"Task", title:readField(item,"title","Title")||"Untitled task", description:readField(item,"description","Description"), status:readField(item,"scheduleStatus","ScheduleStatus")||readField(item,"status","Status")||"Unscheduled", start:readField(item,"startDateUtc","StartDateUtc"), due:readField(item,"dueDateUtc","DueDateUtc"), completed:readField(item,"completedAtUtc","CompletedAtUtc"), assignee:readField(item,"assignedToName","AssignedToName"), raw:item }))
  ];
  const projectStart = readField(projectData,"startDateUtc","StartDateUtc") || project(projectFilter)?.startDate;
  const projectEnd = readField(projectData,"targetEndDateUtc","TargetEndDateUtc") || project(projectFilter)?.due;
  const toDay = value => { const d=normalizeDate(value); return d ? new Date(`${d}T00:00:00`) : null; };
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const today = new Date(); today.setHours(0,0,0,0);
  const valid = items.filter(i => toDay(i.start || i.due));
  let min = toDay(projectStart) || (valid.length ? new Date(Math.min(...valid.map(i=>toDay(i.start||i.due).getTime()))) : new Date(today));
  let max = toDay(projectEnd) || (valid.length ? new Date(Math.max(...valid.map(i=>toDay(i.due||i.start).getTime()))) : new Date(today));
  if (timelineRange === "week") { min = new Date(today); min.setDate(today.getDate()-today.getDay()); max = new Date(min); max.setDate(min.getDate()+6); }
  if (timelineRange === "month") { min = new Date(today.getFullYear(),today.getMonth(),1); max = new Date(today.getFullYear(),today.getMonth()+1,0); }
  if (timelineRange === "custom" && timelineCustomStart && timelineCustomEnd) { min=toDay(timelineCustomStart); max=toDay(timelineCustomEnd); }
  if (max < min) max = new Date(min);
  const span = Math.max(1, Math.round((max-min)/86400000)+1);
  const dayWidth = timelineRange === "week" ? 82 : timelineRange === "month" ? 52 : 48;
  const gridWidth = span * dayWidth;
  const inRange = item => { const a=toDay(item.start||item.due), b=toDay(item.due||item.start); return a && b && b>=min && a<=max; };
  const filtered = items.filter(item => {
    if (timelineType === "tasks" && item.kind !== "Task") return false;
    if (timelineType === "milestones" && item.kind !== "Milestone") return false;
    if (timelineFilter === "completed" && !/completed|done/i.test(item.status)) return false;
    if (timelineFilter === "overdue" && !/overdue|delayed/i.test(item.status)) return false;
    if (timelineFilter === "upcoming" && !/upcoming|on schedule|planned/i.test(item.status)) return false;
    if (timelineSearch && !`${item.title} ${item.description||""} ${item.assignee||""}`.toLowerCase().includes(timelineSearch.toLowerCase())) return false;
    return true;
  });
  const scheduled = filtered.filter(inRange).sort((a,b)=>(toDay(a.start||a.due)||min)-(toDay(b.start||b.due)||min));
  const unscheduled = filtered.filter(i=>!toDay(i.start||i.due));
  // Two-tier calendar header: month bands above readable day columns.
  const monthBands = [];
  let bandStart = 0;
  while (bandStart < span) {
    const bandDate = new Date(min); bandDate.setDate(min.getDate() + bandStart);
    let bandEnd = bandStart + 1;
    while (bandEnd < span) {
      const nextDate = new Date(min); nextDate.setDate(min.getDate() + bandEnd);
      if (nextDate.getMonth() !== bandDate.getMonth() || nextDate.getFullYear() !== bandDate.getFullYear()) break;
      bandEnd++;
    }
    monthBands.push(`<span class="gantt-month-band" style="left:${bandStart*dayWidth}px;width:${(bandEnd-bandStart)*dayWidth}px">${esc(bandDate.toLocaleDateString("en-ZA",{month:"long",year:"numeric"}))}</span>`);
    bandStart = bandEnd;
  }
  const dayLabels = [];
  for (let i=0;i<span;i++) {
    const d = new Date(min); d.setDate(min.getDate()+i);
    const weekend = d.getDay()===0 || d.getDay()===6;
    const label = timelineRange === "project" && span > 70
      ? (d.getDay()===1 ? `<small>${esc(d.toLocaleDateString("en-ZA",{weekday:"short"}))}</small>${d.getDate()}` : `${d.getDate()}`)
      : `<small>${esc(d.toLocaleDateString("en-ZA",{weekday:"short"}))}</small>${d.getDate()}`;
    dayLabels.push(`<span class="gantt-day-cell ${weekend?"is-weekend":""}" style="left:${i*dayWidth}px;width:${dayWidth}px">${label}</span>`);
  }
  const todayOffset = Math.round((today-min)/86400000);
  const todayLine = todayOffset>=0 && todayOffset<span ? `<i class="gantt-today-overlay" style="left:${420+todayOffset*dayWidth+dayWidth/2}px;height:${scheduled.length*58}px"><b>Today</b></i>` : "";
  const barFor = item => {
    const start=toDay(item.start||item.due), end=toDay(item.due||item.start); if(!start||!end||end<min||start>max) return "";
    const left=Math.max(0,(start-min)/86400000)*dayWidth;
    const width=Math.max(12,(Math.min(span-1,(end-min)/86400000)-Math.max(0,(start-min)/86400000)+1)*dayWidth-8);
    const done=/completed|done/i.test(item.status), late=/overdue|delayed/i.test(item.status);
    return item.kind === "Milestone" ? `<span class="gantt-milestone ${done?"is-done":""}" style="left:${left+Math.max(0,width/2)-7}px" title="${esc(item.title)}"></span>` : `<span class="gantt-bar ${done?"is-done":late?"is-late":""}" style="left:${left+4}px;width:${width}px" title="${esc(item.title)} · ${esc(item.status)}"><i></i></span>`;
  };
  const ganttRows = scheduled.map(item=>`<div class="gantt-row"><button type="button" class="gantt-label" data-timeline-open="${esc(item.id||"")}" data-kind="${item.kind.toLowerCase()}"><span class="gantt-kind ${item.kind.toLowerCase()}">${item.kind==="Milestone"?"◆":"●"}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.kind)} · ${esc(item.assignee||item.status)}</small></span></button><div class="gantt-track" style="width:${gridWidth}px"><span class="gantt-grid-lines" style="background-size:${dayWidth}px 100%"></span>${barFor(item)}</div></div>`).join("");
  const listRows = scheduled.map(item=>`<button type="button" class="timeline-schedule-row" data-timeline-open="${esc(item.id||"")}" data-kind="${item.kind.toLowerCase()}"><span class="gantt-list-name"><i class="gantt-kind ${item.kind.toLowerCase()}">${item.kind==="Milestone"?"◆":"●"}</i><strong>${esc(item.title)}</strong></span><span>${esc(timelineDate(item.start))}</span><span>${esc(timelineDate(item.due))}</span><span class="status-pill ${timelineStatusClass(item.status)}">${esc(item.status)}</span></button>`).join("");
  const metric=(label,value,note)=>`<article class="timeline-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
  root.innerHTML = `
    <div class="timeline-heading"><div><p class="eyebrow">DELIVERY SCHEDULE</p><h2>Project timeline</h2><p>Plan, monitor and coordinate delivery across tasks and milestones.</p></div><button type="button" class="button button-secondary" id="timeline-refresh">↻ Refresh</button></div>
    <div class="timeline-metrics">${metric("Delivery items",items.length,`${tasks.length} tasks · ${milestones.length} milestones`)}${metric("Completed",(summary.completedTasks||0)+(summary.completedMilestones||0),"Tasks and milestones done")}${metric("Overdue",(summary.overdueTasks||0)+(summary.overdueMilestones||0),"Past target date")}${metric("Upcoming tasks",summary.upcomingTasks||0,"Due soon")}</div>
    <div class="timeline-project-dates"><div><span>Project start</span><strong>${esc(timelineDate(projectStart))}</strong></div><div><span>Target completion</span><strong>${esc(timelineDate(projectEnd))}</strong></div><div><span>Last generated</span><strong>${esc(timelineDate(timelineData.generatedAtUtc||timelineData.GeneratedAtUtc))}</strong></div></div>
    <div class="gantt-toolbar"><div class="gantt-control"><label for="gantt-range">Schedule range</label><select id="gantt-range"><option value="project" ${timelineRange==="project"?"selected":""}>Full project</option><option value="week" ${timelineRange==="week"?"selected":""}>This week</option><option value="month" ${timelineRange==="month"?"selected":""}>This month</option><option value="custom" ${timelineRange==="custom"?"selected":""}>Custom range</option></select></div><div class="gantt-control"><label for="gantt-type">Show</label><select id="gantt-type"><option value="all" ${timelineType==="all"?"selected":""}>All schedule items</option><option value="tasks" ${timelineType==="tasks"?"selected":""}>Tasks only</option><option value="milestones" ${timelineType==="milestones"?"selected":""}>Milestones only</option></select></div><div class="gantt-control"><label for="gantt-filter">Status</label><select id="gantt-filter"><option value="all" ${timelineFilter==="all"?"selected":""}>All statuses</option><option value="overdue" ${timelineFilter==="overdue"?"selected":""}>Overdue</option><option value="upcoming" ${timelineFilter==="upcoming"?"selected":""}>Upcoming / planned</option><option value="completed" ${timelineFilter==="completed"?"selected":""}>Completed</option></select></div><label class="gantt-search">⌕ <input id="gantt-search" type="search" value="${esc(timelineSearch)}" placeholder="Find a task or milestone"></label><div class="gantt-view-switch"><button type="button" data-gantt-view="gantt" class="${timelineView==="gantt"?"active":""}">Gantt chart</button><button type="button" data-gantt-view="list" class="${timelineView==="list"?"active":""}">Schedule list</button></div></div>
    ${timelineRange==="custom"?`<div class="gantt-custom-range"><label>From <input type="date" id="gantt-custom-start" value="${esc(timelineCustomStart)}"></label><label>To <input type="date" id="gantt-custom-end" value="${esc(timelineCustomEnd)}"></label></div>`:""}
    <div class="gantt-legend"><span><i class="legend-task"></i> Task duration</span><span><i class="legend-done"></i> Completed</span><span><i class="legend-late"></i> Overdue</span><span><i class="legend-milestone"></i> Milestone</span><span><i class="legend-today"></i> Today</span><small>${scheduled.length} of ${filtered.length} matching items in range</small></div>
    ${timelineView==="gantt"?`<div class="gantt-shell"><div class="gantt-chart"><div class="gantt-left-head">Work item <small>NAME / STATUS</small></div><div class="gantt-date-head" style="width:${gridWidth}px"><div class="gantt-month-row">${monthBands.join("")}</div><div class="gantt-day-row">${dayLabels.join("")}</div></div>${todayLine}${ganttRows||`<div class="gantt-no-rows">No scheduled items match these filters in the selected range.</div>`}</div></div>`:`<div class="gantt-list"><div class="timeline-schedule-head"><span>Item</span><span>Start</span><span>Target</span><span>Status</span></div>${listRows||`<div class="gantt-no-rows">No scheduled items match these filters in the selected range.</div>`}</div>`}
    ${unscheduled.length?`<section class="gantt-unscheduled"><div><h3>Unscheduled items</h3><p>These items do not have a start or target date. Add dates when they are confirmed.</p></div><div>${unscheduled.map(i=>`<button type="button" data-timeline-open="${esc(i.id||"")}" data-kind="${i.kind.toLowerCase()}"><span class="gantt-kind ${i.kind.toLowerCase()}">${i.kind==="Milestone"?"◆":"●"}</span>${esc(i.title)}<small>${i.kind}</small></button>`).join("")}</div></section>`:""}`;
}

async function loadProjectTimeline() {
  if (!apiMode || !window.ZymaCrmApi?.getToken()) {
    timelineData = null;
    timelineError = "The project timeline requires an authenticated connection to the CRM API.";
    timelineLoading = false;
    renderTimeline();
    return;
  }
  if (projectFilter === "all") return;
  timelineLoading = true;
  timelineError = "";
  renderTimeline();
  try {
    timelineData = await window.ZymaCrmApi.request(`/projects/${encodeURIComponent(projectFilter)}/timeline`);
    if (!timelineData || typeof timelineData !== "object") throw new Error("The API returned an invalid timeline response.");
  } catch (error) {
    timelineData = null;
    timelineError = error?.message || "Unable to retrieve the project timeline.";
  } finally {
    timelineLoading = false;
    renderTimeline();
  }
}

/* ---------- saving back into the shared CRM records ---------- */
function deriveMilestoneStatus(milestoneId) {
  const attached = state.tasks.filter(task => String(task.milestoneId || "") === String(milestoneId));
  if (!attached.length) return "Planned";
  if (attached.every(task => task.status === "Done")) return "Completed";
  if (attached.some(task => task.status === "In progress" || task.status === "In review")) return "In progress";
  return "Planned";
}
function syncMilestoneStatuses(changedTask, previousMilestoneId = "") {
  const ids = new Set([String(previousMilestoneId || ""), String(changedTask?.milestoneId || "")].filter(Boolean));
  ids.forEach(id => {
    const milestone = state.milestones.find(item => String(item.id) === id);
    if (milestone) milestone.status = deriveMilestoneStatus(id);
  });
}
async function save(message, change = null) {
  if (change?.kind === "task" && change.action !== "delete") {
    const previousMilestoneId = change.record?._previousMilestoneId || "";
    syncMilestoneStatuses(change.record, previousMilestoneId);
  }
  if (apiMode && change) {
    const api = window.ZymaCrmApi;
    try {
      const { kind, action, record, id } = change;
      const base = kind === "task" ? "/tasks" : "/milestones";
      if (action === "delete") {
        await api.request(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      } else if (kind === "task") {
        const body = {
          projectId: record.projectId,
          milestoneId: record.milestoneId || null,
          title: record.title,
          description: record.description || null,
          status: toApiStatus(record.status),
          priority: record.priority || "Medium",
          assignedToUserId: record.sourceRecord?.assignedToUserId || null,
          startDateUtc: apiDate(record.startDate),
          dueDateUtc: apiDate(record.due)
        };
        await api.request(action === "create" ? base : `${base}/${encodeURIComponent(record.id)}`, {
          method: action === "create" ? "POST" : "PUT",
          body: JSON.stringify(body)
        });
        const milestoneIds = new Set([String(record._previousMilestoneId || ""), String(record.milestoneId || "")].filter(Boolean));
        for (const milestoneId of milestoneIds) {
          const linkedMilestone = state.milestones.find(item => String(item.id) === milestoneId);
          if (!linkedMilestone) continue;
          const milestoneBody = {
            projectId: linkedMilestone.projectId,
            title: linkedMilestone.title,
            description: linkedMilestone.description || null,
            status: toApiMilestoneStatus(deriveMilestoneStatus(linkedMilestone.id)),
            targetDateUtc: apiDate(linkedMilestone.due)
          };
          await api.request(`/milestones/${encodeURIComponent(linkedMilestone.id)}`, { method: "PUT", body: JSON.stringify(milestoneBody) });
        }
      } else {
        const body = {
          projectId: record.projectId,
          title: record.title,
          description: record.description || null,
          status: toApiMilestoneStatus(record.status),
          targetDateUtc: apiDate(record.due)
        };
        await api.request(action === "create" ? base : `${base}/${encodeURIComponent(record.id)}`, {
          method: action === "create" ? "POST" : "PUT",
          body: JSON.stringify(body)
        });
      }
      if (change.kind === "task" && change.record) delete change.record._previousMilestoneId;
      const loaded = await loadApiState();
      if (!loaded) throw new Error(apiLoadError || "Could not refresh records from the API.");
      renderWorkspace();
      renderPicker();
      if (tab === "timeline") void loadProjectTimeline();
      if (message) toast(message);
    } catch (error) {
      const loaded = await loadApiState();
      if (loaded) { renderWorkspace(); renderPicker(); }
      toast(error?.message || "The change could not be saved to the CRM API.");
    }
    return;
  }

  const crm = readCrm();
  if (!crm) { toast("No saved CRM data found for this browser. Open the main CRM on this same address first."); return; }
  const oldTasks = Array.isArray(crm.tasks) ? crm.tasks : [];
  crm.tasks = state.tasks.map(task => {
    const existing = oldTasks.find(item => String(item.id) === String(task.id)) || task.sourceRecord || {};
    const p = project(task.projectId);
    const id = existing.id ?? (Number.isFinite(Number(task.id)) ? Number(task.id) : Date.now());
    return {
      ...existing, id, title: task.title, project: p ? p.name : (task.projectLabel || ""),
      assignee: task.assignee || "", priority: task.priority || "Medium", status: task.status,
      done: task.status === "Done", due: task.due ? fmt(task.due) : "Not set",
      description: task.description || "", milestoneId: task.milestoneId || ""
    };
  });
  try {
    localStorage.setItem(CRM_KEY, JSON.stringify(crm));
    localStorage.setItem(MILESTONE_KEY, JSON.stringify(state.milestones));
  } catch { toast("Changes are visible but could not be saved in this browser."); }
  state = loadState();
  renderWorkspace();
  if (message) toast(message);
}

/* ---------- dialogs ---------- */
function openDialog(dialog) { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); }
function closeDialog(dialog) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
function updateMilestones() {
  const pid = $("#task-project").value;
  $("#task-milestone").innerHTML = '<option value="">No milestone</option>' +
    state.milestones.filter(m => m.projectId === pid).map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join("");
}
function taskForm(id = null, status = null) {
  if (!state.projects.length) return toast("Create a project in the main CRM first.");
  const t = state.tasks.find(x => String(x.id) === String(id));
  $("#task-form").reset();
  $("#task-id").value = t ? t.id : "";
  $("#task-form-title").textContent = t ? "Edit task" : "Create task";
  $("#task-title").value = t?.title || "";
  $("#task-project").value = t?.projectId || (projectFilter !== "all" ? projectFilter : state.projects[0].id);
  updateMilestones();
  $("#task-milestone").value = t?.milestoneId || "";
  $("#task-assignee").value = t?.assignee || "";
  $("#task-status").value = t?.status || status || "To do";
  $("#task-priority").value = t?.priority || "Medium";
  $("#task-start").value = t?.startDate || "";
  $("#task-due").value = t?.due || "";
  $("#task-description").value = t?.description || "";
  openDialog($("#task-modal"));
}
function milestoneForm(id = null) {
  if (!state.projects.length) return toast("Create a project in the main CRM first.");
  const m = state.milestones.find(x => x.id === id);
  $("#milestone-form").reset();
  $("#milestone-id").value = m ? m.id : "";
  $("#milestone-form-title").textContent = m ? "Edit milestone" : "Create milestone";
  $("#milestone-title").value = m?.title || "";
  $("#milestone-project").value = m?.projectId || (projectFilter !== "all" ? projectFilter : state.projects[0].id);
  $("#milestone-due").value = m?.due || "";
  $("#milestone-status").value = m?.status || "Planned";
  $("#milestone-description").value = m?.description || "";
  openDialog($("#milestone-modal"));
}
function detail(id) {
  const t = state.tasks.find(x => String(x.id) === String(id));
  if (!t) return;
  const p = project(t.projectId);
  const d = $("#detail-modal");
  d.innerHTML = `<div class="modal-card">
    <div class="modal-header"><div><span class="priority-pill ${priorityClass(t.priority)}">${esc(t.priority)} priority</span><h2 style="margin-top:10px">${esc(t.title)}</h2><p class="detail-meta">${esc(pname(t.projectId))}</p></div><button type="button" class="icon-button" id="detail-close" aria-label="Close dialog">×</button></div>
    <p class="detail-summary">${esc(t.description || "No description added.")}</p>
    <div class="modal-fields">
      <div class="form-field"><label for="detail-status">Status</label><select id="detail-status">${STATUSES.map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="form-field"><label for="detail-assignee">Assignee</label><input id="detail-assignee" value="${esc(t.assignee)}"></div>
      <div class="form-field"><label for="detail-start">Start date</label><input id="detail-start" type="date" value="${esc(t.startDate || "")}"></div>
      <div class="form-field"><label for="detail-due">Due date</label><input id="detail-due" type="date" value="${esc(t.due)}"></div>
      <div class="form-field"><label for="detail-milestone">Milestone</label><select id="detail-milestone"><option value="">No milestone</option>${state.milestones.filter(m => m.projectId === t.projectId).map(m => `<option value="${esc(m.id)}" ${m.id === t.milestoneId ? "selected" : ""}>${esc(m.title)}</option>`).join("")}</select></div>
    </div>
    <div class="modal-actions"><button type="button" class="button button-secondary" id="detail-edit">Edit all fields</button><button type="button" class="button button-secondary" id="detail-delete">Delete task</button><button type="button" class="button button-primary" id="detail-save">Save changes</button></div>
  </div>`;
  openDialog(d);
  $("#detail-close").onclick = () => closeDialog(d);
  $("#detail-edit").onclick = () => { closeDialog(d); taskForm(t.id); };
  $("#detail-save").onclick = () => {
    const previousMilestoneId = t.milestoneId || "";
    t.status = $("#detail-status").value; t.assignee = $("#detail-assignee").value.trim();
    t.startDate = $("#detail-start").value; t.due = $("#detail-due").value; t.milestoneId = $("#detail-milestone").value;
    t._previousMilestoneId = previousMilestoneId;
    closeDialog(d); save("Task updated", { kind: "task", action: "update", record: t });
  };
  $("#detail-delete").onclick = () => {
    if (!confirm("Delete this task?")) return;
    state.tasks = state.tasks.filter(x => String(x.id) !== String(id));
    closeDialog(d); save("Task deleted", { kind: "task", action: "delete", id });
  };
}

/* ---------- AI project plan draft via authenticated CRM API proxy ---------- */
let pendingProjectPlanDraft = null;
async function generateProjectPlanDraft() {
  const selected = project(projectFilter);
  if (!selected || projectFilter === "all") return toast("Open a specific project before generating its plan.");
  if (!apiMode || !window.ZymaCrmApi?.getToken()) return toast("Sign in to the live CRM before generating a project plan.");
  const button = $("#generate-project-plan");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Generating draft…";
  try {
    const existingTasks = state.tasks.filter(t => t.projectId === selected.id).map(t => ({
      title: t.title, description: t.description, status: toApiStatus(t.status), priority: t.priority, dueDate: t.due || null
    }));
    const existingMilestones = state.milestones.filter(m => m.projectId === selected.id).map(m => ({
      title: m.title, description: m.description, status: toApiMilestoneStatus(m.status), targetDate: m.due || null
    }));
    const draft = await window.ZymaCrmApi.request(`/project-plans/${encodeURIComponent(selected.id)}/generate`, {
      method: "POST",
      body: JSON.stringify({
        projectId: selected.id,
        projectName: selected.name,
        description: selected.description || "",
        requirements: selected.requirements || selected.description || "",
        startDate: selected.startDate || todayStr(),
        targetEndDate: selected.due || "",
        existingTasks,
        existingMilestones
      })
    });
    if (!draft || !Array.isArray(draft.milestones)) throw new Error("The planner returned an invalid draft.");
    pendingProjectPlanDraft = draft;
    renderProjectPlanDraft(draft);
  } catch (error) {
    toast(error?.message || "Could not generate the project plan draft.");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
function renderProjectPlanDraft(draft) {
  const approveButton = $("#project-plan-approve");
  approveButton.disabled = false;
  approveButton.textContent = "Approve & create tasks";
  $("#project-plan-summary").textContent = draft.summary || `Draft plan for ${draft.projectName || project(projectFilter)?.name || "this project"}.`;
  const content = $("#project-plan-content");
  content.innerHTML = draft.milestones.map((m, index) => `
    <article class="project-plan-milestone">
      <div class="project-plan-milestone-head"><span class="project-plan-index">${String(index + 1).padStart(2, "0")}</span><div><h3>${esc(m.title)}</h3><p>${esc(m.description || "")}</p></div><time>${esc(m.targetDate || "Date not set")}</time></div>
      <div class="project-plan-tasks">${(Array.isArray(m.tasks) ? m.tasks : []).map(t => `<div class="project-plan-task"><div><strong>${esc(t.title)}</strong><p>${esc(t.description || "")}</p><small>${esc(t.startDate || "No start date")} → ${esc(t.dueDate || "No due date")}</small></div><span class="priority-pill ${priorityClass(t.priority || "Medium")}">${esc(t.priority || "Medium")}</span></div>`).join("") || `<p class="muted">No tasks returned for this milestone.</p>`}</div>
    </article>`).join("") || `<p class="muted">The planner returned no milestones.</p>`;
  openDialog($("#project-plan-modal"));
}
$("#generate-project-plan").addEventListener("click", () => void generateProjectPlanDraft());
$("#project-plan-close").addEventListener("click", () => closeDialog($("#project-plan-modal")));
$("#project-plan-cancel").addEventListener("click", () => closeDialog($("#project-plan-modal")));
$("#project-plan-reject").addEventListener("click", () => {
  if (!pendingProjectPlanDraft) return closeDialog($("#project-plan-modal"));
  if (!confirm("Reject and discard this draft? Nothing will be added to the project.")) return;
  pendingProjectPlanDraft = null;
  closeDialog($("#project-plan-modal"));
  toast("Project plan draft rejected. No changes were saved.");
});
$("#project-plan-approve").addEventListener("click", async () => {
  const selected = project(projectFilter);
  if (!selected || !pendingProjectPlanDraft) return toast("Generate a project-plan draft first.");
  if (!apiMode || !window.ZymaCrmApi?.getToken()) return toast("Sign in to the live CRM before approving a project plan.");
  const button = $("#project-plan-approve");
  button.disabled = true;
  button.textContent = "Checking for duplicates…";
  try {
    // AI drafts can contain items already created during an earlier attempt. Remove
    // existing and repeated titles before submitting, scoped to this project.
    const titleKey = value => norm(value).replace(/[^a-z0-9]+/g, " ").trim();
    const existingTaskTitles = new Set(state.tasks.filter(t => t.projectId === selected.id).map(t => titleKey(t.title)).filter(Boolean));
    const existingMilestoneTitles = new Set(state.milestones.filter(m => m.projectId === selected.id).map(m => titleKey(m.title)).filter(Boolean));
    const draftMilestoneTitles = new Set();
    const draftTaskTitles = new Set();
    const milestones = (pendingProjectPlanDraft.milestones || []).filter(m => {
      const key = titleKey(m.title);
      if (!key || existingMilestoneTitles.has(key) || draftMilestoneTitles.has(key)) return false;
      draftMilestoneTitles.add(key);
      return true;
    }).map(m => ({
      ...m,
      tasks: (Array.isArray(m.tasks) ? m.tasks : []).filter(t => {
        const key = titleKey(t.title);
        if (!key || existingTaskTitles.has(key) || draftTaskTitles.has(key)) return false;
        draftTaskTitles.add(key);
        return true;
      })
    }));
    const newTaskCount = milestones.reduce((total, milestone) => total + milestone.tasks.length, 0);
    if (!milestones.length && !newTaskCount) {
      throw new Error("This plan contains no new milestones or tasks. The existing project records were left unchanged. Generate a fresh plan or edit the draft titles before approving.");
    }
    button.textContent = "Saving plan…";
    const result = await window.ZymaCrmApi.request(`/project-plans/${encodeURIComponent(selected.id)}/approve`, {
      method: "POST",
      body: JSON.stringify({ milestones })
    });
    pendingProjectPlanDraft = null;
    closeDialog($("#project-plan-modal"));
    const loaded = await loadApiState();
    if (!loaded) throw new Error("The plan was approved, but the task board could not refresh. Reload the page to view saved tasks.");
    if (inWorkspace()) renderWorkspace(); else renderPicker();
    toast(result?.message || "Project plan approved. Milestones and tasks have been added to the project.");
  } catch (error) {
    toast(error?.message || "Could not approve the project plan.");
    button.disabled = false;
    button.textContent = "Approve & create tasks";
  }
});

/* ---------- events ---------- */
$("#task-form").addEventListener("submit", e => {
  e.preventDefault();
  const id = $("#task-id").value;
  const t = {
    id: id || String(Math.max(0, ...state.tasks.map(x => Number(x.id) || 0)) + 1),
    title: $("#task-title").value.trim(), projectId: $("#task-project").value, milestoneId: $("#task-milestone").value,
    assignee: $("#task-assignee").value.trim(), status: $("#task-status").value, priority: $("#task-priority").value,
    startDate: $("#task-start").value, due: $("#task-due").value, description: $("#task-description").value.trim()
  };
  if (id) {
    const old = state.tasks.find(x => String(x.id) === String(id));
    t.sourceRecord = old?.sourceRecord; t.projectLabel = old?.projectLabel; t._previousMilestoneId = old?.milestoneId || "";
    state.tasks = state.tasks.map(x => String(x.id) === String(id) ? t : x);
  } else state.tasks.unshift(t);
  closeDialog($("#task-modal"));
  save(id ? "Task updated" : "Task created", { kind: "task", action: id ? "update" : "create", record: t });
});
$("#milestone-form").addEventListener("submit", e => {
  e.preventDefault();
  const id = $("#milestone-id").value;
  const m = {
    id: id || `m${Date.now()}`, title: $("#milestone-title").value.trim(), projectId: $("#milestone-project").value,
    due: $("#milestone-due").value, status: $("#milestone-status").value, description: $("#milestone-description").value.trim()
  };
  state.milestones = id ? state.milestones.map(x => x.id === id ? m : x) : [m, ...state.milestones];
  closeDialog($("#milestone-modal"));
  save(id ? "Milestone updated" : "Milestone created", { kind: "milestone", action: id ? "update" : "create", record: m });
});
$$("[data-close]").forEach(b => b.addEventListener("click", () => closeDialog($(`#${b.dataset.close}`))));
$$("dialog.modal").forEach(dlg => dlg.addEventListener("click", e => { if (e.target === dlg) closeDialog(dlg); }));
$("#new-task").addEventListener("click", () => taskForm());
$("#new-milestone").addEventListener("click", () => milestoneForm());
$("#task-project").addEventListener("change", updateMilestones);
$("#project-filter").addEventListener("change", e => { projectFilter = e.target.value; renderWorkspace(); });
$("#priority-filter").addEventListener("change", e => { priorityFilter = e.target.value; renderWorkspace(); });
$("#filters").addEventListener("click", e => {
  const b = e.target.closest("[data-status]");
  if (b) { statusFilter = b.dataset.status; renderWorkspace(); }
});
$("#view-tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-tab]");
  if (b) {
    tab = b.dataset.tab;
    renderWorkspace();
    if (tab === "timeline") void loadProjectTimeline();
  }
});
$("#timeline").addEventListener("click", e => {
  if (e.target.closest("#timeline-retry, #timeline-refresh")) { void loadProjectTimeline(); return; }
  const view = e.target.closest("[data-gantt-view]");
  if (view) { timelineView = view.dataset.ganttView; renderTimeline(); return; }
  const open = e.target.closest("[data-timeline-open]");
  if (open && open.dataset.kind === "task") { taskForm(open.dataset.timelineOpen); return; }
  if (open && open.dataset.kind === "milestone") { milestoneForm(open.dataset.timelineOpen); }
});
$("#timeline").addEventListener("change", e => {
  if (e.target.id === "gantt-range") { timelineRange=e.target.value; renderTimeline(); }
  if (e.target.id === "gantt-type") { timelineType=e.target.value; renderTimeline(); }
  if (e.target.id === "gantt-filter") { timelineFilter=e.target.value; renderTimeline(); }
  if (e.target.id === "gantt-custom-start") { timelineCustomStart=e.target.value; renderTimeline(); }
  if (e.target.id === "gantt-custom-end") { timelineCustomEnd=e.target.value; renderTimeline(); }
});
$("#timeline").addEventListener("input", e => {
  if (e.target.id === "gantt-search") { timelineSearch=e.target.value; const pos=e.target.selectionStart; renderTimeline(); const input=$("#gantt-search"); input?.focus(); input?.setSelectionRange(pos,pos); }
});
const inWorkspace = () => !$("#project-workspace-view").classList.contains("hidden");
$("#task-search").addEventListener("input", e => { query = e.target.value; $("#global-search").value = query; renderWorkspace(); });
$("#project-picker-search").addEventListener("input", e => { pickerQuery = e.target.value; $("#global-search").value = pickerQuery; renderProjectCards(); });
$("#global-search").addEventListener("input", e => {
  const value = e.target.value;
  if (inWorkspace()) { query = value; $("#task-search").value = value; renderWorkspace(); }
  else { pickerQuery = value; $("#project-picker-search").value = value; renderProjectCards(); }
});
$("#project-picker-grid").addEventListener("click", e => {
  const b = e.target.closest("[data-open-project]");
  if (b) openProject(b.dataset.openProject);
});
$("#back-to-projects").addEventListener("click", closeProject);
$("#board").addEventListener("click", e => {
  const add = e.target.closest("[data-add]");
  if (add) { taskForm(null, add.dataset.add); return; }
  const card = e.target.closest("[data-task]");
  if (card) detail(card.dataset.task);
});
$("#board").addEventListener("dragstart", e => {
  const c = e.target.closest("[data-task]");
  if (!c) return;
  e.dataTransfer.setData("text/plain", c.dataset.task);
  e.dataTransfer.effectAllowed = "move";
  c.classList.add("dragging");
});
$("#board").addEventListener("dragend", () => $$("#board .dragging, #board .drop-target").forEach(n => n.classList.remove("dragging", "drop-target")));
$("#board").addEventListener("dragover", e => {
  const col = e.target.closest("[data-column]");
  if (!col) return;
  e.preventDefault();
  $$("#board .drop-target").forEach(n => n !== col && n.classList.remove("drop-target"));
  col.classList.add("drop-target");
});
$("#board").addEventListener("drop", e => {
  const col = e.target.closest("[data-column]");
  if (!col) return;
  e.preventDefault();
  const t = state.tasks.find(x => String(x.id) === e.dataTransfer.getData("text/plain"));
  if (t && t.status !== col.dataset.column) { t.status = col.dataset.column; save(`Task moved to ${t.status}`, { kind: "task", action: "update", record: t }); }
  else renderBoard();
});
$("#list").addEventListener("click", e => {
  const c = e.target.closest("[data-task]");
  if (c) detail(c.dataset.task);
});
$("#milestones").addEventListener("click", e => {
  const edit = e.target.closest("[data-edit-ms]");
  if (edit) { milestoneForm(edit.dataset.editMs); return; }
  const del = e.target.closest("[data-del-ms]");
  if (del && confirm("Delete this milestone? Its tasks will be kept but unlinked.")) {
    const id = del.dataset.delMs;
    state.milestones = state.milestones.filter(m => m.id !== id);
    state.tasks.forEach(t => { if (t.milestoneId === id) t.milestoneId = ""; });
    save("Milestone deleted", { kind: "milestone", action: "delete", id });
  }
});

/* ---------- shell: theme, menu, shortcuts (same behaviour as the main CRM) ---------- */
function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  const toggle = $("#theme-toggle");
  toggle.textContent = selected === "dark" ? "☼" : "☾";
  toggle.setAttribute("aria-label", selected === "dark" ? "Switch to light theme" : "Switch to dark theme");
  toggle.title = selected === "dark" ? "Switch to light theme" : "Switch to dark theme";
}
try { applyTheme(localStorage.getItem(THEME_KEY) || "dark"); } catch { applyTheme("dark"); }
$("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* theme just won't persist */ }
  toast(`${next === "light" ? "Light" : "Dark"} theme enabled.`);
});
$("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#notifications-button").addEventListener("click", () => toast("You're all caught up. Notification delivery will be connected to the backend later."));
$("#profile-button").addEventListener("click", () => { let user = null; try { user = JSON.parse(localStorage.getItem("zymaCrmDemoUser") || "null"); } catch {} const name = user?.name || user?.email || "Unknown user"; const role = ({super_admin:"Super Admin",employee:"Employee",sales:"Sales & Client Relations",project_manager:"Project Manager",viewer:"Read-only"})[user?.role] || user?.role || "User"; toast(`Signed in as ${name} · ${role}.`); });
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#global-search").focus(); }
  if (e.key === "Escape") $("#sidebar").classList.remove("open");
});

/* ---------- keep in sync with the main CRM ---------- */
async function refresh() {
  const loaded = await loadApiState();
  if (!loaded) state = loadState();
  if (projectFilter !== "all" && !project(projectFilter)) { closeProject(); return; }
  if (inWorkspace()) {
    renderWorkspace();
    if (tab === "timeline") void loadProjectTimeline();
  } else renderPicker();
}
window.addEventListener("pageshow", () => { void refresh(); });
window.addEventListener("storage", e => {
  if (!apiMode && (e.key === CRM_KEY || e.key === MILESTONE_KEY)) refresh();
});

renderPicker();
void refresh();
// Deep-link into a specific project from the CRM project detail view.
try {
  const requestedProject = new URLSearchParams(window.location.search).get("project");
  if (requestedProject) {
    const match = state.projects.find(item => String(item.id) === requestedProject || String(item.code) === requestedProject);
    if (match && !isCompletedProject(match)) openProject(match.id);
  }
} catch { /* no query string support needed for the picker */ }
})();



// Keep task boards and progress metrics in sync with updates made elsewhere in CRM.
let taskRefreshInProgress = false;
async function refreshTaskPageFromApi() {
  if (!apiMode || taskRefreshInProgress || document.visibilityState === "hidden") return;
  taskRefreshInProgress = true;
  try {
    const selectedId = projectFilter;
    if (await loadApiState()) {
      projectFilter = selectedId === "all" || state.projects.some(p => p.id === selectedId) ? selectedId : "all";
      if (inWorkspace()) renderWorkspace(); else renderPicker();
    }
  } catch (error) {
    console.warn("Task page refresh failed; keeping the last successfully loaded data.", error);
  } finally {
    taskRefreshInProgress = false;
  }
}
window.setTimeout(() => window.location.reload(), 30 * 60 * 1000);
window.addEventListener("focus", refreshTaskPageFromApi);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshTaskPageFromApi();
});

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
