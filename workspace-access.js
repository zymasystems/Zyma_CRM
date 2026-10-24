/* Display identity from the API-authenticated browser session. API authorization remains server-side. */
(() => {
  const adminLink = document.querySelector('#employee-management-link');
  const portalPreviewLink = document.querySelector('#client-portal-link');
  const adminLabel = document.querySelector('#admin-nav-label');
  const currentKey = 'zymaCrmAuthenticatedUser';
  const labels = { super_admin: 'Super Admin', employee: 'Employee', sales: 'Sales & Client Relations', project_manager: 'Project Manager', viewer: 'Read-only' };
  const initialsFor = value => String(value || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  const displayNameFor = user => {
    const suppliedName = String(user?.name || '').trim();
    if (suppliedName) return suppliedName;
    const username = String(user?.username || user?.userName || user?.email || '').split('@')[0].trim();
    return username || 'User';
  };
  function hydrate(user) {
    if (!user) return;
    const displayName = displayNameFor(user);
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
    const user = JSON.parse(sessionStorage.getItem(currentKey) || 'null');
    if (user) { hydrate(user); return; }
  } catch (_) {}
  // No client-side identity fallback: sign in through the API to establish a session.
})();
