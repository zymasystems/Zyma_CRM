(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const api = window.ZymaCrmApi;
  if (!api) return;
  let projects = [], updates = [];
  const date = value => { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-ZA",{day:"2-digit",month:"short",year:"numeric"}).format(d); };
  const feedback = (text, error = false) => { const el=$("#updates-feedback"); if(el){el.textContent=text;el.style.color=error?"var(--danger, #dc2626)":"var(--muted-2)";} };
  const projectId = p => String(p.id || p.projectId || "");
  const projectName = p => p.name || p.projectName || p.title || "Project";
  async function loadProjects() {
    const data = await api.request("/projects");
    projects = Array.isArray(data) ? data : (data?.items || data?.projects || []);
    const options = projects.map(p => `<option value="${esc(projectId(p))}">${esc(projectName(p))}</option>`).join("");
    $("#update-project").innerHTML = '<option value="">Select a project</option>' + options;
    const previous = $("#updates-project-filter").value;
    $("#updates-project-filter").innerHTML = '<option value="">All projects</option>' + options;
    $("#updates-project-filter").value = previous;
  }
  function render() {
    const filter = $("#updates-project-filter").value;
    const shown = updates.filter(u => !filter || String(u.projectId) === filter);
    $("#updates-rows").innerHTML = shown.length ? shown.map(u => {
      const id = u.id || u.updateId;
      const p = projects.find(x => projectId(x) === String(u.projectId));
      const status = u.status || (u.isPublished ? "Published" : "Draft");
      return `<tr><td><span class="support-ticket-title">${esc(u.title || "Untitled update")}</span><span class="support-ticket-ref">${esc((u.body || u.message || "").slice(0,100))}</span></td><td>${esc(p ? projectName(p) : u.projectName || "Project")}</td><td>${esc(u.category || "Development")}</td><td><span class="support-status" data-status="${esc(status)}">${esc(status)}</span></td><td>${esc(date(u.updatedAtUtc || u.publishedAtUtc || u.createdAtUtc))}</td><td><button class="button button-secondary button-small" type="button" data-edit-update="${esc(id)}">Edit</button> <button class="button button-secondary button-small" type="button" data-toggle-update="${esc(id)}" data-published="${String(status).toLowerCase()==="published"}">${String(status).toLowerCase()==="published"?"Unpublish":"Publish"}</button></td></tr>`;
    }).join("") : `<tr><td colspan="6" class="support-empty">${updates.length ? "No updates match this project." : "No updates found. Create a draft to get started."}</td></tr>`;
  }
  async function loadUpdates() {
    $("#updates-rows").innerHTML='<tr><td colspan="6" class="support-empty">Loading updates…</td></tr>';
    try {
      if (!projects.length) await loadProjects();
      // The API requires a valid projectId. Query each known project rather than
      // calling GET /project-updates without one, then merge the results.
      const results = await Promise.all(projects.map(async project => {
        const id = projectId(project);
        if (!id) return [];
        const data = await api.request(`/project-updates?projectId=${encodeURIComponent(id)}`);
        return Array.isArray(data) ? data : (data?.items || data?.updates || []);
      }));
      const byId = new Map();
      results.flat().forEach(update => {
        const id = update.id || update.updateId;
        if (id) byId.set(String(id), update);
      });
      updates = [...byId.values()];
      render();
      feedback(`Loaded ${updates.length} update${updates.length===1?"":"s"} across ${projects.length} project${projects.length===1?"":"s"}.`);
    } catch (e) {
      updates=[];
      render();
      feedback(`${e.message || "Could not load project updates."} Confirm the selected projects are available to your account and the project-updates API is deployed.`, true);
    }
  }
  function resetForm() {
    $("#update-form").reset(); $("#update-id").value=""; $("#update-status").value="Draft";
    $("#update-editor-heading").textContent="Compose development update";
    $("#update-editor-eyebrow").textContent="NEW UPDATE";
    $("#update-editor").hidden=true;
  }
  function editUpdate(u) {
    $("#update-id").value=u.id || u.updateId || "";
    $("#update-project").value=String(u.projectId || "");
    $("#update-title").value=u.title || "";
    $("#update-category").value=u.category || "Development";
    $("#update-status").value=u.status || (u.isPublished?"Published":"Draft");
    $("#update-body").value=u.body || u.message || u.description || "";
    $("#update-editor-heading").textContent="Edit development update";
    $("#update-editor-eyebrow").textContent="PROJECT UPDATE";
    $("#update-editor").hidden=false; $("#update-editor").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function save(status) {
    const projectIdValue=$("#update-project").value;
    const title=$("#update-title").value.trim();
    const body=$("#update-body").value.trim();
    const category=$("#update-category").value;
    if(!projectIdValue || !title || !body){feedback("Select a project and enter both a title and update details.",true);return;}
    const id=$("#update-id").value;
    const payload={projectId:projectIdValue,title,category,body,status};
    const submit=$("#update-form").querySelector('button[type="submit"]');
    submit.disabled=true;
    try {
      let savedId = id;
      if(!id) {
        const created = await api.request("/project-updates",{method:"POST",body:JSON.stringify({projectId:projectIdValue,title,body})});
        savedId = created?.id || created?.updateId || created?.update?.id || "";
        if (status === "Published") {
          if (!savedId) throw new Error("The API created the update but did not return its ID, so it could not be published.");
          await api.request(`/project-updates/${encodeURIComponent(savedId)}/publish`,{method:"POST"});
        }
      } else {
        await api.request(`/project-updates/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({title,body})});
        await api.request(`/project-updates/${encodeURIComponent(id)}/${status==="Published"?"publish":"unpublish"}`,{method:"POST"});
      }
      feedback(status==="Published"?"Update saved and published to the client portal.":"Draft saved.");
      resetForm(); await loadUpdates();
    } catch(e) {
      feedback(`${e.message || "Could not save the update."} Check that the project-updates API is deployed.`,true);
    } finally {submit.disabled=false;}
  }
  $("#update-new")?.addEventListener("click",()=>{resetForm();$("#update-editor").hidden=false;$("#update-editor").scrollIntoView({behavior:"smooth",block:"start"});});
  $("#update-cancel")?.addEventListener("click",resetForm);
  $("#update-save-draft")?.addEventListener("click",()=>save("Draft"));
  $("#update-form")?.addEventListener("submit",e=>{e.preventDefault();save($("#update-status").value);});
  $("#updates-refresh")?.addEventListener("click",async()=>{try{await loadProjects();await loadUpdates();}catch(e){feedback(e.message||"Unable to refresh projects.",true);}});
  $("#updates-project-filter")?.addEventListener("change",render);
  $("#updates-rows")?.addEventListener("click",async e=>{
    const edit=e.target.closest("[data-edit-update]");
    const toggle=e.target.closest("[data-toggle-update]");
    if(edit){const u=updates.find(x=>String(x.id||x.updateId)===edit.dataset.editUpdate);if(u)editUpdate(u);}
    if(toggle){
      toggle.disabled=true;
      try {await api.request(`/project-updates/${encodeURIComponent(toggle.dataset.toggleUpdate)}/${toggle.dataset.published==="true"?"unpublish":"publish"}`,{method:"POST"});feedback(toggle.dataset.published==="true"?"Update unpublished.":"Update published.");await loadUpdates();}
      catch(err){feedback(`${err.message||"Could not change publication status."} Check that the publishing endpoint is deployed.`,true);toggle.disabled=false;}
    }
  });
  document.querySelectorAll('[data-view="project-updates"]').forEach(el=>el.addEventListener("click",async()=>{try{await loadProjects();await loadUpdates();}catch(e){feedback(e.message||"Unable to load development updates.",true);}}));
  if(location.hash.replace("#","")==="project-updates") {loadProjects().then(loadUpdates).catch(e=>feedback(e.message||"Unable to load development updates.",true));}
})();
