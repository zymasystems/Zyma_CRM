/* Zyma CRM — dashboard.
 * Renders the whole dashboard from workspace state in one pass (called from renderAll).
 * Charts are plain HTML/SVG, so they follow the light and dark themes and need no library. */

const DX_DAY = 86400000;
const dxMoney = value => `R ${Math.round(Number(value) || 0).toLocaleString("en-ZA")}`;
const dxCompact = value => {
  const n = Number(value) || 0;
  if (n >= 1e6) return `R ${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}m`;
  if (n >= 1e3) return `R ${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `R ${Math.round(n)}`;
};
const dxStartOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dxIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dxDate = value => {
  if (!value || value === "Not set") return null;
  const parsed = parseDisplayDate(String(value).slice(0, 10)) || parseDisplayDate(value);
  return parsed && !Number.isNaN(parsed.getTime()) ? dxStartOfDay(parsed) : null;
};
const dxDays = (date, today) => Math.round((date - today) / DX_DAY);
const dxNiceDate = date => date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
const dxIsCompleted = project => String(project.status || "").toLowerCase() === "completed";
const dxTaskDone = task => task.done || ["done", "completed"].includes(String(task.status || "").toLowerCase());
const dxTaskDue = task => dxDate(task.dueDateUtc) || dxDate(task.due);

function dxWhen(days) {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/* ---------- derived data ---------- */
function dxCollect() {
  const today = dxStartOfDay(new Date());
  const activeProjects = state.projects.filter(project => !dxIsCompleted(project));
  const activeIds = new Set(activeProjects.map(project => String(project.id)));
  const activeNames = new Set(activeProjects.map(project => String(project.name).toLowerCase()));
  const inActiveProject = task => activeIds.has(String(task.projectId || "")) || (!task.projectId && activeNames.has(String(task.project || "").toLowerCase()));
  const openTasks = state.tasks.filter(task => inActiveProject(task) && !dxTaskDone(task));
  const doneTasks = state.tasks.filter(dxTaskDone);
  const overdueTasks = openTasks.filter(task => { const due = dxTaskDue(task); return due && due < today; });
  const openLeads = state.leads.filter(lead => !["Won", "Lost"].includes(lead.stage));
  const leadValue = lead => Number(lead.estimatedValue ?? lead.developmentFee ?? 0) || 0;
  const openMilestones = (state.milestones || []).filter(item => !["completed", "cancelled"].includes(String(item.status || "").toLowerCase()));
  return { today, activeProjects, openTasks, doneTasks, overdueTasks, openLeads, leadValue, openMilestones };
}

/* ---------- small building blocks ---------- */
function dxPanel({ title, sub, body, cls = "", action = "" }) {
  return `<section class="dx-panel ${cls}"><header class="dx-panel-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${action}</header>${body}</section>`;
}
const dxEmpty = text => `<p class="dx-empty">${esc(text)}</p>`;
const dxLegend = items => `<ul class="dx-legend">${items.map(item => `<li><i style="background:${item.color}"></i>${esc(item.name)}</li>`).join("")}</ul>`;
const dxTip = text => `data-dx-tip="${esc(text)}"`;

/* ---------- hero ---------- */
function dxHero(d) {
  const week = new Date(d.today.getTime() + 7 * DX_DAY);
  const followUps = d.openLeads.filter(lead => { const due = dxDate(lead.followUp); return due && due <= week; }).length;
  const bits = [];
  if (d.overdueTasks.length) bits.push(`<span><b class="is-bad">${d.overdueTasks.length}</b> overdue task${d.overdueTasks.length === 1 ? "" : "s"}</span>`);
  if (followUps) bits.push(`<span><b>${followUps}</b> lead follow-up${followUps === 1 ? "" : "s"} due this week</span>`);
  const dueSoon = d.openTasks.filter(task => { const due = dxTaskDue(task); return due && due >= d.today && due <= week; }).length;
  if (dueSoon) bits.push(`<span><b>${dueSoon}</b> task${dueSoon === 1 ? "" : "s"} due this week</span>`);
  const line = bits.length ? bits.join('<span class="dx-sep"></span>') : "Nothing urgent. A good moment to move a lead forward.";
  return `<div class="dx-hero">
    <div class="dx-hero-copy"><p class="eyebrow" id="dashboard-date"></p><h1 id="dashboard-greeting">Welcome to your workspace</h1><p class="dx-focus">${line}</p></div>
    <div class="heading-actions"><button class="button button-secondary" data-action="export">↧ <span>Export overview</span></button><button class="button button-primary" data-action="new-lead">+ <span>New lead</span></button></div>
  </div>`;
}

/* ---------- KPI strip ---------- */
function dxKpis(d) {
  const pipelineValue = d.openLeads.reduce((sum, lead) => sum + d.leadValue(lead), 0);
  const won = state.leads.filter(lead => lead.stage === "Won").length;
  const lost = state.leads.filter(lead => lead.stage === "Lost").length;
  const closed = won + lost;
  const winRate = closed ? Math.round(won / closed * 100) : null;
  const totalTasks = d.openTasks.length + d.doneTasks.length;
  const completion = totalTasks ? Math.round(d.doneTasks.length / totalTasks * 100) : 0;
  const tiles = [
    { label: "Pipeline value", value: dxCompact(pipelineValue), raw: true, note: `${d.openLeads.length} open lead${d.openLeads.length === 1 ? "" : "s"}`, view: "leads", tone: "orange" },
    { label: "Win rate", value: winRate == null ? "—" : `${winRate}`, suffix: winRate == null ? "" : "%", raw: winRate == null, note: closed ? `${won} won · ${lost} lost` : "No closed leads yet", view: "leads", tone: "green" },
    { label: "Active projects", value: d.activeProjects.length, note: `${state.clients.length} client${state.clients.length === 1 ? "" : "s"}`, view: "projects", tone: "blue" },
    { label: "Task completion", value: completion, suffix: "%", note: `${d.doneTasks.length} of ${totalTasks} done`, view: "tasks", tone: "violet" },
    { label: "Overdue", value: d.overdueTasks.length, note: d.overdueTasks.length ? "Needs attention" : "All on track", view: "tasks", tone: d.overdueTasks.length ? "red" : "green", attention: d.overdueTasks.length > 0 }
  ];
  return `<div class="dx-kpis">${tiles.map(tile => `<button type="button" class="dx-kpi dx-${tile.tone}${tile.attention ? " is-attention" : ""}" data-view-link="${tile.view}">
      <span class="dx-kpi-label">${esc(tile.label)}</span>
      <strong class="dx-kpi-value">${esc(tile.value)}${tile.suffix || ""}</strong>
      <small>${esc(tile.note)}</small>
    </button>`).join("")}</div>`;
}

/* ---------- pipeline funnel (one hue, light to dark = progress) ---------- */
function dxPipeline(d) {
  const stages = LEAD_FLOW.filter(stage => stage.key !== "Lost");
  const rows = stages.map(stage => {
    const leads = state.leads.filter(lead => lead.stage === stage.key);
    return { stage, count: leads.length, value: leads.reduce((sum, lead) => sum + d.leadValue(lead), 0) };
  });
  const max = Math.max(1, ...rows.map(row => row.count));
  const lost = state.leads.filter(lead => lead.stage === "Lost").length;
  const shades = [0.5, 0.64, 0.78, 0.9, 1];
  const body = state.leads.length ? `<div class="dx-funnel">${rows.map((row, i) => `
      <button type="button" class="dx-funnel-row" data-view-link="leads" ${dxTip(`${row.stage.label}: ${row.count} lead${row.count === 1 ? "" : "s"} · ${dxMoney(row.value)}`)}>
        <span class="dx-funnel-name">${esc(row.stage.label)}</span>
        <span class="dx-funnel-track"><span class="dx-funnel-bar${row.stage.key === "Won" ? " is-won" : ""}" style="--w:${Math.max(row.count ? 4 : 0, row.count / max * 100)}%;--a:${shades[i]}"></span></span>
        <span class="dx-funnel-num"><b>${row.count}</b><small>${row.value ? dxCompact(row.value) : "—"}</small></span>
      </button>`).join("")}</div>
      <p class="dx-foot">${lost ? `${lost} lead${lost === 1 ? "" : "s"} lost so far.` : "No leads lost."} Values use each lead's estimated or development fee.</p>`
    : dxEmpty("No leads yet. Add your first lead to see the pipeline fill up.");
  return dxPanel({ title: "Sales pipeline", sub: "Leads and their value at each step", body, cls: "dx-span-7", action: `<button class="text-link" data-view-link="leads">Open leads <span>↗</span></button>` });
}

/* ---------- what is due: weekly load chart (stacked by kind) ---------- */
const DX_KINDS = [{ key: "task", name: "Tasks", color: "var(--dx-1)" }, { key: "milestone", name: "Milestones", color: "var(--dx-4)" }, { key: "project", name: "Project deadlines", color: "var(--dx-2)" }];
function dxDueLoad(d) {
  const weeks = 6;
  const startOfWeek = new Date(d.today.getTime() - ((d.today.getDay() + 6) % 7) * DX_DAY);
  const buckets = Array.from({ length: weeks + 1 }, (_, i) => ({ label: i === 0 ? "Overdue" : i === 1 ? "This week" : `+${i - 1}w`, range: i === 0 ? "Before today" : `${dxNiceDate(new Date(startOfWeek.getTime() + (i - 1) * 7 * DX_DAY))} – ${dxNiceDate(new Date(startOfWeek.getTime() + (i * 7 - 1) * DX_DAY))}`, task: 0, milestone: 0, project: 0 }));
  const place = (date, kind) => {
    if (!date) return;
    const index = date < d.today ? 0 : Math.floor((date - startOfWeek) / (7 * DX_DAY)) + 1;
    if (index >= 0 && index <= weeks) buckets[index][kind]++;
  };
  d.openTasks.forEach(task => place(dxTaskDue(task), "task"));
  d.openMilestones.forEach(item => place(dxDate(item.due), "milestone"));
  d.activeProjects.forEach(project => place(dxDate(project.due), "project"));
  const totals = buckets.map(bucket => bucket.task + bucket.milestone + bucket.project);
  const sum = totals.reduce((a, b) => a + b, 0);
  if (!sum) return dxPanel({ title: "What's coming up", sub: "Deadlines over the next six weeks", body: dxEmpty("No deadlines set yet. Add due dates to tasks and projects to see the load ahead."), cls: "dx-span-5" });
  const W = 420, H = 210, left = 30, right = 8, top = 12, bottom = 34;
  const max = Math.max(4, ...totals);
  const niceMax = Math.ceil(max / 2) * 2;
  const slot = (W - left - right) / buckets.length, barW = Math.min(34, slot * 0.62);
  const y = v => top + (H - top - bottom) * (1 - v / niceMax);
  const grid = [0, niceMax / 2, niceMax].map(v => `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="dx-grid"/><text x="${left - 6}" y="${y(v) + 3.5}" text-anchor="end" class="dx-axis">${v}</text>`).join("");
  const cols = buckets.map((bucket, i) => {
    const cx = left + slot * i + slot / 2;
    let acc = 0;
    const segs = DX_KINDS.map(kind => {
      const v = bucket[kind.key]; if (!v) return "";
      const y1 = y(acc + v), y0 = y(acc); acc += v;
      return `<rect x="${cx - barW / 2}" y="${y1}" width="${barW}" height="${Math.max(2, y0 - y1 - 2)}" rx="3" fill="${kind.color}"/>`;
    }).join("");
    const tip = `${bucket.label} (${bucket.range}): ${totals[i]} due` + DX_KINDS.filter(k => bucket[k.key]).map(k => ` · ${bucket[k.key]} ${k.name.toLowerCase()}`).join("");
    return `<g class="dx-col${i === 0 ? " is-overdue" : ""}" ${dxTip(tip)} tabindex="0" role="img" aria-label="${esc(tip)}"><rect x="${cx - slot / 2}" y="${top}" width="${slot}" height="${H - top - bottom}" class="dx-hit"/>${segs}${totals[i] ? `<text x="${cx}" y="${y(totals[i]) - 5}" text-anchor="middle" class="dx-val">${totals[i]}</text>` : ""}<text x="${cx}" y="${H - 12}" text-anchor="middle" class="dx-axis${i === 0 ? " is-bad" : ""}">${bucket.label}</text></g>`;
  }).join("");
  const body = `<svg class="dx-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="Deadlines per week">${grid}${cols}</svg>${dxLegend(DX_KINDS)}`;
  return dxPanel({ title: "What's coming up", sub: "Deadlines over the next six weeks", body, cls: "dx-span-5" });
}

/* ---------- task health donut ---------- */
function dxTaskDonut(d) {
  const total = d.openTasks.length + d.doneTasks.length;
  const inProgress = d.openTasks.filter(task => ["In progress", "In review"].includes(task.status)).length;
  const items = [
    { name: "To do", value: d.openTasks.length - inProgress, color: "var(--dx-1)" },
    { name: "In progress", value: inProgress, color: "var(--dx-2)" },
    { name: "Done", value: d.doneTasks.length, color: "var(--dx-3)" }
  ];
  if (!total) return dxPanel({ title: "Task health", sub: "Where work stands", body: dxEmpty("No tasks yet. Create a project and add its first task."), cls: "dx-span-4" });
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = items.filter(item => item.value).map(item => {
    const len = item.value / total * C, gap = items.filter(i => i.value).length > 1 ? 3 : 0;
    const arc = `<circle class="dx-arc" cx="70" cy="70" r="${R}" fill="none" stroke="${item.color}" stroke-width="14" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)" ${dxTip(`${item.name}: ${item.value} (${Math.round(item.value / total * 100)}%)`)}/>`;
    offset += len; return arc;
  }).join("");
  const pct = Math.round(d.doneTasks.length / total * 100);
  const body = `<div class="dx-donut"><svg viewBox="0 0 140 140" role="img" aria-label="${pct}% of tasks done"><circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--border-soft)" stroke-width="14"/>${arcs}<text x="70" y="68" text-anchor="middle" class="dx-donut-num">${pct}%</text><text x="70" y="86" text-anchor="middle" class="dx-axis">done</text></svg>
    <ul class="dx-donut-list">${items.map(item => `<li><i style="background:${item.color}"></i><span>${item.name}</span><b>${item.value}</b></li>`).join("")}</ul></div>`;
  return dxPanel({ title: "Task health", sub: "Where work stands", body, cls: "dx-span-4" });
}

/* ---------- workload by person ---------- */
function dxWorkload(d) {
  const map = new Map();
  state.tasks.forEach(task => {
    if (!dxTaskDone(task) && !d.openTasks.includes(task)) return;
    const name = task.assignee && task.assignee !== "Unassigned" ? task.assignee : "Unassigned";
    const row = map.get(name) || { name, open: 0, done: 0 };
    dxTaskDone(task) ? row.done++ : row.open++;
    map.set(name, row);
  });
  const rows = [...map.values()].sort((a, b) => (b.open + b.done) - (a.open + a.done)).slice(0, 6);
  if (!rows.length) return dxPanel({ title: "Team workload", sub: "Open and finished tasks per person", body: dxEmpty("Assign tasks to teammates to see who is carrying what."), cls: "dx-span-4" });
  const max = Math.max(1, ...rows.map(row => row.open + row.done));
  const body = `<div class="dx-people">${rows.map(row => `<div class="dx-person" ${dxTip(`${row.name}: ${row.open} open, ${row.done} done`)}>
      <span class="dx-person-name" title="${esc(row.name)}">${esc(row.name)}</span>
      <span class="dx-stack" style="--t:${(row.open + row.done) / max * 100}%"><i class="is-open" style="flex:${row.open}"></i><i class="is-done" style="flex:${row.done}"></i></span>
      <b>${row.open}</b>
    </div>`).join("")}</div>${dxLegend([{ name: "Open", color: "var(--dx-2)" }, { name: "Done", color: "var(--dx-3)" }])}`;
  return dxPanel({ title: "Team workload", sub: "Open and finished tasks per person", body, cls: "dx-span-4" });
}

/* ---------- clients by industry ---------- */
function dxIndustry() {
  const counts = new Map();
  state.clients.forEach(client => { const key = client.industry && client.industry !== "Not specified" ? client.industry : "Not specified"; counts.set(key, (counts.get(key) || 0) + 1); });
  let rows = [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (rows.length > 5) { const rest = rows.slice(4).reduce((s, r) => s + r.value, 0); rows = [...rows.slice(0, 4), { name: "Other", value: rest }]; }
  if (!rows.length) return dxPanel({ title: "Client mix", sub: "Clients by industry", body: dxEmpty("Add clients to see which industries you serve."), cls: "dx-span-4" });
  const max = Math.max(...rows.map(row => row.value));
  const body = `<div class="dx-bars">${rows.map(row => `<div class="dx-bar-row" ${dxTip(`${row.name}: ${row.value} client${row.value === 1 ? "" : "s"}`)}><span title="${esc(row.name)}">${esc(row.name)}</span><span class="dx-bar-track"><i style="--w:${row.value / max * 100}%"></i></span><b>${row.value}</b></div>`).join("")}</div>`;
  return dxPanel({ title: "Client mix", sub: "Clients by industry", body, cls: "dx-span-4" });
}

/* ---------- needs attention ---------- */
function dxAttention(d) {
  const items = [];
  d.overdueTasks.forEach(task => { const due = dxTaskDue(task); items.push({ days: dxDays(due, d.today), kind: "Task", title: task.title, meta: task.project, open: ["task", task.id] }); });
  d.activeProjects.forEach(project => { const due = dxDate(project.due); if (due && due < d.today) items.push({ days: dxDays(due, d.today), kind: "Project", title: project.name, meta: project.client, open: ["project", project.id] }); });
  d.openLeads.forEach(lead => { const due = dxDate(lead.followUp); if (due && due <= new Date(d.today.getTime() + 3 * DX_DAY)) items.push({ days: dxDays(due, d.today), kind: "Follow-up", title: lead.company, meta: leadStageLabel(lead.stage), open: ["lead", lead.id] }); });
  items.sort((a, b) => a.days - b.days);
  const shown = items.slice(0, 6);
  const body = shown.length ? `<ul class="dx-list">${shown.map(item => `<li><button type="button" class="dx-row" data-open-record="${item.open[0]}" data-record-id="${esc(item.open[1])}">
      <span class="dx-chip ${item.days < 0 ? "is-bad" : item.days === 0 ? "is-warn" : ""}">${esc(item.kind)}</span>
      <span class="dx-row-main"><strong>${esc(item.title)}</strong><small>${esc(item.meta || "")}</small></span>
      <span class="dx-row-end ${item.days < 0 ? "is-bad" : ""}">${dxWhen(item.days)}</span></button></li>`).join("")}</ul>${items.length > shown.length ? `<p class="dx-foot">+ ${items.length - shown.length} more</p>` : ""}`
    : `<div class="dx-clear"><span>✓</span><p><strong>You're all caught up</strong>No overdue work and no follow-ups due in the next three days.</p></div>`;
  return dxPanel({ title: "Needs attention", sub: "Overdue work and follow-ups that are due", body, cls: "dx-span-6" });
}

/* ---------- projects ---------- */
function dxProjects(d) {
  const list = d.activeProjects.map(project => ({ project, progress: calculatedProjectProgress(project), due: dxDate(project.due) }))
    .sort((a, b) => (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity)).slice(0, 5);
  const body = list.length ? `<ul class="dx-list">${list.map(({ project, progress, due }) => {
    const days = due ? dxDays(due, d.today) : null;
    const hue = typeof cpHue === "function" ? cpHue(project.client || project.name) : 25;
    return `<li><button type="button" class="dx-row" data-open-record="project" data-record-id="${esc(project.id)}" ${dxTip(`${project.name}: ${progress}% complete`)}>
      <span class="dx-ring" style="--p:${progress};--h:${hue}"><b>${progress}</b></span>
      <span class="dx-row-main"><strong>${esc(project.name)}</strong><small>${esc(project.client)}</small></span>
      <span class="dx-row-end ${days != null && days < 0 ? "is-bad" : ""}">${due ? dxWhen(days).replace("Due ", "") : "No deadline"}</span></button></li>`;
  }).join("")}</ul>` : dxEmpty("No active projects. Add a client, then create the first project.");
  return dxPanel({ title: "Projects in delivery", sub: "Closest deadline first", body, cls: "dx-span-6", action: `<button class="text-link" data-view-link="projects">All projects <span>↗</span></button>` });
}

/* ---------- activity ---------- */
function dxActivity() {
  const items = (state.activities || []).slice(0, 6);
  const body = items.length ? `<ul class="dx-feed">${items.map(item => `<li><span class="dx-dot ${esc(item.color || "")}">${esc(item.icon || "•")}</span><div><p>${item.text}</p><small>${esc(item.by || "")}${item.time ? ` · ${esc(item.time)}` : ""}</small></div></li>`).join("")}</ul>`
    : dxEmpty("No activity yet. Updates appear here as you work.");
  return dxPanel({ title: "Recent activity", sub: "Latest changes in the workspace", body, cls: "dx-span-6" });
}

/* ---------- finished work ---------- */
function dxCompleted() {
  const done = state.projects.filter(dxIsCompleted);
  const body = done.length ? `<ul class="dx-list">${done.slice(0, 4).map(project => `<li><button type="button" class="dx-row" data-open-record="project" data-record-id="${esc(project.id)}">
      <span class="dx-check">✓</span><span class="dx-row-main"><strong>${esc(project.name)}</strong><small>${esc(project.client || "Client not recorded")}</small></span><span class="dx-row-end">View</span></button></li>`).join("")}</ul>`
    : dxEmpty("Completed projects move to the archive and show up here.");
  return dxPanel({ title: "Delivered", sub: `${done.length} project${done.length === 1 ? "" : "s"} in the archive`, body, cls: "dx-span-6", action: `<button class="text-link" data-view-link="projects">Open archive <span>↗</span></button>` });
}

/* ---------- main render ---------- */
function renderDashboard() {
  const root = document.getElementById("dash-root");
  if (!root) return;
  const d = dxCollect();
  const html = [dxHero(d), dxKpis(d), `<div class="dx-grid-wrap">`, dxPipeline(d), dxDueLoad(d), dxAttention(d), dxProjects(d), dxTaskDonut(d), dxWorkload(d), dxIndustry(), dxActivity(), dxCompleted(), `</div>`,
    `<p class="demo-note" id="dx-note" ${window.ZymaCrmApi && typeof LEADS_API_ENABLED !== "undefined" && LEADS_API_ENABLED ? "hidden" : ""}><span>ⓘ</span> Workspace records are currently stored in this browser. Shared storage will be connected through the Zyma API.</p>`].join("");
  /* Skip the DOM swap when nothing changed, so background refreshes never flicker. */
  if (root.dataset.sig === html) return;
  root.dataset.sig = html;
  root.innerHTML = html;
  if (typeof renderDashboardCharts === "function") renderDashboardCharts(); /* fills the greeting and date */
}

/* ---------- tooltip (one shared element) ---------- */
(() => {
  let tip;
  const ensure = () => tip || (tip = Object.assign(document.body.appendChild(document.createElement("div")), { className: "dx-tooltip", role: "tooltip" }));
  const show = (target, x, y) => {
    const el = ensure(); el.textContent = target.getAttribute("data-dx-tip"); el.classList.add("is-on");
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2))}px`;
    el.style.top = `${y - h - 12 < 8 ? y + 18 : y - h - 12}px`;
  };
  const hide = () => tip && tip.classList.remove("is-on");
  document.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    const target = event.target.closest?.("[data-dx-tip]");
    target ? show(target, event.clientX, event.clientY) : hide();
  });
  document.addEventListener("focusin", event => { const t = event.target.closest?.("[data-dx-tip]"); if (t) { const r = t.getBoundingClientRect(); show(t, r.left + r.width / 2, r.top); } });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch") return;
    const target = event.target.closest?.("[data-dx-tip]");
    target ? (show(target, event.clientX, event.clientY), setTimeout(hide, 2200)) : hide();
  });
  window.addEventListener("scroll", hide, { passive: true });
})();
