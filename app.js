"use strict";

const state = {
  activeView: "dashboard",
  leadFilter: "all",
  projectFilter: "all",
  taskFilter: "all",
  leads: [
    { id: 1, company: "Northstar Logistics", contact: "Thabo Mokoena", service: "Operations dashboard", stage: "Discovery", owner: "Khutjo M.", followUp: "16 Oct 2026", initials: "NL", color: "blue" },
    { id: 2, company: "GreenLeaf Properties", contact: "Lerato Nkosi", service: "Website development", stage: "New", owner: "Khutjo M.", followUp: "17 Oct 2026", initials: "GP", color: "green" },
    { id: 3, company: "Solvix Retail", contact: "Musa Dlamini", service: "Inventory management", stage: "Proposal", owner: "Princess T.", followUp: "18 Oct 2026", initials: "SR", color: "violet" },
    { id: 4, company: "Urban Build Co", contact: "Nandi Khumalo", service: "Workflow automation", stage: "Negotiation", owner: "Khutjo M.", followUp: "19 Oct 2026", initials: "UB", color: "orange" },
    { id: 5, company: "BrightPath Education", contact: "Sipho Molefe", service: "Learning management system", stage: "Discovery", owner: "Mashaole L.", followUp: "20 Oct 2026", initials: "BE", color: "blue" },
    { id: 6, company: "Medix Health", contact: "Palesa Radebe", service: "Client portal", stage: "Proposal", owner: "Princess T.", followUp: "21 Oct 2026", initials: "MH", color: "green" },
    { id: 7, company: "Peak Fitness", contact: "Kabelo Ndlovu", service: "Booking platform", stage: "New", owner: "Khutjo M.", followUp: "22 Oct 2026", initials: "PF", color: "orange" },
    { id: 8, company: "Coastal Stays", contact: "Zanele Jacobs", service: "Booking system", stage: "Won", owner: "Mashaole L.", followUp: "—", initials: "CS", color: "violet" }
  ],
  clients: [
    { id: 1, name: "For His Grace Ministries", short: "FH", industry: "Church & NPO", email: "admin@hisgraceministries.co.za", contact: "Church administration", status: "Active", projects: 1, since: "Oct 2026", color: "violet" },
    { id: 2, name: "Marcus Logistics", short: "ML", industry: "Transport & Logistics", email: "info@logisticsmarcus.co.za", contact: "Operations team", status: "Active", projects: 1, since: "Aug 2026", color: "blue" },
    { id: 3, name: "Lux Energy Solutions", short: "LE", industry: "Energy", email: "info@luxenergy.co.za", contact: "Business management", status: "Active", projects: 1, since: "Jul 2026", color: "orange" },
    { id: 4, name: "Pizza Chef", short: "PC", industry: "Food & Hospitality", email: "hello@pizzachef.co.za", contact: "Business owner", status: "Active", projects: 0, since: "Sep 2026", color: "green" }
  ],
  contacts: [
    { name: "FHGM Administration", organization: "For His Grace Ministries", email: "admin@hisgraceministries.co.za", phone: "—", relationship: "Client contact" },
    { name: "Marcus Operations", organization: "Marcus Logistics", email: "info@logisticsmarcus.co.za", phone: "+27 67 508 2810", relationship: "Project contact" },
    { name: "Lux Energy Team", organization: "Lux Energy Solutions", email: "info@luxenergy.co.za", phone: "—", relationship: "Client contact" },
    { name: "Pizza Chef Owner", organization: "Pizza Chef", email: "hello@pizzachef.co.za", phone: "—", relationship: "Decision maker" }
  ],
  projects: [
    { id: 1, code: "ZS-026", name: "FHGM Church Website", client: "For His Grace Ministries", status: "In progress", progress: 78, due: "28 Oct 2026", manager: "Khutjo M.", color: "violet" },
    { id: 2, code: "ZS-024", name: "Marcus Booking Platform", client: "Marcus Logistics", status: "In progress", progress: 64, due: "04 Nov 2026", manager: "Mashaole L.", color: "blue" },
    { id: 3, code: "ZS-021", name: "Lux Energy Website", client: "Lux Energy Solutions", status: "Planning", progress: 18, due: "12 Nov 2026", manager: "Princess T.", color: "orange" }
  ],
  tasks: [
    { id: 1, title: "Review mobile navigation", project: "FHGM Church Website", assignee: "Khutjo M.", priority: "High", status: "In progress", due: "Today", done: false },
    { id: 2, title: "Validate booking confirmation flow", project: "Marcus Booking Platform", assignee: "Mashaole L.", priority: "High", status: "To do", due: "16 Oct", done: false },
    { id: 3, title: "Prepare client progress update", project: "FHGM Church Website", assignee: "Khutjo M.", priority: "Medium", status: "To do", due: "16 Oct", done: false },
    { id: 4, title: "Confirm homepage content", project: "Lux Energy Website", assignee: "Princess T.", priority: "Medium", status: "In progress", due: "17 Oct", done: false },
    { id: 5, title: "Document deployment checklist", project: "Marcus Booking Platform", assignee: "Mashaole L.", priority: "Low", status: "To do", due: "20 Oct", done: false }
  ],
  activities: [
    { icon: "↗", color: "orange", text: "<strong>Project progress updated</strong> — FHGM Church Website", by: "Khutjo Mamabolo", time: "35 minutes ago" },
    { icon: "＋", color: "blue", text: "<strong>New lead added</strong> — Northstar Logistics", by: "Khutjo Mamabolo", time: "2 hours ago" },
    { icon: "✓", color: "green", text: "<strong>Client record reviewed</strong> — Marcus Logistics", by: "Princess Tshite", time: "Yesterday" },
    { icon: "▣", color: "violet", text: "<strong>Project created</strong> — Lux Energy Website", by: "Princess Tshite", time: "Yesterday" }
  ]
};

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
  return ({ New: "status-planning", Discovery: "status-progress", Proposal: "status-planning", Negotiation: "status-hold", Won: "status-done", Lost: "status-hold" })[stage] || "status-planning";
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
function updateMetrics() {
  const openLeads = state.leads.filter(lead => !["Won", "Lost"].includes(lead.stage)).length;
  const openTasks = state.tasks.filter(task => !task.done).length;
  $("#metric-clients").textContent = String(state.clients.length).padStart(2, "0");
  $("#metric-projects").textContent = String(state.projects.filter(project => project.status !== "Completed").length).padStart(2, "0");
  $("#metric-leads").textContent = String(openLeads).padStart(2, "0");
  $("#metric-tasks").textContent = String(openTasks).padStart(2, "0");
  $("#lead-nav-count").textContent = openLeads;
  $("#task-nav-count").textContent = openTasks;
  $("#lead-total").textContent = String(openLeads).padStart(2, "0");
  $("#lead-discovery").textContent = String(state.leads.filter(lead => lead.stage === "Discovery").length).padStart(2, "0");
  $("#lead-proposal").textContent = String(state.leads.filter(lead => lead.stage === "Proposal").length).padStart(2, "0");
  $("#lead-won").textContent = String(state.leads.filter(lead => lead.stage === "Won").length).padStart(2, "0");
  $("#all-lead-count").textContent = state.leads.length;
  $("#lead-table-count").textContent = `Showing ${state.leads.length} leads`;
  $("#client-total").textContent = String(state.clients.length).padStart(2, "0");
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
      <div class="progress-track"><div class="progress-fill ${project.progress >= 70 ? "green" : "blue"}" style="width:${Math.max(0, Math.min(100, project.progress))}%"></div></div>
      <span class="progress-label">${project.progress}%</span>
    </div>`).join("") || `<p class="muted">No projects yet.</p>`;
}

function renderDashboardTasks() {
  $("#dashboard-tasks").innerHTML = state.tasks.filter(task => !task.done).slice(0, 4).map(task => `
    <div class="task-row">
      <input class="task-check" type="checkbox" data-complete-task="${task.id}" aria-label="Mark ${esc(task.title)} complete">
      <div class="task-info"><strong>${esc(task.title)}</strong><small>${esc(task.project)} · ${esc(task.due)}</small></div>
      <span class="priority-pill ${priorityClass(task.priority)}">${esc(task.priority)}</span>
    </div>`).join("") || `<p class="muted">All caught up. No open tasks.</p>`;
}

function renderActivity() {
  $("#dashboard-activity").innerHTML = state.activities.slice(0, 5).map(activity => `
    <div class="activity-item">
      <span class="activity-icon ${esc(activity.color)}">${esc(activity.icon)}</span>
      <div class="activity-copy"><p>${activity.text}</p><small>${esc(activity.by)} · ${esc(activity.time)}</small></div>
    </div>`).join("");
}

function renderPipeline() {
  const stages = [
    { name: "New", color: "#6aa9ff", hint: "Just added" },
    { name: "Discovery", color: "#b09aff", hint: "Qualifying" },
    { name: "Proposal", color: "#f28b35", hint: "Awaiting reply" },
    { name: "Negotiation", color: "#52c69a", hint: "In discussion" }
  ];
  $("#pipeline-summary").innerHTML = stages.map(stage => {
    const count = state.leads.filter(lead => lead.stage === stage.name).length;
    return `<div class="pipeline-stage" style="--stage-color:${stage.color}"><small>${stage.name}</small><strong>${count}</strong><span>${stage.hint}</span></div>`;
  }).join("");
}

function renderLeads() {
  const query = ($("#lead-search")?.value || $("#global-search").value || "").trim().toLowerCase();
  const filtered = state.leads.filter(lead => {
    const stageMatch = state.leadFilter === "all" || lead.stage === state.leadFilter;
    const queryMatch = [lead.company, lead.contact, lead.service, lead.owner, lead.stage].join(" ").toLowerCase().includes(query);
    return stageMatch && queryMatch;
  });
  $("#leads-table").innerHTML = filtered.map(lead => `
    <tr>
      <td><div class="table-primary">${companyMark(lead.initials, lead.color)}<div><strong>${esc(lead.company)}</strong><small>${esc(lead.contact)}</small></div></div></td>
      <td>${esc(lead.service)}</td>
      <td><span class="status-pill ${stageClass(lead.stage)}">${esc(lead.stage)}</span></td>
      <td>${esc(lead.owner)}</td><td>${esc(lead.followUp)}</td>
      <td><button class="row-actions" data-lead-menu="${lead.id}" aria-label="Lead actions">···</button></td>
    </tr>`).join("") || `<tr><td colspan="6">No leads match this search.</td></tr>`;
}

function renderClients() {
  const query = ($("#client-search")?.value || "").trim().toLowerCase();
  const filtered = state.clients.filter(client => [client.name, client.industry, client.email, client.status].join(" ").toLowerCase().includes(query));
  $("#client-grid").innerHTML = filtered.map(client => `
    <article class="client-card">
      <div class="client-card-head">
        ${companyMark(client.short, client.color)}
        <div><h3>${esc(client.name)}</h3><p>${esc(client.industry)}</p></div>
        <span class="status-pill ${client.status === "Active" ? "status-done" : "status-hold"}">${esc(client.status)}</span>
      </div>
      <p style="margin-top:13px">${esc(client.email)}</p>
      <div class="client-card-stats"><span><strong>${client.projects}</strong>Projects</span><span><strong>${esc(client.since)}</strong>Client since</span></div>
    </article>`).join("") || `<p class="muted">No clients match this search.</p>`;
}

function renderContacts() {
  const query = ($("#contact-search")?.value || "").trim().toLowerCase();
  const filtered = state.contacts.filter(contact => [contact.name, contact.organization, contact.email, contact.phone].join(" ").toLowerCase().includes(query));
  $("#contacts-table").innerHTML = filtered.map(contact => `
    <tr><td><div class="table-primary"><span class="company-mark">${esc(initials(contact.name))}</span><div><strong>${esc(contact.name)}</strong><small>${esc(contact.relationship)}</small></div></div></td><td>${esc(contact.organization)}</td><td>${esc(contact.email)}</td><td>${esc(contact.phone)}</td><td>${esc(contact.relationship)}</td><td><button class="row-actions" aria-label="Contact actions">···</button></td></tr>`).join("") || `<tr><td colspan="6">No contacts found.</td></tr>`;
}

function renderProjects() {
  const query = ($("#project-search")?.value || "").trim().toLowerCase();
  const filtered = state.projects.filter(project => {
    const statusMatch = state.projectFilter === "all" || project.status === state.projectFilter;
    return statusMatch && [project.name, project.client, project.code, project.manager].join(" ").toLowerCase().includes(query);
  });
  $("#projects-table").innerHTML = filtered.map(project => `
    <tr><td><div class="table-primary">${companyMark(initials(project.name), project.color)}<div><strong>${esc(project.name)}</strong><small>${esc(project.code)}</small></div></div></td><td>${esc(project.client)}</td><td><span class="status-pill ${projectStatusClass(project.status)}">${esc(project.status)}</span></td><td><div style="display:flex;align-items:center;gap:9px;min-width:105px"><div class="progress-track" style="flex:1"><div class="progress-fill ${project.progress >= 70 ? "green" : "blue"}" style="width:${project.progress}%"></div></div><span>${project.progress}%</span></div></td><td>${esc(project.due)}</td><td>${esc(project.manager)}</td></tr>`).join("") || `<tr><td colspan="6">No projects match this search.</td></tr>`;
}

function renderTasks() {
  const query = ($("#task-search")?.value || "").trim().toLowerCase();
  const filtered = state.tasks.filter(task => {
    const statusForFilter = state.taskFilter === "all" || (state.taskFilter === "High" ? task.priority === "High" : task.status === state.taskFilter);
    return statusForFilter && [task.title, task.project, task.assignee, task.priority, task.status].join(" ").toLowerCase().includes(query);
  });
  $("#tasks-table").innerHTML = filtered.map(task => `
    <tr><td><div class="table-primary"><input class="task-check" type="checkbox" data-complete-task="${task.id}" aria-label="Complete ${esc(task.title)}" ${task.done ? "checked" : ""}><div><strong>${esc(task.title)}</strong><small>Task #${String(task.id).padStart(3, "0")}</small></div></div></td><td>${esc(task.project)}</td><td>${esc(task.assignee)}</td><td><span class="priority-pill ${priorityClass(task.priority)}">${esc(task.priority)}</span></td><td><span class="status-pill ${task.done ? "status-done" : task.status === "In progress" ? "status-progress" : "status-planning"}">${task.done ? "Done" : esc(task.status)}</span></td><td>${esc(task.due)}</td><td><button class="row-actions" aria-label="Task actions">···</button></td></tr>`).join("") || `<tr><td colspan="7">No tasks match this search.</td></tr>`;
}

function renderAll() {
  updateMetrics();
  renderDashboardProjects();
  renderDashboardTasks();
  renderActivity();
  renderPipeline();
  renderLeads();
  renderClients();
  renderContacts();
  renderProjects();
  renderTasks();
}

function fieldMarkup(field) {
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
      { name: "company", label: "Company name", required: true, full: true, placeholder: "e.g. Northstar Logistics" },
      { name: "contact", label: "Contact person", required: true, placeholder: "Full name" },
      { name: "email", label: "Email address", type: "email", placeholder: "name@company.co.za" },
      { name: "service", label: "Service interest", required: true, full: true, placeholder: "e.g. Workflow automation" },
      { name: "stage", label: "Pipeline stage", type: "select", options: [{value:"New",label:"New"},{value:"Discovery",label:"Discovery"},{value:"Proposal",label:"Proposal"},{value:"Negotiation",label:"Negotiation"}] },
      { name: "followUp", label: "Next follow-up", type: "date" }
    ],
    save(data) {
      const id = Math.max(0, ...state.leads.map(item => item.id)) + 1;
      const date = data.followUp ? new Date(`${data.followUp}T12:00:00`) : null;
      state.leads.unshift({ id, company: data.company, contact: data.contact, service: data.service, stage: data.stage, owner: "Khutjo M.", followUp: date ? date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "Not set", initials: initials(data.company), color: "orange" });
      state.activities.unshift({ icon: "＋", color: "orange", text: `<strong>New lead added</strong> — ${esc(data.company)}`, by: "Khutjo Mamabolo", time: "Just now" });
      renderAll(); setView("leads"); toast("Lead added to the local preview.");
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
    save(data) {
      state.clients.push({ id: Math.max(0, ...state.clients.map(item => item.id)) + 1, name: data.name, short: initials(data.name), industry: data.industry, email: data.email, contact: data.contact || "Not specified", status: "Active", projects: 0, since: "Oct 2026", color: "orange" });
      state.contacts.push({ name: data.contact || "Primary contact", organization: data.name, email: data.email, phone: "—", relationship: "Client contact" });
      state.activities.unshift({ icon: "＋", color: "green", text: `<strong>Client added</strong> — ${esc(data.name)}`, by: "Khutjo Mamabolo", time: "Just now" });
      renderAll(); setView("clients"); toast("Client added to the local preview.");
    }
  },
  "new-contact": {
    title: "Add a contact", eyebrow: "CONTACT DIRECTORY",
    fields: [
      { name: "name", label: "Full name", required: true, full: true, placeholder: "Contact's full name" },
      { name: "organization", label: "Organization", required: true, full: true, placeholder: "Client organization" },
      { name: "email", label: "Email address", type: "email", required: true, placeholder: "name@company.co.za" },
      { name: "phone", label: "Phone number", placeholder: "+27 ..." },
      { name: "relationship", label: "Relationship", type: "select", options: [{value:"Client contact",label:"Client contact"},{value:"Decision maker",label:"Decision maker"},{value:"Project contact",label:"Project contact"}] }
    ],
    save(data) {
      state.contacts.push({ name: data.name, organization: data.organization, email: data.email, phone: data.phone || "—", relationship: data.relationship });
      renderAll(); setView("contacts"); toast("Contact added to the local preview.");
    }
  },
  "new-project": {
    title: "Create a project", eyebrow: "PROJECT DELIVERY",
    fields: [
      { name: "name", label: "Project name", required: true, full: true, placeholder: "e.g. Client Portal Development" },
      { name: "client", label: "Client organization", required: true, full: true, placeholder: "Client name" },
      { name: "code", label: "Project reference", required: true, placeholder: "ZS-027" },
      { name: "due", label: "Target date", type: "date" },
      { name: "status", label: "Initial status", type: "select", options: [{value:"Planning",label:"Planning"},{value:"In progress",label:"In progress"},{value:"On hold",label:"On hold"}] }
    ],
    save(data) {
      state.projects.push({ id: Math.max(0, ...state.projects.map(item => item.id)) + 1, code: data.code.toUpperCase(), name: data.name, client: data.client, status: data.status, progress: 0, due: data.due || "Not set", manager: "Khutjo M.", color: "orange" });
      state.activities.unshift({ icon: "▣", color: "blue", text: `<strong>Project created</strong> — ${esc(data.name)}`, by: "Khutjo Mamabolo", time: "Just now" });
      renderAll(); setView("projects"); toast("Project added to the local preview.");
    }
  },
  "new-task": {
    title: "Create a task", eyebrow: "WORK MANAGEMENT",
    fields: [
      { name: "title", label: "Task title", required: true, full: true, placeholder: "What needs to be done?" },
      { name: "project", label: "Project", required: true, full: true, placeholder: "Project name" },
      { name: "assignee", label: "Assignee", required: true, placeholder: "Team member" },
      { name: "due", label: "Due date", type: "date" },
      { name: "priority", label: "Priority", type: "select", options: [{value:"High",label:"High"},{value:"Medium",label:"Medium"},{value:"Low",label:"Low"}] }
    ],
    save(data) {
      state.tasks.unshift({ id: Math.max(0, ...state.tasks.map(item => item.id)) + 1, title: data.title, project: data.project, assignee: data.assignee, due: data.due || "Not set", priority: data.priority, status: "To do", done: false });
      renderAll(); setView("tasks"); toast("Task added to the local preview.");
    }
  }
};

function openModal(key) {
  const definition = modalDefinitions[key];
  if (!definition) return;
  $("#modal-title").textContent = definition.title;
  $("#modal-eyebrow").textContent = definition.eyebrow;
  $("#modal-fields").innerHTML = definition.fields.map(fieldMarkup).join("");
  $("#record-form").dataset.modalKey = key;
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

document.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { setView(viewButton.dataset.view); return; }

  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) { setView(viewLink.dataset.viewLink); return; }

  const action = event.target.closest("[data-action]");
  if (action) {
    if (action.dataset.action === "export") exportCurrentView();
    else openModal(action.dataset.action);
    return;
  }

  const leadMenu = event.target.closest("[data-lead-menu]");
  if (leadMenu) {
    const lead = state.leads.find(item => item.id === Number(leadMenu.dataset.leadMenu));
    if (lead) toast(`Lead: ${lead.company} · Stage: ${lead.stage}. Editing will be added in a later step.`);
  }
});

document.addEventListener("change", event => {
  const taskCheckbox = event.target.closest("[data-complete-task]");
  if (!taskCheckbox) return;
  const task = state.tasks.find(item => item.id === Number(taskCheckbox.dataset.completeTask));
  if (!task) return;
  task.done = taskCheckbox.checked;
  if (task.done) task.status = "Done";
  else task.status = "To do";
  renderAll();
  toast(task.done ? "Task marked complete in the local preview." : "Task reopened in the local preview.");
});

$("#record-form").addEventListener("submit", event => {
  event.preventDefault();
  const key = event.currentTarget.dataset.modalKey;
  const definition = modalDefinitions[key];
  if (!definition) return;
  const formData = new FormData(event.currentTarget);
  const data = Object.fromEntries(formData.entries());
  if (!event.currentTarget.reportValidity()) return;
  definition.save(data);
  closeModal();
  event.currentTarget.reset();
});
$("#modal-close").addEventListener("click", closeModal);
$("#modal-cancel").addEventListener("click", closeModal);
$("#record-modal").addEventListener("click", event => {
  if (event.target === $("#record-modal")) closeModal();
});
$("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#notifications-button").addEventListener("click", () => toast("You're all caught up. Notification delivery will be connected to the backend later."));
$("#profile-button").addEventListener("click", () => toast("Signed in as Khutjo Mamabolo · Demo profile."));
$("#global-search").addEventListener("input", () => {
  if (state.activeView === "leads") renderLeads();
  if (state.activeView === "clients") renderClients();
  if (state.activeView === "projects") renderProjects();
  if (state.activeView === "tasks") renderTasks();
});
$("#lead-search").addEventListener("input", renderLeads);
$("#client-search").addEventListener("input", renderClients);
$("#contact-search").addEventListener("input", renderContacts);
$("#project-search").addEventListener("input", renderProjects);
$("#task-search").addEventListener("input", renderTasks);

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

const initialView = window.location.hash.replace("#", "");
if (initialView && $(`#view-${initialView}`)) setView(initialView);
renderAll();
