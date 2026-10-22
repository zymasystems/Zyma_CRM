(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const API_BASE = String(window.ZYMA_CRM_CONFIG?.apiBaseUrl || 'https://api.zyma.co.za').replace(/\/$/, '');
  const STORAGE_KEY = 'zyma-crm-preview-v2';
  const query = new URLSearchParams(location.search);
  const clientId = query.get('clientId') || '';
  let client = null;
  try {
    const snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    client = (Array.isArray(snapshot.clients) ? snapshot.clients : []).find(item => String(item.id) === clientId) || null;
  } catch (_) {}
  if (client) { $('#invite-client-name').value = client.name || ''; $('#invite-client-id').value = client.id; }
  else {
    $('#invite-client-name').value = 'Client not found';
    $('#invite-message').textContent = 'Open a client record in the CRM and choose “Invite client to portal”.';
    $('#client-invite-form [type="submit"]').disabled = true;
  }
  $('#client-invite-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || !client) return;
    const data = new FormData(form), submit = form.querySelector('[type="submit"]');
    submit.disabled = true; submit.querySelector('span').textContent = 'Sending…'; $('#invite-message').textContent = '';
    try {
      const response = await fetch(`${API_BASE}/api/invitations`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify({
        organizationId: client.id, organizationName: client.name, name:String(data.get('name')||'').trim(),
        email:String(data.get('email')||'').trim().toLowerCase(), role:String(data.get('role')||'client_user'),
        returnUrl:'https://portal.zyma.co.za/client-register.html'
      }) });
      if (!response.ok) throw new Error(response.status===404?'Client invitations are not connected yet. The shared API and email service must be implemented first.':'The invitation could not be sent. Check your access and try again.');
      $('#invite-message').textContent = 'Invitation sent. The client can use the secure link in their email to activate their account.';
      $('#invite-message').classList.add('success'); form.reset(); $('#invite-client-name').value=client.name; $('#invite-client-id').value=client.id;
    } catch(error) { $('#invite-message').textContent=error.message||'The invitation could not be sent.'; }
    finally { submit.disabled=false; submit.querySelector('span').textContent='Send invitation'; }
  });
})();