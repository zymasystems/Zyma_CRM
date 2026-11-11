/* Zyma CRM — motion layer. No dependencies; safe to load on any page that uses styles.css. */
(() => {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. Mark a page "fresh" for ~1.6s whenever it opens, so its entrance animations run once. */
  const freshen = section => {
    if (!section.classList.contains("active")) return;
    section.classList.remove("mo-fresh");
    void section.offsetWidth;
    section.classList.add("mo-fresh");
    clearTimeout(section.__moTimer);
    section.__moTimer = setTimeout(() => section.classList.remove("mo-fresh"), 1700);
  };
  const sections = [...document.querySelectorAll(".view-section")];
  const viewObserver = new MutationObserver(records => records.forEach(record => {
    const section = record.target;
    if (record.attributeName === "class") {
      const wasActive = (record.oldValue || "").split(/\s+/).includes("active");
      if (section.classList.contains("active") && !wasActive) { freshen(section); countAll(section); }
    } else if (record.attributeName === "data-record-id") { freshen(section); countAll(section); }
  }));
  sections.forEach(section => viewObserver.observe(section, { attributes: true, attributeOldValue: true, attributeFilter: ["class", "data-record-id"] }));
  const startMotion = () => { const initial = document.querySelector(".view-section.active"); if (initial) requestAnimationFrame(() => { freshen(initial); countAll(initial); }); };
  if (document.documentElement.classList.contains("zy-booting")) window.addEventListener("zyma:ready", startMotion, { once: true }); else startMotion();

  /* 2. Count numbers up (04, 30%, 12) when they appear or change. */
  const COUNT_SELECTOR = ".metric-value, .pj-stat strong, .cp-kpi strong, .pipeline-stage strong, .lp-funnel strong, .client-summary-card .metric-value, .lp-kpi strong, .dx-kpi-value";
  const ease = t => 1 - Math.pow(1 - t, 3);
  function countUp(el) {
    if (reduce || el.__moBusy || !el.offsetParent || document.documentElement.classList.contains("zy-booting")) return;
    const match = /^(\d+)(%?)$/.exec(el.textContent.trim());
    if (!match) return;
    const target = parseInt(match[1], 10), width = match[1].length, suffix = match[2];
    if (target === 0 || target > 100000) return;
    el.__moBusy = true;
    const start = performance.now(), duration = 750;
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(target * ease(t))).padStart(width, "0") + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else setTimeout(() => { el.__moBusy = false; }, 0);
    };
    requestAnimationFrame(tick);
  }
  function countAll(root) { root.querySelectorAll(COUNT_SELECTOR).forEach(countUp); }
  const textObserver = new MutationObserver(records => {
    const seen = new Set();
    records.forEach(record => {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const hosts = [];
      if (node && node.matches && node.matches(COUNT_SELECTOR)) hosts.push(node);
      record.addedNodes.forEach(added => { if (added.nodeType === 1) { if (added.matches(COUNT_SELECTOR)) hosts.push(added); added.querySelectorAll && added.querySelectorAll(COUNT_SELECTOR).forEach(el => hosts.push(el)); } });
      hosts.forEach(el => { if (!seen.has(el) && !el.__moBusy) { seen.add(el); countUp(el); } });
    });
  });
  textObserver.observe(document.body, { childList: true, characterData: true, subtree: true });

  /* 3. Spotlight: cards glow where the pointer is. */
  const SPOT = ".pj-card, .cp-card, .ct-card, .lead-card, .metric-card, .cp-card-panel, .pj-stat, .cp-kpi, .lp-card";
  let spotFrame = 0;
  document.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || reduce) return;
    const card = event.target.closest && event.target.closest(SPOT);
    if (!card) return;
    cancelAnimationFrame(spotFrame);
    spotFrame = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  }, { passive: true });

  /* 4. Button ripple. */
  document.addEventListener("pointerdown", event => {
    const button = event.target.closest && event.target.closest(".button");
    if (!button || reduce || button.disabled) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "mo-ripple";
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    button.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }, { passive: true });

  /* 5. Scroll progress bar. */
  if (!reduce) {
    const bar = document.createElement("div");
    bar.className = "mo-scrollbar";
    bar.setAttribute("aria-hidden", "true");
    document.body.append(bar);
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty("--mo-scroll", max > 0 ? String(Math.min(1, window.scrollY / max)) : "0");
      ticking = false;
    };
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  }
})();
