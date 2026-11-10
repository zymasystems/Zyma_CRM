/* Zyma CRM — bottom tab bar for phones. Uses the app's own setView(), so it stays in sync with the sidebar. */
(() => {
  const icon = paths => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const items = [
    { view: "dashboard", label: "Home", svg: icon('<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10.5V19h12v-8.5"/>') },
    { view: "leads", label: "Leads", svg: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>') },
    { view: "clients", label: "Clients", svg: icon('<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><path d="M16 6.4a3 3 0 0 1 0 5.4M17.5 14.6c1.8.5 2.8 2 3 4.4"/>') },
    { view: "projects", label: "Projects", svg: icon('<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 10h8M8 14h5"/>') },
    { view: "more", label: "Menu", svg: icon('<path d="M5 7h14M5 12h14M5 17h14"/>') }
  ];
  const nav = document.createElement("nav");
  nav.className = "mo-bottomnav";
  nav.setAttribute("aria-label", "Main");
  nav.innerHTML = items.map(item => `<button type="button" data-mo-view="${item.view}" aria-label="${item.label}">${item.svg}<span>${item.label}</span></button>`).join("");
  document.body.append(nav);

  const owner = { lead: "leads", client: "clients", contact: "contacts", project: "projects" };
  function sync() {
    const active = document.querySelector(".view-section.active");
    if (!active) return;
    let view = active.id.replace("view-", "");
    if (view === "record-detail") view = owner[active.dataset.recordType] || view;
    nav.querySelectorAll("button").forEach(button => {
      const on = button.dataset.moView === view;
      button.classList.toggle("is-active", on);
      if (on) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
  }
  nav.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.moView === "more") { document.getElementById("sidebar")?.classList.toggle("open"); return; }
    if (typeof setView === "function") { setView(button.dataset.moView); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
  const observer = new MutationObserver(sync);
  document.querySelectorAll(".view-section").forEach(section => observer.observe(section, { attributes: true, attributeFilter: ["class", "data-record-type"] }));
  sync();
})();
