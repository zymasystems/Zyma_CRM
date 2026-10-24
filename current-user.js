/* Populate shared profile labels from the API-authenticated browser session. */
(() => {
  let user;
  const displayNameFor = value => {
    const suppliedName = String(value?.name || '').trim();
    if (suppliedName) return suppliedName;
    const username = String(value?.username || value?.userName || value?.email || '').split('@')[0].trim();
    return username || 'User';
  };
  try { user = JSON.parse(sessionStorage.getItem('zymaCrmAuthenticatedUser') || 'null'); } catch (_) { user = null; }
  if (!user) return;
  const name = displayNameFor(user);
  const firstName = name.trim().split(/\s+/)[0];
  const roles = { super_admin: 'Super Admin', employee: 'Employee', sales: 'Sales & Client Relations', project_manager: 'Project Manager', viewer: 'Read-only' };
  const role = roles[user.role] || user.role || 'User';
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  document.querySelectorAll('.sidebar-user .user-copy strong, .profile-button .profile-copy strong').forEach(el => { el.textContent = name; });
  document.querySelectorAll('.sidebar-user .user-copy small, .profile-button .profile-copy small').forEach(el => { el.textContent = role; });
  document.querySelectorAll('.sidebar-user .avatar, .profile-button .avatar').forEach(el => { el.textContent = initials; });
  document.querySelectorAll('.profile-button').forEach(el => { el.title = `${name} (${user.email || 'signed in'})`; });
  const greeting = document.querySelector('#dashboard-greeting');
  if (greeting) {
    const hour = Number(new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const wave = document.createElement('span'); wave.className = 'wave'; wave.textContent = '✳';
    greeting.replaceChildren(document.createTextNode(`${salutation}, ${firstName} `), wave);
  }
})();
