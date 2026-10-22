(() => {
  const $ = selector => document.querySelector(selector);
  const rows = $('#employee-rows'), message = $('#employee-message'), modal = $('#employee-modal'), form = $('#employee-form'), save = $('#save-employee');
  const USERS_KEY = 'zymaCrmDemoEmployees', CURRENT_KEY = 'zymaCrmDemoUser';
  let employees = [];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const roleNames = {super_admin:'Super admin', employee:'Employee', sales:'Sales & client relations', project_manager:'Project manager', viewer:'Read-only'};
  const notify = (target, text, type='') => { target.textContent = text; target.className = `auth-message ${type}`.trim(); };
  function getCurrentUser() { try { return JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null'); } catch (_) { return null; } }
  function loadStored() { try { employees = JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); if (!Array.isArray(employees)) employees = []; } catch (_) { employees = []; } }
  function saveStored() { localStorage.setItem(USERS_KEY, JSON.stringify(employees)); }
  function render() {
    const query = $('#employee-search').value.trim().toLowerCase();
    const filtered = employees.filter(person => `${person.name} ${person.email} ${roleNames[person.role]||person.role}`.toLowerCase().includes(query));
    $('#employee-count').textContent = employees.length;
    $('#active-count').textContent = employees.filter(person => person.status === 'active').length;
    $('#pending-count').textContent = employees.filter(person => person.status === 'invited').length;
    if (!filtered.length) { rows.innerHTML = `<tr><td colspan="5" class="empty-cell">${query ? 'No employees match your search.' : 'No employee accounts have been added yet. Use Add employee to create an account.'}</td></tr>`; return; }
    rows.innerHTML = filtered.map(person => `<tr><td><span class="employee-name">${escapeHtml(person.name)}</span><span class="employee-email">${escapeHtml(person.email)}</span></td><td>${escapeHtml(roleNames[person.role]||person.role||'Employee')}</td><td><span class="status-pill ${escapeHtml(person.status)}">${escapeHtml(person.status === 'active' ? 'Active' : person.status === 'invited' ? 'Invitation pending' : person.status === 'disabled' ? 'Disabled' : person.status||'Unknown')}</span></td><td>${escapeHtml(person.lastActiveAt ? new Date(person.lastActiveAt).toLocaleDateString() : '—')}</td><td><div class="row-actions">${`<button type="button" data-action="resend" data-id="${escapeHtml(person.id)}">Resend invitation</button><button type="button" data-action="toggle" data-id="${escapeHtml(person.id)}" data-status="${escapeHtml(person.status)}">${person.status === 'disabled' ? 'Enable' : 'Disable'}</button>`}</div></td></tr>`).join('');
  }
  function openModal() { modal.hidden = false; document.body.style.overflow='hidden'; $('#employee-name').focus(); }
  function closeModal() { modal.hidden = true; document.body.style.overflow=''; form.reset(); notify($('#employee-form-message'),''); }
  const current = getCurrentUser();
  if (!current || current.role !== 'super_admin') { window.location.assign('workspace.html'); return; }
  $('#admin-identity').textContent = current.email || 'Demo Super Admin';
  loadStored(); render();
  $('#open-add').addEventListener('click', openModal); $('#close-add').addEventListener('click', closeModal); $('#cancel-add').addEventListener('click', closeModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
  $('#employee-search').addEventListener('input', render);
  $('#sign-out').addEventListener('click', () => { localStorage.removeItem(CURRENT_KEY); window.location.assign('index.html'); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const email = $('#employee-email').value.trim().toLowerCase();
    if (email === 'admin@zyma.co.za' || employees.some(person => person.email.toLowerCase() === email)) { notify($('#employee-form-message'), 'An account with this email already exists.'); return; }
    save.disabled = true; save.textContent = 'Creating…';
    const status = $('#employee-status').value;
    const employee = { id: `demo-${Date.now()}`, name: $('#employee-name').value.trim(), email, role: $('#employee-role').value, status, lastActiveAt: null, demoPassword: 'Luck' };
    employees.push(employee); saveStored(); render(); closeModal();
    notify(message, status === 'invited' ? 'Invitation recorded locally. Email delivery requires backend integration.' : 'Employee account created. Password setup and email invitations require backend integration.', 'success');
    save.disabled = false; save.textContent = 'Create invitation';
  });
  rows.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const person = employees.find(item => item.id === button.dataset.id); if (!person) return;
    if (button.dataset.action === 'resend') { notify(message, `Demo only: no invitation email was sent to ${person.email}.`, 'success'); return; }
    if (button.dataset.action === 'toggle') { person.status = person.status === 'disabled' ? 'active' : 'disabled'; saveStored(); render(); notify(message, `Employee access ${person.status}.`, 'success'); }
  });
})();
