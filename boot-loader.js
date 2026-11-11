/* Zyma CRM — boot loader. Load this in <head>. Pages call ZymaBoot.done() once their first full data load has rendered. */
(() => {
  const root = document.documentElement;
  root.classList.add("zy-booting");
  let finished = false;
  const skeleton = `<div class="zy-boot" role="status" aria-live="polite" aria-label="Loading your workspace">
    <div class="zy-boot-head"><span class="zy-sk title"></span><span class="zy-sk line" style="width:min(460px,80%)"></span></div>
    <div class="zy-boot-stats"><span class="zy-sk"></span><span class="zy-sk"></span><span class="zy-sk"></span><span class="zy-sk"></span></div>
    <div class="zy-boot-grid"><span class="zy-sk"></span><span class="zy-sk"></span></div>
    <div class="zy-boot-note"><span class="zy-boot-dot"></span>Loading your workspace…</div>
  </div>`;
  document.addEventListener("DOMContentLoaded", () => {
    const main = document.getElementById("main-content");
    if (main && !finished) main.insertAdjacentHTML("afterbegin", skeleton);
  });
  function done() {
    if (finished) return;
    finished = true;
    root.classList.remove("zy-booting");
    root.classList.add("zy-ready");
    const loader = document.querySelector(".zy-boot");
    if (loader) {
      loader.classList.add("is-leaving");
      requestAnimationFrame(() => requestAnimationFrame(() => { loader.style.opacity = "0"; }));
      setTimeout(() => loader.remove(), 420);
    }
    window.dispatchEvent(new CustomEvent("zyma:ready"));
    setTimeout(() => root.classList.remove("zy-ready"), 700);
  }
  window.ZymaBoot = { done };
  setTimeout(done, 12000); // never leave someone staring at a loader if the API is unreachable
})();
