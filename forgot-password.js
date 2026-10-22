(() => {
  const form = document.querySelector('#forgot-form');
  const emailInput = document.querySelector('#email');
  const message = document.querySelector('#forgot-message');
  const submit = document.querySelector('#forgot-submit');
  const API_BASE = String(window.ZYMA_CRM_CONFIG?.apiBaseUrl || 'https://api.zyma.co.za').replace(/\/$/, '');
  const say = (text, type = '') => { message.textContent = text; message.className = `auth-message ${type}`.trim(); };
  form.addEventListener('submit', async event => {
    event.preventDefault(); say('');
    if (!form.reportValidity()) return;
    submit.disabled = true; submit.querySelector('span').textContent = 'Sending…';
    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value.trim() })
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error('Password recovery is not connected yet. Please contact your Zyma Systems Super Admin.');
        throw new Error('We could not process the request right now. Please try again later.');
      }
      say('If an eligible account exists for that email, password-reset instructions will be sent. Check your inbox and spam folder.', 'success');
      form.reset();
    } catch (error) {
      say(error.message || 'We could not process the request right now. Please try again later.');
    } finally {
      submit.disabled = false; submit.querySelector('span').textContent = 'Send reset link';
    }
  });
})();
