(() => {
  'use strict';
  const API_BASE = String(window.ZYMA_CRM_CONFIG?.apiBaseUrl || 'https://api.zyma.co.za').replace(/\/$/, '');
  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body != null && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    // Account activation is a public invitation endpoint; it uses the token in
    // the request body, not browser cookies. Avoid credentialed CORS requests.
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'omit'
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = response.status === 204
      ? null
      : contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
      let detail = '';
      if (payload && typeof payload === 'object') {
        if (payload.errors && typeof payload.errors === 'object') {
          detail = Object.values(payload.errors).flat().join(' ');
        }
        detail = detail || payload.message || payload.title || '';
      } else if (typeof payload === 'string') {
        detail = payload;
      }
      const fallback = response.status === 400
        ? 'The invitation token or password was rejected. Request a fresh invitation if needed.'
        : response.status === 401 || response.status === 403
          ? 'This invitation is invalid, expired, or already used.'
          : response.status === 404
            ? 'The account activation service was not found.'
            : `Account request failed (HTTP ${response.status}).`;
      const error = new Error(detail || fallback);
      error.status = response.status;
      throw error;
    }
    return payload;
  };
  const message=(id,text,success=false)=>{const el=document.getElementById(id);if(el){el.textContent=text;el.classList.toggle('success',success);}};
  document.querySelectorAll('[data-toggle-password]').forEach(button=>button.addEventListener('click',()=>{const input=document.getElementById(button.dataset.togglePassword);if(!input)return;input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'Show':'Hide';}));
  const activation=document.getElementById('activate-account-form');
  if(activation) activation.addEventListener('submit',async event=>{
    event.preventDefault();if(!activation.reportValidity())return;
    const data=new FormData(activation),password=String(data.get('password')||''),confirm=String(data.get('confirmPassword')||''),token=new URLSearchParams(location.search).get('token')||'';
    if(!token){message('activation-message','This invitation link is missing its token. Ask your administrator to send a new invitation.');return;}
    if(password.length<12){message('activation-message','Use a password with at least 12 characters.');return;}
    if(password!==confirm){message('activation-message','The passwords do not match.');return;}
    const submit=activation.querySelector('[type="submit"]');submit.disabled=true;
    try{await api('/api/crm/auth/activate',{method:'POST',body:JSON.stringify({token,password})});message('activation-message','Your account is activated. You can now sign in.',true);activation.reset();setTimeout(()=>location.href='index.html',900);}
    catch(error){message('activation-message',error.message||'Account activation could not be completed.');}
    finally{submit.disabled=false;}
  });
  const reset=document.getElementById('crm-new-password-form');
  if(reset) reset.addEventListener('submit',async event=>{
    event.preventDefault();if(!reset.reportValidity())return;
    const data=new FormData(reset),password=String(data.get('password')||''),confirm=String(data.get('confirmPassword')||''),token=new URLSearchParams(location.search).get('token')||'';
    if(!token){message('crm-reset-message','This reset link is missing its token. Request a new password-reset link.');return;}
    if(password.length<12){message('crm-reset-message','Use a password with at least 12 characters.');return;}
    if(password!==confirm){message('crm-reset-message','The passwords do not match.');return;}
    const submit=reset.querySelector('[type="submit"]');submit.disabled=true;
    try{await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({token,password,audience:'crm'})});message('crm-reset-message','Your password has been updated. You can now sign in.',true);reset.reset();setTimeout(()=>location.href='index.html',900);}
    catch(error){message('crm-reset-message',error.message||'Password reset could not be completed.');}
    finally{submit.disabled=false;}
  });
})();