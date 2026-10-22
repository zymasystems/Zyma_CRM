/* Demo identity display. Backend authentication will replace this client-side preview. */
(() => {
  const adminLink = document.querySelector('#employee-management-link');
  const portalPreviewLink = document.querySelector('#client-portal-link');
  const adminLabel = document.querySelector('#admin-nav-label');
  const currentKey = 'zymaCrmDemoUser';
  const labels = { super_admin: 'Super Admin', employee: 'Employee', sales: 'Sales & Client Relations', project_manager: 'Project Manager', viewer: 'Read-only' };
  const initialsFor = value => String(value || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  function hydrate(user) {
    if (!user) return;
    const displayName = user.name || user.email || 'User';
    const firstName = displayName.trim().split(/\s+/)[0];
    document.querySelectorAll('.sidebar-user .user-copy strong').forEach(el => { el.textContent = displayName; });
    document.querySelectorAll('.sidebar-user .user-copy small').forEach(el => { el.textContent = labels[user.role] || user.role || 'User'; });
    document.querySelectorAll('.sidebar-user .avatar, .profile-button .avatar').forEach(el => { el.textContent = initialsFor(displayName); el.setAttribute('aria-label', displayName); });
    document.querySelectorAll('.profile-button .profile-copy strong').forEach(el => { el.textContent = displayName; });
    document.querySelectorAll('.profile-button .profile-copy small').forEach(el => { el.textContent = labels[user.role] || 'Zyma Systems'; });
    document.querySelectorAll('.profile-button').forEach(el => { el.title = `${displayName} (${user.email || 'signed in'})`; });
    const greeting = document.querySelector('#dashboard-greeting');
    if (greeting) {
      const hour = Number(new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
      const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      const wave = document.createElement('span'); wave.className = 'wave'; wave.textContent = '✳';
      greeting.replaceChildren(document.createTextNode(`${salutation}, ${firstName} `), wave);
    }
    if (user.email) document.querySelectorAll('.sidebar-user .user-copy strong').forEach(el => el.title = user.email);
    if (user.role === 'super_admin') { if (adminLink) adminLink.hidden = false; if (portalPreviewLink) portalPreviewLink.hidden = false; if (adminLabel) adminLabel.hidden = false; }
  }
  try {
    const user = JSON.parse(localStorage.getItem(currentKey) || 'null');
    if (user) { hydrate(user); return; }
  } catch (_) {}
  // Optional backend fallback for when API authentication is added.
  fetch('/api/auth/me', { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : null)
    .then(result => { if (result) hydrate(result.user || result); })
    .catch(() => {});
})();
