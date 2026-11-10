/* Zyma CRM — lead workflow, board cards and the lead profile.
 * Loaded after client-profile.js and before app.js. Functions only run after app.js has defined
 * its globals (state, esc, moveLead, formatRand, leadFee, ...). */

/* The Zyma sales workflow. `key` is the value stored on the lead (and sent to the API), so it stays
 * compatible with existing data; `label` is what people see. */
const LEAD_FLOW = [
  { key: "New", label: "New", hint: "Captured, not yet contacted", color: "var(--blue)", hex: "#6aa9ff", icon: "✦" },
  { key: "Discovery", label: "Discovery call", hint: "Understand what they need", color: "var(--violet)", hex: "#b09aff", icon: "◎" },
  { key: "Follow-up", label: "Financial follow-up", hint: "Share the price", color: "var(--green)", hex: "#52c69a", icon: "R" },
  { key: "Proposal", label: "Proposal", hint: "SLA sent and signed", color: "var(--orange)", hex: "#f58220", icon: "✎" },
  { key: "Won", label: "Won", hint: "Becomes a client", color: "var(--green)", hex: "#52c69a", icon: "✓" },
  { key: "Lost", label: "Lost", hint: "Did not go ahead", color: "var(--red)", hex: "#ff7b83", icon: "×" }
];
/* Stages from the old 9-step pipeline fold into the new workflow. */
const LEAD_LEGACY_STAGES = { Requirements: "Discovery", Negotiation: "Follow-up", Agreement: "Proposal" };
const LP_STEPS = LEAD_FLOW.filter(stage => stage.key !== "Lost");
const leadStageLabel = key => (LEAD_FLOW.find(stage => stage.key === key) || { label: key || "New" }).label;
function normalizeLeadStages() {
  (state.leads || []).forEach(lead => { if (LEAD_LEGACY_STAGES[lead.stage]) lead.stage = LEAD_LEGACY_STAGES[lead.stage]; });
}

const LP_STATE = { tab: "next" };
const lpToday = () => new Date().toISOString().slice(0, 10);
const lpHas = value => value !== undefined && value !== null && String(value).trim() !== "" && String(value) !== "—";
const lpRand = value => (typeof formatRand === "function" ? formatRand(value) : `R ${Math.round(value).toLocaleString("en-ZA")}`);

function lpMeetings(lead) {
  return state.meetings.filter(m => String(m.leadId) === String(lead.id) || cpNorm(m.lead) === cpNorm(lead.company));
}

/* ---------- Board card ---------- */
function leadCardMarkup(lead) {
  const fee = leadFee(lead);
  const stage = LEAD_FLOW.find(item => item.key === lead.stage) || LEAD_FLOW[0];
  const overdue = leadFollowUpOverdue(lead);
  const hue = cpHue(lead.company);
  const stageOptions = LEAD_FLOW.map(item => `<option value="${esc(item.key)}" ${item.key === lead.stage ? "selected" : ""}>${esc(item.label)}</option>`).join("");
  const dateText = lead.followUp && lead.followUp !== "—" ? lead.followUp : "No follow-up set";
  return `<article class="lead-card lp-card${overdue ? " is-overdue" : ""}" draggable="true" data-lead-card="${esc(lead.id)}" style="--h:${hue}">
    <div class="lp-card-top">
      <span class="cp-mono lp-card-mono" aria-hidden="true">${esc(lead.initials || initials(lead.company))}</span>
      <div class="lp-card-title"><button type="button" class="lp-card-link" data-open-record="lead" data-record-id="${esc(lead.id)}">${esc(lead.company)}</button><small>${esc(lead.contact || "No contact yet")}</small></div>
    </div>
    ${lead.service ? `<p class="lp-card-service">${esc(lead.service)}</p>` : ""}
    <div class="lp-card-figures">
      ${fee ? `<strong>${esc(lpRand(fee))}</strong><span>quoted</span>` : `<span class="lp-card-noquote">Not quoted yet</span>`}
    </div>
    <div class="lp-card-meta">
      <span class="lp-owner"><i class="mini-avatar">${esc(initials(lead.owner || "?"))}</i>${esc(lead.owner || "Unassigned")}</span>
      <span class="lp-when${overdue ? " is-overdue" : ""}" title="Next follow-up">${overdue ? "Overdue · " : ""}${esc(dateText)}</span>
    </div>
    <div class="lp-card-foot">
      <select class="lead-move" data-move-lead="${esc(lead.id)}" aria-label="Move ${esc(lead.company)} to another stage">${stageOptions}</select>
      <button type="button" class="row-action-button" data-edit-record="lead" data-record-id="${esc(lead.id)}">Edit</button>
    </div>
  </article>`;
}

/* The funnel above the board: how many leads sit at each step. */
function renderLeadFunnel(leads) {
  const host = $("#lead-funnel");
  if (!host) return;
  const total = Math.max(1, leads.length);
  host.innerHTML = LEAD_FLOW.map(stage => {
    const count = leads.filter(lead => lead.stage === stage.key).length;
    return `<button type="button" class="lp-funnel-step${stage.key === "Lost" ? " is-lost" : ""}" data-funnel-stage="${esc(stage.key)}" style="--stage-color:${stage.hex}" title="Jump to ${esc(stage.label)}">
      <span class="lp-funnel-count">${count}</span>
      <span class="lp-funnel-label">${esc(stage.label)}</span>
      <span class="lp-funnel-bar"><span style="width:${Math.round(count / total * 100)}%"></span></span>
    </button>`;
  }).join("");
}

/* ---------- Lead profile ---------- */
function lpStepStatus(lead, key) {
  if (lead.stage === "Lost") return "todo";
  const current = LP_STEPS.findIndex(step => step.key === lead.stage);
  const index = LP_STEPS.findIndex(step => step.key === key);
  if (index < current) return "done";
  if (index === current) return lead.stage === "Won" ? "done" : "current";
  return "todo";
}

/* What needs to happen at the current step, worked out from the lead's own data. */
function lpPlan(lead) {
  const meetings = lpMeetings(lead).filter(m => m.status !== "Cancelled");
  const discoveryMeeting = meetings.find(m => cpNorm(m.type) === "discovery");
  const financialMeeting = meetings.find(m => cpNorm(m.type) === "financial");
  const required = Number(lead.developmentFee || 0) * Number(lead.minimumDepositPercent || 0) / 100;
  const schedule = (type, label) => ({ label, attrs: `data-schedule-for-lead="${esc(lead.id)}" data-meeting-type="${type}"` });
  const next = key => ({ label: `Move to ${leadStageLabel(key)}`, attrs: `data-lp-stage="${key}"`, primary: true });
  const plans = {
    New: {
      title: "Book the discovery call",
      text: "Reach out and get a call in the diary. Once it is booked, move this lead forward.",
      checks: [["Contact details captured", lpHas(lead.email) || lpHas(lead.phone)], ["Discovery call booked", Boolean(discoveryMeeting)]],
      actions: [schedule("Discovery", "Book discovery call"), next("Discovery")]
    },
    Discovery: {
      title: "Run the discovery call",
      text: "Find out how the business runs today, what hurts, and what a good result looks like. Capture it in the workspace.",
      checks: [["Discovery call held", discoveryMeeting?.status === "Completed"], ["Call notes written", lpHas(lead.discoveryNotes)], ["Requirements captured", lpHas(lead.requirements)], ["Scope proposed", lpHas(lead.scope)]],
      actions: [{ label: "Open workspace", attrs: `data-lp-open-tab="workspace"` }, next("Follow-up")]
    },
    "Follow-up": {
      title: "Share the price",
      text: "Take the client through the development fee, the deposit and how payments will work.",
      checks: [["Financial meeting booked", Boolean(financialMeeting)], ["Development fee set", Number(lead.developmentFee) > 0], ["Deposit percentage agreed", [30, 40, 50].includes(Number(lead.minimumDepositPercent))], ["Billing model chosen", lpHas(lead.billingModel)]],
      actions: [schedule("Financial", "Book financial meeting"), next("Proposal")]
    },
    Proposal: {
      title: "Get the SLA signed",
      text: "Send the service level agreement and wait for the client to sign it. Once signed, convert them to a client.",
      checks: [["SLA sent", lpHas(lead.slaSentDate)], ["SLA signed by client", lpHas(lead.slaSignedDate)], ["Deposit received", Number(lead.depositPaid) > 0 && Number(lead.depositPaid) >= required]],
      actions: [
        ...(lpHas(lead.slaSentDate) ? [] : [{ label: "Mark SLA as sent today", attrs: `data-lp-quick="slaSentDate"` }]),
        ...(lpHas(lead.slaSentDate) && !lpHas(lead.slaSignedDate) ? [{ label: "Mark SLA as signed today", attrs: `data-lp-quick="slaSignedDate"` }] : []),
        { label: "Win and convert to client", attrs: `data-lp-stage="Won"`, primary: true }
      ]
    },
    Won: { title: "Won", text: "This lead is now a client.", checks: [["Client record created", Boolean(lead.convertedClientId)]], actions: [] },
    Lost: { title: "Lost", text: "This lead did not go ahead. You can reopen it if things change.", checks: [], actions: [{ label: "Reopen at Discovery call", attrs: `data-lp-stage="Discovery"`, primary: true }] }
  };
  return plans[lead.stage] || plans.New;
}

function lpJourney(lead) {
  return `<ol class="lp-journey" aria-label="Sales journey">${LP_STEPS.map((step, index) => {
    const status = lpStepStatus(lead, step.key);
    return `<li class="lp-step is-${status}" style="--stage-color:${step.hex}">
      <button type="button" data-lp-stage="${esc(step.key)}" ${status === "current" ? 'aria-current="step"' : ""}>
        <span class="lp-node">${status === "done" ? "✓" : index + 1}</span>
        <strong>${esc(step.label)}</strong>
        <small>${esc(step.hint)}</small>
      </button>
    </li>`;
  }).join("")}</ol>`;
}

function renderLeadProfile(lead) {
  const hue = cpHue(lead.company);
  const plan = lpPlan(lead);
  const stage = LEAD_FLOW.find(item => item.key === lead.stage) || LEAD_FLOW[0];
  const meetings = lpMeetings(lead);
  const fee = leadFee(lead);
  const required = Number(lead.developmentFee || 0) * Number(lead.minimumDepositPercent || 0) / 100;
  const overdue = leadFollowUpOverdue(lead);
  const email = cpSafeEmail(lead.email);
  const phone = cpSafePhone(lead.phone);
  const converted = lead.convertedClientId ? state.clients.find(c => String(c.id) === String(lead.convertedClientId)) : state.clients.find(c => cpNorm(c.name) === cpNorm(lead.company));
  const done = plan.checks.filter(item => item[1]).length;
  const activities = state.activities.filter(a => String(a.text || "").toLowerCase().includes(cpNorm(lead.company))).slice(0, 8);
  const followDate = parseDisplayDate(lead.followUp);
  const followDays = followDate ? Math.round((followDate - cpToday()) / 86400000) : null;
  const tab = (key, label, count) => `<button type="button" role="tab" class="cp-tab${LP_STATE.tab === key ? " is-active" : ""}" id="lp-tab-${key}" aria-selected="${LP_STATE.tab === key}" aria-controls="lp-panel-${key}" tabindex="${LP_STATE.tab === key ? 0 : -1}" data-lp-tab="${key}">${label}${count === undefined ? "" : `<span>${count}</span>`}</button>`;
  const panel = (key, content) => `<div role="tabpanel" id="lp-panel-${key}" aria-labelledby="lp-tab-${key}" data-lp-panel="${key}" ${LP_STATE.tab === key ? "" : "hidden"}>${content}</div>`;
  const kpi = (value, label, hint = "") => `<div class="cp-kpi"><strong>${value}</strong><span>${label}</span>${hint ? `<small>${hint}</small>` : ""}</div>`;
  const lost = lead.stage === "Lost";

  const checklist = plan.checks.length
    ? `<ul class="lp-checks">${plan.checks.map(([label, ok]) => `<li class="${ok ? "is-ok" : ""}"><span class="lp-check">${ok ? "✓" : ""}</span>${esc(label)}</li>`).join("")}</ul>`
    : "";
  const actions = plan.actions.map(action => `<button type="button" class="button ${action.primary ? "button-primary" : "button-secondary"}" ${action.attrs}>${esc(action.label)}</button>`).join("");
  const nextCard = `<section class="cp-card-panel lp-next" style="--stage-color:${stage.hex}">
    <header><h2>${lead.stage === "Won" || lost ? esc(plan.title) : "Next step"}</h2>${plan.checks.length ? `<span class="lp-progress-note">${done} of ${plan.checks.length} done</span>` : ""}</header>
    <div class="lp-next-body">
      <div><h3>${esc(lead.stage === "Won" || lost ? leadStageLabel(lead.stage) : plan.title)}</h3><p>${esc(plan.text)}</p>${checklist}</div>
    </div>
    ${lead.stage === "Won" && converted ? `<div class="lp-next-actions"><button type="button" class="button button-primary" data-open-record="client" data-record-id="${esc(converted.id)}">Open client profile</button></div>` : actions ? `<div class="lp-next-actions">${actions}</div>` : ""}
  </section>`;

  const meetingList = meetings.length
    ? `<div class="cp-list">${[...meetings].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).map(m => `<button type="button" class="cp-person" data-open-record="meeting" data-record-id="${esc(m.id)}"><span class="cp-upcoming-icon">${cpNorm(m.type) === "financial" ? "R" : "◎"}</span><span class="cp-person-main"><strong>${esc(m.title || `${m.type} meeting`)}</strong><small>${esc(m.type || "Meeting")} · ${esc(cpDate(m.date))}${m.time ? ` at ${esc(m.time)}` : ""}</small></span><span class="cp-person-end"><span class="status-pill ${m.status === "Completed" ? "status-done" : m.status === "Cancelled" ? "status-hold" : "status-progress"}">${esc(m.status || "Scheduled")}</span></span></button>`).join("")}</div>`
    : `<p class="cp-empty">No meetings yet. Book the discovery call to get this lead moving.</p>`;
  const activityList = activities.length
    ? `<ol class="cp-timeline">${activities.map(a => `<li><span class="cp-timeline-icon">${esc(a.icon)}</span><div><strong>${a.text}</strong><small>${esc(a.by)} · ${esc(a.time)}</small></div></li>`).join("")}</ol>`
    : `<p class="cp-empty">Stage changes and updates for this lead will be listed here.</p>`;

  return `<div class="cp-profile lp-profile" style="--h:${hue}">
    <div class="cp-crumb"><button class="cp-back" type="button" data-back-to-list><span aria-hidden="true">←</span> All leads</button></div>

    <header class="cp-hero">
      <div class="cp-hero-banner" aria-hidden="true"></div>
      <div class="cp-hero-main">
        <span class="cp-mono cp-mono-xl" aria-hidden="true">${esc(lead.initials || initials(lead.company))}</span>
        <div class="cp-hero-id">
          <h1>${esc(lead.company)}</h1>
          <p>${esc(lead.contact || "No contact person yet")}${lead.service ? ` · ${esc(lead.service)}` : ""}</p>
          <div class="cp-hero-chips"><span class="lp-stage-chip" style="--stage-color:${stage.hex}"><span></span>${esc(stage.label)}</span>${overdue ? `<span class="cp-chip is-warn">Follow-up overdue</span>` : ""}${lead.owner ? `<span class="cp-chip">Owner · ${esc(lead.owner)}</span>` : ""}</div>
        </div>
        <div class="cp-hero-actions">
          <button class="button button-secondary" type="button" data-edit-record="lead" data-record-id="${esc(lead.id)}">Edit lead</button>
          ${lead.stage !== "Won" && lead.stage !== "Lost" ? `<button class="button button-primary" type="button" data-convert-lead="${esc(lead.id)}">Convert to client</button>` : lead.stage === "Won" && converted ? `<button class="button button-primary" type="button" data-open-record="client" data-record-id="${esc(converted.id)}">Open client</button>` : ""}
        </div>
      </div>
    </header>

    ${lost ? `<div class="lp-lost-banner"><strong>This lead was marked as lost.</strong><span>Nothing is deleted. Reopen it if the client comes back.</span></div>` : lpJourney(lead)}

    <section class="cp-kpis lp-kpis" aria-label="Lead summary">
      ${kpi(fee ? lpRand(fee) : "Not quoted", "Development fee", Number(lead.minimumDepositPercent) ? `${lead.minimumDepositPercent}% deposit` : "Deposit not agreed")}
      ${kpi(lpRand(Number(lead.depositPaid) || 0), "Deposit received", required ? `${lpRand(required)} required` : "")}
      ${kpi(Number(lead.monthlyFee) ? lpRand(Number(lead.monthlyFee)) : "None", "Monthly fee", Number(lead.freeMonths) ? `${lead.freeMonths} free months` : "")}
      ${kpi(esc(lead.followUp && lead.followUp !== "—" ? (cpIsoDate(lead.followUp) ? cpDate(lead.followUp) : lead.followUp) : "Not set"), "Next follow-up", followDays === null ? "" : esc(cpRelativeDays(followDays)))}
      ${kpi(meetings.length, meetings.length === 1 ? "Meeting" : "Meetings", `${meetings.filter(m => m.status === "Completed").length} completed`)}
    </section>

    <div class="cp-tabs" role="tablist" aria-label="Lead sections">${tab("next", "Next steps")}${tab("workspace", "Workspace")}${tab("activity", "Activity", activities.length)}</div>

    <div class="cp-layout">
      <div class="cp-main">
        ${panel("next", `${nextCard}<section class="cp-card-panel"><header><h2>Meetings</h2><button type="button" class="cp-inline-link" data-schedule-for-lead="${esc(lead.id)}">Schedule meeting</button></header>${meetingList}</section>`)}
        ${panel("workspace", renderLeadWorkspace(lead))}
        ${panel("activity", cpCard("Lead activity", activityList))}
      </div>
      <aside class="cp-side">
        ${cpCard("Get in touch", `<div class="cp-touch"><div class="cp-touch-person"><span class="cp-avatar">${esc(initials(lead.contact || lead.company))}</span><div><strong>${esc(lead.contact || "No contact yet")}</strong><small>Contact person</small></div></div><div class="cp-touch-actions">${email ? `<a class="button button-secondary button-small" href="mailto:${esc(email)}">✉ Email</a>` : `<span class="button button-secondary button-small is-disabled" aria-disabled="true">✉ No email</span>`}${phone ? `<a class="button button-secondary button-small" href="tel:${esc(phone)}">☎ Call</a>` : `<span class="button button-secondary button-small is-disabled" aria-disabled="true">☎ No phone</span>`}</div></div>`)}
        ${cpCard("Details", `<dl class="cp-fields">${cpField("Company", lead.company)}${cpField("Contact", lead.contact)}${cpField("Email", lead.email, email ? `mailto:${email}` : "")}${cpField("Phone", lead.phone, phone ? `tel:${phone}` : "")}${cpField("Industry", lead.industry)}${cpField("Service", lead.service)}${cpField("Stage", stage.label)}${cpField("Owner", lead.owner)}${cpField("SLA", lpHas(lead.slaSignedDate) ? `Signed ${cpDate(lead.slaSignedDate)}` : lpHas(lead.slaSentDate) ? `Sent ${cpDate(lead.slaSentDate)}` : "")}</dl>`)}
        ${cpCard("Manage", `<div class="cp-manage">${lead.stage !== "Lost" && lead.stage !== "Won" ? `<button class="button button-secondary button-small cp-danger" type="button" data-lp-stage="Lost">Mark as lost</button>` : ""}<button class="button button-secondary button-small" type="button" data-edit-record="lead" data-record-id="${esc(lead.id)}">Edit details</button><button class="button button-secondary button-small cp-danger" type="button" data-delete-record="lead" data-record-id="${esc(lead.id)}">Delete lead</button></div>`)}
      </aside>
    </div>
  </div>`;
}

function openLeadProfile(lead, { resetTab = true } = {}) {
  if (resetTab) LP_STATE.tab = "next";
  const view = $("#view-record-detail");
  view.dataset.recordType = "lead";
  view.dataset.recordId = String(lead.id);
  view.innerHTML = renderLeadProfile(lead);
  view.classList.add("cp-view");
  if (typeof updateCommercialCalculations === "function") updateCommercialCalculations();
}
function refreshLeadProfile() {
  const view = $("#view-record-detail");
  if (!view || !view.classList.contains("active") || view.dataset.recordType !== "lead") return;
  const lead = state.leads.find(item => String(item.id) === view.dataset.recordId);
  if (!lead) return;
  const keepScroll = window.scrollY;
  openLeadProfile(lead, { resetTab: false });
  window.scrollTo(0, keepScroll);
}

function lpSetTab(key) {
  LP_STATE.tab = key;
  $$("[data-lp-panel]").forEach(panel => { panel.hidden = panel.dataset.lpPanel !== key; });
  $$("[data-lp-tab]").forEach(btn => {
    const on = btn.dataset.lpTab === key;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", String(on));
    btn.tabIndex = on ? 0 : -1;
  });
}

document.addEventListener("click", async event => {
  const tabBtn = event.target.closest("[data-lp-tab], [data-lp-open-tab]");
  if (tabBtn) { lpSetTab(tabBtn.dataset.lpTab || tabBtn.dataset.lpOpenTab); return; }

  const funnel = event.target.closest("[data-funnel-stage]");
  if (funnel) {
    const column = document.querySelector(`[data-lead-column="${CSS.escape(funnel.dataset.funnelStage)}"]`);
    if (column) { column.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); column.classList.add("lp-flash"); setTimeout(() => column.classList.remove("lp-flash"), 1200); }
    return;
  }

  const quick = event.target.closest("[data-lp-quick]");
  if (quick) {
    const view = $("#view-record-detail");
    const lead = state.leads.find(item => String(item.id) === view.dataset.recordId);
    if (!lead) return;
    lead[quick.dataset.lpQuick] = lpToday();
    if (lead.apiBacked && typeof saveLeadExtras === "function") saveLeadExtras(lead);
    state.activities.unshift({ icon: "✎", color: "orange", text: `<strong>${quick.dataset.lpQuick === "slaSentDate" ? "SLA sent" : "SLA signed"}</strong> — ${esc(lead.company)}`, by: currentActorName(), time: "Just now" });
    persistState(); renderAll();
    toast(quick.dataset.lpQuick === "slaSentDate" ? "SLA marked as sent today." : "SLA marked as signed today.");
    return;
  }

  const stageBtn = event.target.closest("[data-lp-stage]");
  if (stageBtn) {
    const view = $("#view-record-detail");
    const lead = state.leads.find(item => String(item.id) === view.dataset.recordId);
    const key = stageBtn.dataset.lpStage;
    if (!lead || lead.stage === key) return;
    if (key === "Won" && !window.confirm(`Win ${lead.company} and convert them to a client?`)) return;
    if (key === "Lost" && !window.confirm(`Mark ${lead.company} as lost? You can reopen it later.`)) return;
    await moveLead(lead.id, key);
  }
});

/* Pre-select the meeting type when booking from a step ("Book discovery call" / "Book financial meeting"). */
document.addEventListener("click", event => {
  const button = event.target.closest("[data-meeting-type]");
  if (!button) return;
  setTimeout(() => { const type = $("#type", $("#modal-fields")); if (type) type.value = button.dataset.meetingType; }, 0);
});

document.addEventListener("keydown", event => {
  const tab = event.target.closest?.("[data-lp-tab]");
  if (!tab || !["ArrowRight", "ArrowLeft"].includes(event.key)) return;
  const tabs = $$("[data-lp-tab]");
  const index = (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  lpSetTab(tabs[index].dataset.lpTab);
  tabs[index].focus();
});
