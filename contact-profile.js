/* Zyma CRM — contact directory cards and the contact profile.
 * Loaded after client-profile.js; reuses its helpers (cpHue, cpField, cpCard, cpAvatarStack, ...). */

const CT_STATE = { tab: "overview" };

function ctSafeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) && url.hostname.includes(".") ? url.href : "";
  } catch { return ""; }
}
function ctRoleClass(relationship) {
  return /decision/i.test(relationship) ? "is-decision" : /project/i.test(relationship) ? "is-project" : /supplier|partner/i.test(relationship) ? "is-partner" : /prospect/i.test(relationship) ? "is-prospect" : "is-client";
}
/* A contact takes the colour of its organisation, so people from the same company look related. */
const ctHue = contact => cpHue(contact.organization || contact.name);
const ctName = contact => contact.name || "Unnamed contact";

function ctClientFor(contact) {
  return state.clients.find(c => String(c.id) === String(contact.clientId || contact.sourceClientId || "")) || state.clients.find(c => cpNorm(c.name) === cpNorm(contact.organization));
}

/* ---------- Directory card ---------- */
function contactCardMarkup(contact) {
  const name = ctName(contact);
  const relationship = contact.relationship || "Contact";
  const email = cpSafeEmail(contact.email || contact.workEmail);
  const phoneRaw = contact.phone || contact.mobile || "";
  const phone = cpSafePhone(phoneRaw);
  const title = contact.jobTitle || contact.title || contact.position || "";
  const projects = Number(contact.linkedProjectCount || 0);
  const days = cpDaysFromToday(contact.nextFollowUp);
  const follow = contact.nextFollowUp
    ? `<span class="ct-follow${days !== null && days < 0 ? " is-overdue" : ""}">${days !== null ? esc(cpRelativeDays(days)) : esc(contact.nextFollowUp)}<small>follow-up</small></span>`
    : "";
  return `<article class="ct-card" style="--h:${ctHue(contact)}">
    <div class="ct-card-head">
      <span class="ct-avatar" aria-hidden="true">${esc(initials(name))}</span>
      <span class="ct-role ${ctRoleClass(relationship)}">${esc(relationship)}</span>
    </div>
    <h3 class="ct-name"><button type="button" class="ct-link" data-open-record="contact" data-record-id="${esc(contact.id)}">${esc(name)}</button></h3>
    <p class="ct-title">${esc(title || "Role not provided")}</p>
    <p class="ct-org"><span aria-hidden="true">▦</span>${esc(contact.organization || "No organization")}</p>
    <div class="ct-reach">
      ${email ? `<a class="ct-reach-btn" href="mailto:${esc(email)}" aria-label="Email ${esc(name)}" title="${esc(email)}">✉</a>` : `<span class="ct-reach-btn is-off" title="No email" aria-hidden="true">✉</span>`}
      ${phone ? `<a class="ct-reach-btn" href="tel:${esc(phone)}" aria-label="Call ${esc(name)}" title="${esc(phoneRaw)}">☎</a>` : `<span class="ct-reach-btn is-off" title="No phone" aria-hidden="true">☎</span>`}
      <span class="ct-reach-text">${esc(email || phoneRaw || "No contact details")}</span>
    </div>
    <div class="ct-foot">
      <span class="ct-meta">${follow || `${projects} ${projects === 1 ? "project" : "projects"}`}</span>
      <span class="ct-actions">${recordActionButtons("contact", contact.id)}</span>
    </div>
  </article>`;
}

/* ---------- Profile ---------- */
function ctReach(label, value, href, icon) {
  if (!value) return "";
  return `<a class="ct-reach-row" href="${esc(href)}" ${href.startsWith("http") ? 'target="_blank" rel="noopener noreferrer"' : ""}><span class="ct-reach-icon" aria-hidden="true">${icon}</span><span><small>${esc(label)}</small><strong>${esc(value)}</strong></span><span class="ct-reach-go" aria-hidden="true">↗</span></a>`;
}

function renderContactProfile(contact) {
  const hue = ctHue(contact);
  const name = ctName(contact);
  const client = ctClientFor(contact);
  const org = contact.organization || "";
  const orgKey = cpNorm(org);
  const projects = state.projects.filter(p => cpNorm(p.client) === orgKey);
  const comms = state.communications.filter(c => cpNorm(c.client) === orgKey);
  const meetings = state.meetings.filter(m => cpNorm(m.lead) === orgKey);
  const email = cpSafeEmail(contact.email);
  const altEmail = cpSafeEmail(contact.alternateEmail);
  const phone = cpSafePhone(contact.phone);
  const mobile = cpSafePhone(contact.mobile);
  const linkedin = ctSafeUrl(contact.linkedin);
  const website = ctSafeUrl(contact.companyWebsite);
  const days = cpDaysFromToday(contact.nextFollowUp);
  const lastDays = cpDaysFromToday(contact.lastContactDate);
  const interactions = comms.length + meetings.length;
  const address = [contact.address, contact.city, contact.province, contact.postalCode, contact.country].filter(Boolean).join(", ");

  const reachRows = [
    ctReach("Work email", contact.email, email ? `mailto:${email}` : "", "✉"),
    ctReach("Other email", contact.alternateEmail, altEmail ? `mailto:${altEmail}` : "", "✉"),
    ctReach("Direct phone", contact.phone, phone ? `tel:${phone}` : "", "☎"),
    ctReach("Mobile", contact.mobile, mobile ? `tel:${mobile}` : "", "☎"),
    ctReach("LinkedIn", contact.linkedin, linkedin, "in")
  ].filter(Boolean).join("");

  const tab = (key, label, count) => `<button type="button" role="tab" class="cp-tab${CT_STATE.tab === key ? " is-active" : ""}" id="ct-tab-${key}" aria-selected="${CT_STATE.tab === key}" aria-controls="ct-panel-${key}" tabindex="${CT_STATE.tab === key ? 0 : -1}" data-ct-tab="${key}">${label}${count === undefined ? "" : `<span>${count}</span>`}</button>`;
  const panel = (key, content) => `<div role="tabpanel" id="ct-panel-${key}" aria-labelledby="ct-tab-${key}" data-ct-panel="${key}" ${CT_STATE.tab === key ? "" : "hidden"}>${content}</div>`;
  const kpi = (value, label, hint = "") => `<div class="cp-kpi"><strong>${value}</strong><span>${label}</span>${hint ? `<small>${hint}</small>` : ""}</div>`;

  const projectList = projects.length
    ? `<div class="cp-list">${projects.map(cpProjectRow).join("")}</div>`
    : `<p class="cp-empty">${org ? `No projects are linked to ${esc(org)} yet.` : "This contact is not linked to an organization."}</p>`;
  const events = [
    ...comms.map(c => ({ date: c.date, icon: "✉", title: c.subject || c.type || "Communication", note: [c.channel, c.owner].filter(Boolean).join(" · ") })),
    ...meetings.map(m => ({ date: m.date, icon: "▦", title: m.title || "Meeting", note: [m.type, m.status].filter(Boolean).join(" · ") }))
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const timeline = events.length
    ? `<ol class="cp-timeline">${events.map(e => `<li><span class="cp-timeline-icon">${e.icon}</span><div><strong>${esc(e.title)}</strong><small>${esc(cpDate(e.date))}</small>${e.note ? `<p>${esc(e.note)}</p>` : ""}</div></li>`).join("")}</ol>`
    : `<p class="cp-empty">No conversations or meetings are logged for ${esc(org || name)} yet.</p>`;

  const companyFields = `<dl class="cp-fields">
    ${cpField("Organization", org)}${cpField("Industry", contact.industry)}${cpField("Website", contact.companyWebsite, website)}
    ${cpField("Company email", contact.companyEmail, cpSafeEmail(contact.companyEmail) ? `mailto:${cpSafeEmail(contact.companyEmail)}` : "")}
    ${cpField("Company phone", contact.companyPhone, cpSafePhone(contact.companyPhone) ? `tel:${cpSafePhone(contact.companyPhone)}` : "")}
    ${cpField("Company size", contact.companySize)}${cpField("Registration no.", contact.registrationNumber)}${cpField("VAT number", contact.vatNumber)}${cpField("Address", address)}
  </dl>`;

  return `<div class="cp-profile ct-profile" style="--h:${hue}">
    <div class="cp-crumb"><button class="cp-back" type="button" data-back-to-list><span aria-hidden="true">←</span> All contacts</button></div>

    <header class="cp-hero">
      <div class="cp-hero-banner" aria-hidden="true"></div>
      <div class="cp-hero-main">
        <span class="ct-avatar ct-avatar-xl" aria-hidden="true">${esc(initials(name))}</span>
        <div class="cp-hero-id">
          <h1>${esc(name)}</h1>
          <p>${esc(contact.jobTitle || "Role not provided")}${org ? ` at ${esc(org)}` : ""}</p>
          <div class="cp-hero-chips"><span class="ct-role ${ctRoleClass(contact.relationship)}">${esc(contact.relationship || "Contact")}</span>${contact.preferredContact ? `<span class="cp-chip">Prefers ${esc(String(contact.preferredContact).toLowerCase())}</span>` : ""}${contact.department ? `<span class="cp-chip">${esc(contact.department)}</span>` : ""}</div>
        </div>
        <div class="cp-hero-actions">
          <button class="button button-secondary" type="button" data-edit-record="contact" data-record-id="${esc(contact.id)}">Edit contact</button>
          ${email ? `<a class="button button-primary" href="mailto:${esc(email)}">✉ Send email</a>` : phone ? `<a class="button button-primary" href="tel:${esc(phone)}">☎ Call</a>` : ""}
        </div>
      </div>
    </header>

    <section class="cp-kpis ct-kpis" aria-label="Contact summary">
      ${kpi(esc(contact.lastContactDate ? cpDate(contact.lastContactDate) : "Never"), "Last contacted", lastDays === null ? "" : esc(lastDays === 0 ? "Today" : `${Math.abs(lastDays)} days ago`))}
      ${kpi(esc(contact.nextFollowUp ? cpDate(contact.nextFollowUp) : "None set"), "Next follow-up", days === null ? "" : esc(cpRelativeDays(days)))}
      ${kpi(projects.length, projects.length === 1 ? "Project" : "Projects", `${projects.filter(p => !CP_DONE_STATUSES.includes(p.status)).length} active`)}
      ${kpi(interactions, "Interactions", "With this organization")}
    </section>

    <div class="cp-tabs" role="tablist" aria-label="Contact sections">${tab("overview", "Overview")}${tab("company", "Company")}${tab("activity", "Activity", interactions)}</div>

    <div class="cp-layout">
      <div class="cp-main">
        ${panel("overview", `
          ${cpCard("Reach " + name.split(" ")[0], reachRows ? `<div class="ct-reach-list">${reachRows}</div>` : `<p class="cp-empty">No email, phone or LinkedIn is saved for this contact. Edit the contact to add one.</p>`)}
          ${contact.notes ? cpCard("Notes", `<p class="ct-notes">${esc(contact.notes)}</p>`) : ""}
          ${cpCard("Projects", projectList)}`)}
        ${panel("company", cpCard(org || "Company", companyFields, { action: client ? `<button type="button" class="cp-inline-link" data-open-record="client" data-record-id="${esc(client.id)}">Open client profile</button>` : "" }))}
        ${panel("activity", cpCard("Conversations and meetings", timeline))}
      </div>
      <aside class="cp-side">
        ${cpCard("Relationship", `<dl class="cp-fields">
          ${cpField("Relationship", contact.relationship)}${cpField("Role in company", contact.companyRole)}${cpField("Source", contact.source)}
          ${cpField("Preferred contact", contact.preferredContact)}${cpField("Last contacted", contact.lastContactDate ? cpDate(contact.lastContactDate) : "")}${cpField("Next follow-up", contact.nextFollowUp ? cpDate(contact.nextFollowUp) : "")}
        </dl>`)}
        ${client ? cpCard("Organization", `<button type="button" class="cp-person" data-open-record="client" data-record-id="${esc(client.id)}" style="--h:${cpHue(client.name)}">${cpMono(client, "ct-org-mono")}<span class="cp-person-main"><strong>${esc(client.name)}</strong><small>${esc(client.industry || "Client")} · ${esc(client.status || "")}</small></span><span class="cp-reach-go" aria-hidden="true">↗</span></button>`) : ""}
        ${cpCard("Manage", `<div class="cp-manage"><button class="button button-secondary button-small" type="button" data-edit-record="contact" data-record-id="${esc(contact.id)}">Edit details</button>${contact.sourceLeadId || contact.sourceClientId ? "" : `<button class="button button-secondary button-small cp-danger" type="button" data-delete-record="contact" data-record-id="${esc(contact.id)}">Delete contact</button>`}</div>${contact.sourceLeadId || contact.sourceClientId ? `<p class="cp-empty ct-managed">This contact is kept in sync with its ${contact.sourceClientId ? "client" : "lead"} record, so it can't be deleted here.</p>` : ""}`)}
      </aside>
    </div>
  </div>`;
}

function openContactProfile(contact, { resetTab = true } = {}) {
  if (resetTab) CT_STATE.tab = "overview";
  const view = $("#view-record-detail");
  view.dataset.recordType = "contact";
  view.dataset.recordId = String(contact.id);
  view.innerHTML = renderContactProfile(contact);
  view.classList.add("cp-view");
}
function refreshContactProfile() {
  const view = $("#view-record-detail");
  if (!view || !view.classList.contains("active") || view.dataset.recordType !== "contact") return;
  const contact = state.contacts.find(item => String(item.id) === view.dataset.recordId);
  if (contact) openContactProfile(contact, { resetTab: false });
}

function ctSetTab(key) {
  CT_STATE.tab = key;
  $$("[data-ct-panel]").forEach(panel => { panel.hidden = panel.dataset.ctPanel !== key; });
  $$("[data-ct-tab]").forEach(btn => {
    const on = btn.dataset.ctTab === key;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", String(on));
    btn.tabIndex = on ? 0 : -1;
  });
}
document.addEventListener("click", event => {
  const tab = event.target.closest("[data-ct-tab]");
  if (tab) ctSetTab(tab.dataset.ctTab);
});
document.addEventListener("keydown", event => {
  const tab = event.target.closest?.("[data-ct-tab]");
  if (!tab || !["ArrowRight", "ArrowLeft"].includes(event.key)) return;
  const tabs = $$("[data-ct-tab]");
  const index = (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  ctSetTab(tabs[index].dataset.ctTab);
  tabs[index].focus();
});

function contactSortValue(contact, mode) {
  if (mode === "organization") return `${cpNorm(contact.organization) || "zzz"} ${cpNorm(contact.name)}`;
  if (mode === "followup") return contact.nextFollowUp ? String(contact.nextFollowUp) : "9999";
  return cpNorm(contact.name);
}
