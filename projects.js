/* Zyma CRM — projects page, completed-project archive and the project profile.
 * Loaded after client-profile.js (it reuses the cp* helpers) and before app.js.
 * Everything runs lazily, after app.js has defined state, esc, initials, etc. */

const PJ_COMPLETED_KEY = "zyma-crm-project-completed-v1";
const pjIsDone = project => String(project.status || "").toLowerCase() === "completed";
const pjIsClosed = project => ["completed", "cancelled"].includes(String(project.status || "").toLowerCase());
const pjIso = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function pjReadCompleted() {
  try { return JSON.parse(localStorage.getItem(PJ_COMPLETED_KEY) || "{}") || {}; } catch { return {}; }
}
function pjWriteCompleted(map) {
  try { localStorage.setItem(PJ_COMPLETED_KEY, JSON.stringify(map)); } catch { /* storage unavailable: dates fall back to today */ }
}

/* A project that reaches "Completed" is stamped with a completion date and moves to the archive.
 * Reopening it clears the stamp and it returns to the active list. */
function syncProjectArchive() {
  const map = pjReadCompleted();
  let changed = false;
  (state.projects || []).forEach(project => {
    const id = String(project.id);
    if (pjIsDone(project)) {
      if (!map[id]) { map[id] = pjIso(); changed = true; }
      project.completedAt = map[id];
    } else if (map[id]) {
      delete map[id]; delete project.completedAt; changed = true;
    }
  });
  if (changed) pjWriteCompleted(map);
}

function pjTasks(project) {
  const id = String(project.sourceId ?? project.id ?? "");
  const name = cpNorm(project.name);
  return state.tasks.filter(task => (task.projectId && String(task.projectId) === id) || cpNorm(task.project) === name);
}
const pjTaskDone = task => task.done === true || ["done", "completed"].includes(cpNorm(task.status));

function pjHealth(project) {
  if (pjIsClosed(project)) return { key: "done", label: pjIsDone(project) ? "Completed" : "Cancelled" };
  if (cpNorm(project.status) === "on hold") return { key: "hold", label: "On hold" };
  const days = cpDaysFromToday(project.due);
  if (days !== null && days < 0) return { key: "late", label: `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue` };
  if (days !== null && days <= 7) return { key: "soon", label: days === 0 ? "Due today" : `Due in ${days} ${days === 1 ? "day" : "days"}` };
  return { key: "ok", label: days === null ? "No target date" : `${days} days left` };
}

function pjDuration(project) {
  const start = cpIsoDate(project.startDate) || cpIsoDate((project.createdAt || "").slice(0, 10));
  const end = cpIsoDate(project.completedAt);
  if (!start || !end) return "";
  const days = Math.max(0, Math.round((end - start) / 86400000));
  return days < 1 ? "Same day" : days < 60 ? `${days} days` : `${Math.round(days / 30)} months`;
}

function pjMono(project, extra = "") {
  return `<span class="cp-mono ${extra}" aria-hidden="true">${esc(initials(project.name || "?"))}</span>`;
}

/* ---------- Active project card ---------- */
function projectCardMarkup(project) {
  const hue = cpHue(project.client || project.name);
  const pct = calculatedProjectProgress(project);
  const tasks = pjTasks(project);
  const done = tasks.filter(pjTaskDone).length;
  const health = pjHealth(project);
  return `<article class="pj-card" style="--h:${hue}">
    <div class="pj-card-top">
      ${pjMono(project)}
      <span class="status-pill ${projectStatusClass(project.status)}">${esc(project.status || "Planning")}</span>
    </div>
    <h3 class="pj-card-name"><button type="button" class="cp-card-link" data-open-record="project" data-record-id="${esc(project.id)}">${esc(project.name)}</button></h3>
    <p class="pj-card-client">${esc(project.client || "No client")}${project.code ? ` <span>${esc(project.code)}</span>` : ""}</p>
    <div class="pj-progress">
      <div class="pj-progress-head"><strong>${pct}%</strong><span>${tasks.length ? `${done} of ${tasks.length} tasks done` : "No tasks yet"}</span></div>
      <div class="cp-bar"><span style="width:${pct}%"></span></div>
    </div>
    <dl class="pj-card-meta">
      <div><dt>Target date</dt><dd>${project.due ? esc(cpDate(project.due)) : "Not set"}</dd></div>
      <div><dt>Led by</dt><dd>${esc(project.manager || "Unassigned")}</dd></div>
    </dl>
    <div class="pj-card-foot">
      <span class="pj-health is-${health.key}"><i></i>${esc(health.label)}</span>
      <span class="cp-card-actions">${recordActionButtons("project", project.id)}</span>
    </div>
  </article>`;
}

/* ---------- Completed archive: one folder per year ---------- */
function pjArchiveMarkup(projects) {
  if (!projects.length) {
    return `<div class="pj-archive-empty"><span class="pj-folder-icon" aria-hidden="true"></span><h3>Nothing archived yet</h3><p>When a project's status is set to Completed it moves here automatically and stays as a record. You can reopen it any time.</p></div>`;
  }
  const byYear = new Map();
  [...projects].sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || ""))).forEach(project => {
    const year = (project.completedAt || "").slice(0, 4) || "Earlier";
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(project);
  });
  return `<div class="pj-archive-banner"><span class="pj-folder-icon" aria-hidden="true"></span><div><h3>Completed projects</h3><p>${projects.length} ${projects.length === 1 ? "project" : "projects"} archived. Open one to see its full history, or reopen it if work starts again.</p></div></div>
  ${[...byYear.entries()].map(([year, items], index) => `<details class="pj-folder" ${index === 0 ? "open" : ""}>
    <summary><span class="pj-folder-icon" aria-hidden="true"></span><strong>${esc(year)}</strong><small>${items.length} ${items.length === 1 ? "project" : "projects"}</small><span class="pj-chevron" aria-hidden="true"></span></summary>
    <div class="pj-folder-body">${items.map(project => {
      const duration = pjDuration(project);
      return `<div class="pj-archived" style="--h:${cpHue(project.client || project.name)}">
        ${pjMono(project)}
        <div class="pj-archived-main"><button type="button" class="pj-archived-name" data-open-record="project" data-record-id="${esc(project.id)}">${esc(project.name)}</button><small>${esc(project.client || "No client")}${project.code ? ` · ${esc(project.code)}` : ""}</small></div>
        <div class="pj-archived-when"><strong>${esc(cpDate(project.completedAt))}</strong><small>${duration ? `Delivered in ${esc(duration)}` : "Completed"}</small></div>
        <span class="pj-archived-actions"><button type="button" class="row-action-button" data-open-record="project" data-record-id="${esc(project.id)}">View</button><button type="button" class="row-action-button" data-reopen-project="${esc(project.id)}">Reopen</button></span>
      </div>`;
    }).join("")}</div>
  </details>`).join("")}`;
}

/* ---------- Page renderer (called from renderProjects in app.js) ---------- */
function renderProjectsPage() {
  const query = ($("#project-search")?.value || $("#global-search")?.value || "").trim().toLowerCase();
  const all = state.projects;
  const active = all.filter(project => !pjIsClosed(project));
  const archived = all.filter(pjIsDone);
  const set = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  const pad = value => String(value).padStart(2, "0");
  set("#project-total", pad(all.length));
  set("#pj-delivery", pad(active.filter(p => cpNorm(p.status) === "in progress").length));
  set("#pj-planning", pad(active.filter(p => cpNorm(p.status) === "planning").length));
  set("#pj-attention", pad(active.filter(p => ["late", "hold"].includes(pjHealth(p).key)).length));
  set("#pj-archived", pad(archived.length));
  set("#pj-count-all", pad(active.length));
  set("#pj-count-progress", pad(active.filter(p => cpNorm(p.status) === "in progress").length));
  set("#pj-count-planning", pad(active.filter(p => cpNorm(p.status) === "planning").length));
  set("#pj-count-hold", pad(active.filter(p => cpNorm(p.status) === "on hold").length));
  set("#pj-count-archive", pad(archived.length));

  const filter = state.projectFilter || "all";
  const matches = project => [project.name, project.client, project.code, project.manager].join(" ").toLowerCase().includes(query);
  const grid = $("#projects-grid"), archive = $("#projects-archive");
  if (!grid || !archive) return;
  const showArchive = filter === "Completed";
  grid.hidden = showArchive; archive.hidden = !showArchive;
  $$("#project-filters [data-filter]").forEach(button => button.classList.toggle("active", button.dataset.filter === filter));
  if (showArchive) {
    archive.innerHTML = pjArchiveMarkup(archived.filter(matches));
    return;
  }
  const visible = active.filter(project => (filter === "all" || project.status === filter) && matches(project));
  grid.innerHTML = visible.map(projectCardMarkup).join("") || `<div class="pj-empty"><span aria-hidden="true">▣</span><h3>${all.length ? "No projects match" : "No projects yet"}</h3><p>${all.length ? "Try another search or switch the filter." : "Add a client, then create their first project."}</p>${all.length ? "" : `<button type="button" class="button button-primary" data-action="new-project">＋ New project</button>`}</div>`;
}

/* ---------- Complete / reopen ---------- */
async function pjSetStatus(id, status) {
  const project = state.projects.find(item => String(item.id) === String(id));
  if (!project || project.status === status) return false;
  const previous = project.status;
  try {
    if (CLIENTS_API_ENABLED && project.apiBacked) await updateApiProject({ ...project, status });
    project.status = status;
    syncProjectArchive();
    const done = status === "Completed";
    state.activities.unshift({ icon: done ? "✓" : "↺", color: done ? "green" : "blue", text: `<strong>${done ? "Project completed and archived" : "Project reopened"}</strong> — ${esc(project.name)}`, by: currentActorName(), time: "Just now" });
    persistState(); renderAll();
    toast(done ? `${project.name} is complete and moved to the Completed archive.` : `${project.name} is back in ${status === "In progress" ? "progress" : status}.`);
    return true;
  } catch (error) {
    project.status = previous;
    toast(`Could not update the project. ${error.message || "Please try again."}`);
    return false;
  }
}

document.addEventListener("click", async event => {
  const complete = event.target.closest("[data-complete-project]");
  if (complete) {
    const project = state.projects.find(item => String(item.id) === complete.dataset.completeProject);
    if (!project || !window.confirm(`Mark "${project.name}" as completed? It will move to the Completed archive.`)) return;
    if (await pjSetStatus(project.id, "Completed")) { state.projectFilter = "Completed"; setView("projects"); renderProjectsPage(); }
    return;
  }
  const reopen = event.target.closest("[data-reopen-project]");
  if (reopen) {
    const target = state.projects.find(item => String(item.id) === reopen.dataset.reopenProject);
    if (!target || !window.confirm(`Reopen "${target.name}"? It will return to the active projects list.`)) return;
    if (await pjSetStatus(target.id, "In progress")) { state.projectFilter = "all"; if (state.activeView === "record-detail") refreshProjectProfile(); else renderProjectsPage(); }
  }
});

/* ---------- Project profile ---------- */
const PJ_STEPS = [
  { key: "Planning", hint: "Scope and plan agreed" },
  { key: "In progress", hint: "Build and delivery" },
  { key: "Completed", hint: "Delivered and archived" }
];

function pjStepper(project) {
  const status = String(project.status || "Planning");
  const hold = cpNorm(status) === "on hold";
  const current = hold ? 1 : Math.max(0, PJ_STEPS.findIndex(step => cpNorm(step.key) === cpNorm(status)));
  return `<ol class="pj-steps" aria-label="Project stage">${PJ_STEPS.map((step, index) => {
    const state_ = index < current || (index === current && status === "Completed") ? "done" : index === current ? (hold ? "hold" : "now") : "next";
    return `<li class="is-${state_}"><span class="pj-step-dot">${state_ === "done" ? "✓" : index + 1}</span><div><strong>${esc(index === 1 && hold ? "On hold" : step.key)}</strong><small>${esc(index === 1 && hold ? "Work paused" : step.hint)}</small></div></li>`;
  }).join("")}</ol>`;
}

function pjTaskRow(task) {
  const done = pjTaskDone(task);
  const days = done ? null : cpDaysFromToday(task.due);
  return `<button type="button" class="cp-project pj-task ${done ? "is-done" : ""}" data-open-record="task" data-record-id="${esc(task.id)}">
    <span class="pj-task-main"><span class="pj-task-check" aria-hidden="true">${done ? "✓" : ""}</span><span><strong>${esc(task.title)}</strong><small>${esc(task.assignee || "Unassigned")}${task.due && task.due !== "Not set" ? ` · Due ${esc(cpDate(task.due))}` : ""}</small></span></span>
    <span class="pj-task-end">${days !== null && days < 0 ? `<span class="cp-flag">${cpRelativeDays(days)}</span>` : ""}<span class="priority-pill ${priorityClass(task.priority)}">${esc(task.priority || "Medium")}</span><span class="status-pill ${done ? "status-done" : cpNorm(task.status) === "in progress" ? "status-progress" : "status-planning"}">${done ? "Done" : esc(task.status || "To do")}</span></span>
  </button>`;
}

function renderProjectProfile(project) {
  const hue = cpHue(project.client || project.name);
  const pct = calculatedProjectProgress(project);
  const tasks = pjTasks(project);
  const doneTasks = tasks.filter(pjTaskDone);
  const open = tasks.filter(task => !pjTaskDone(task));
  const health = pjHealth(project);
  const client = state.clients.find(item => String(item.id) === String(project.clientId) || cpNorm(item.name) === cpNorm(project.client));
  const people = client ? cpRelations(client).contacts : [];
  const archived = pjIsDone(project);
  const id = esc(project.id);
  const dueDays = cpDaysFromToday(project.due);
  const kpi = (value, label, hint = "") => `<div class="cp-kpi"><strong>${value}</strong><span>${label}</span>${hint ? `<small>${hint}</small>` : ""}</div>`;
  const tab = (key, label, count) => `<button type="button" role="tab" class="cp-tab${CP_STATE.tab === key ? " is-active" : ""}" id="cp-tab-${key}" aria-selected="${CP_STATE.tab === key}" aria-controls="cp-panel-${key}" tabindex="${CP_STATE.tab === key ? 0 : -1}" data-cp-tab="${key}">${label}${count === undefined ? "" : `<span>${count}</span>`}</button>`;
  const panel = (key, content) => `<div role="tabpanel" id="cp-panel-${key}" aria-labelledby="cp-tab-${key}" data-cp-panel="${key}" ${CP_STATE.tab === key ? "" : "hidden"}>${content}</div>`;
  const seeAll = (key, label) => `<button type="button" class="cp-inline-link" data-cp-tab="${key}">${label}</button>`;
  const description = project.description || project.scope;

  return `<div class="cp-profile pj-profile" style="--h:${hue}">
    <div class="cp-crumb"><button class="cp-back" type="button" data-back-to-list><span aria-hidden="true">←</span> All projects</button></div>
    <header class="cp-hero">
      <div class="cp-hero-banner" aria-hidden="true"></div>
      <div class="cp-hero-main">
        ${pjMono(project, "cp-mono-xl")}
        <div class="cp-hero-id">
          <h1>${esc(project.name)}</h1>
          <p>${client ? `<button type="button" class="cp-inline-link pj-client-link" data-open-record="client" data-record-id="${esc(client.id)}">${esc(client.name)}</button>` : esc(project.client || "No client")}${project.code ? ` · ${esc(project.code)}` : ""}</p>
          <div class="cp-hero-chips"><span class="status-pill ${projectStatusClass(project.status)}">${esc(project.status || "Planning")}</span><span class="pj-health is-${health.key}"><i></i>${esc(health.label)}</span>${archived ? `<span class="cp-chip">Archived ${esc(cpDate(project.completedAt))}</span>` : ""}</div>
        </div>
        <div class="cp-hero-actions">
          <button class="button button-secondary" type="button" data-edit-record="project" data-record-id="${id}">Edit project</button>
          ${archived
            ? `<button class="button button-primary" type="button" data-reopen-project="${id}">Reopen project</button>`
            : `<button class="button button-primary" type="button" data-complete-project="${id}">✓ Mark completed</button>`}
        </div>
      </div>
    </header>

    ${archived ? `<div class="pj-archived-note"><span class="pj-folder-icon" aria-hidden="true"></span><div><strong>This project is in the Completed archive</strong><small>Delivered ${pjDuration(project) ? `in ${esc(pjDuration(project))}` : ""} and finished on ${esc(cpDate(project.completedAt))}. Reopen it if more work comes in.</small></div></div>` : ""}

    <section class="pj-stepper-panel" aria-label="Stage">${pjStepper(project)}</section>

    <section class="cp-kpis" aria-label="Project summary">
      <div class="cp-kpi cp-kpi-ring">${cpRing(pct, 60, 6)}<div><span>Delivery</span><small>${tasks.length ? "From task completion" : "Set manually"}</small></div></div>
      ${kpi(`${doneTasks.length}<em>/${tasks.length}</em>`, "Tasks done", `${open.length} still open`)}
      ${kpi(project.due ? esc(cpDate(project.due)) : "Not set", "Target date", dueDays === null || archived ? "" : esc(cpRelativeDays(dueDays)))}
      ${kpi(esc(project.manager || "Unassigned"), "Project lead", "")}
      ${kpi(project.startDate ? esc(cpDate(project.startDate)) : "Not set", "Started", archived && pjDuration(project) ? `Took ${esc(pjDuration(project))}` : "")}
    </section>

    <div class="cp-tabs" role="tablist" aria-label="Project sections">
      ${tab("overview", "Overview")}${tab("tasks", "Tasks", tasks.length)}${tab("client", "Client & people", people.length)}
    </div>

    <div class="cp-layout">
      <div class="cp-main">
        ${panel("overview", `
          ${cpCard("Scope", description ? `<p class="pj-scope">${esc(description)}</p>${project.scope && project.description ? `<h3 class="pj-sub">Agreed deliverables</h3><p class="pj-scope">${esc(project.scope)}</p>` : ""}` : `<p class="cp-empty">No scope has been recorded. Edit the project to add the agreed deliverables.</p>`)}
          ${cpCard("Up next", open.length ? `<div class="cp-list">${open.slice(0, 4).map(pjTaskRow).join("")}</div>` : `<p class="cp-empty">${tasks.length ? "Every task is done." : "No tasks yet. Open the task board to plan the work."}</p>`, { action: open.length > 4 ? seeAll("tasks", "See all tasks") : "" })}
        `)}
        ${panel("tasks", cpCard("Tasks", tasks.length ? `<div class="cp-list">${[...tasks].sort((a, b) => Number(pjTaskDone(a)) - Number(pjTaskDone(b))).map(pjTaskRow).join("")}</div>` : `<p class="cp-empty">No tasks are linked to this project yet.</p>`, { action: `<a class="cp-inline-link" href="tasks.html?project=${encodeURIComponent(project.id)}">Open task board ↗</a>` }))}
        ${panel("client", cpCard("Client", client ? `<button type="button" class="cp-person" data-open-record="client" data-record-id="${esc(client.id)}"><span class="cp-avatar cp-avatar-lg">${esc(client.short || initials(client.name))}</span><span class="cp-person-main"><strong>${esc(client.name)}</strong><small>${esc(client.industry || "Industry not set")}</small></span><span class="cp-person-end">${cpStatusPill(client)}</span></button>` : `<p class="cp-empty">This project is not linked to a client record.</p>`) + cpCard("People at the client", people.length ? `<div class="cp-list">${people.map(cpPersonRow).join("")}</div>` : `<p class="cp-empty">No contacts are linked to this client yet.</p>`))}
      </div>
      <aside class="cp-side">
        ${cpCard("Details", `<dl class="cp-fields">
          ${cpField("Reference", project.code)}
          ${cpField("Client", project.client)}
          ${cpField("Status", project.status)}
          ${cpField("Project lead", project.manager)}
          ${cpField("Started", project.startDate ? cpDate(project.startDate) : "")}
          ${cpField("Target date", project.due ? cpDate(project.due) : "")}
          ${archived ? cpField("Completed", cpDate(project.completedAt)) : ""}
        </dl>`)}
        ${cpCard("Manage", `<div class="cp-manage"><a class="button button-secondary button-small" href="tasks.html?project=${encodeURIComponent(project.id)}">Tasks and milestones ↗</a><button class="button button-secondary button-small" type="button" data-edit-record="project" data-record-id="${id}">Edit details</button><button class="button button-secondary button-small cp-danger" type="button" data-delete-record="project" data-record-id="${id}">Delete project</button></div>`)}
      </aside>
    </div>
  </div>`;
}

function openProjectProfile(project, { resetTab = true } = {}) {
  if (resetTab) CP_STATE.tab = "overview";
  const view = $("#view-record-detail");
  view.dataset.recordType = "project";
  view.dataset.recordId = String(project.id);
  view.innerHTML = renderProjectProfile(project);
  view.classList.add("cp-view");
}

function refreshProjectProfile() {
  const view = $("#view-record-detail");
  if (!view || !view.classList.contains("active") || view.dataset.recordType !== "project") return;
  const project = state.projects.find(item => String(item.id) === view.dataset.recordId);
  if (project) openProjectProfile(project, { resetTab: false });
}
