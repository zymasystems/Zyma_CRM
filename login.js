(() => {
  const form = document.querySelector('#login-form');
  const message = document.querySelector('#login-message');
  const submit = document.querySelector('#login-submit');
  const password = document.querySelector('#password');
  const DEMO_USER_KEY = 'zymaCrmDemoUser';
  const DEMO_USERS_KEY = 'zymaCrmDemoEmployees';
  const demoAdmin = { id: 'demo-super-admin', name: 'Zyma Systems Admin', email: 'admin@zyma.co.za', role: 'super_admin', status: 'active' };
  const say = (text, type = '') => { message.textContent = text; message.className = `auth-message ${type}`.trim(); };
  document.querySelector('#toggle-password').addEventListener('click', () => {
    const reveal = password.type === 'password'; password.type = reveal ? 'text' : 'password';
    document.querySelector('#toggle-password').textContent = reveal ? 'Hide' : 'Show';
    document.querySelector('#toggle-password').setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); say('');
    if (!form.reportValidity()) return;
    submit.disabled = true; submit.querySelector('span').textContent = 'Signing in…';
    const email = document.querySelector('#email').value.trim().toLowerCase();
    try {
      // DEMO ONLY: credentials and session state are client-side until the API is built. Never deploy this as production authentication.
      if (email === 'admin@zyma.co.za' && password.value === 'Luck') {
        localStorage.setItem(DEMO_USER_KEY, JSON.stringify(demoAdmin));
        if (!localStorage.getItem(DEMO_USERS_KEY)) localStorage.setItem(DEMO_USERS_KEY, JSON.stringify([]));
        window.location.assign('workspace.html');
        return;
      }
      const demoEmployees = JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || '[]');
      const employee = demoEmployees.find(person => person.email.toLowerCase() === email && person.demoPassword === password.value && person.status === 'active');
      if (employee) {
        const { demoPassword, ...safeUser } = employee;
        localStorage.setItem(DEMO_USER_KEY, JSON.stringify(safeUser));
        window.location.assign('workspace.html');
        return;
      }
      say('Unable to sign in with those details. Please check your email and password and try again.');
    } catch (error) { say('Could not sign in. Please try again.'); }
    finally { submit.disabled = false; submit.querySelector('span').textContent = 'Sign in'; }
  });
})();
