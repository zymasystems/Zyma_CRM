/* Frontend navigation guard. API endpoints must still enforce authorization server-side. */
(() => {
  const TOKEN_KEY = "zymaCrmAccessToken";
  const USER_KEY = "zymaCrmAuthenticatedUser";
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    sessionStorage.removeItem(USER_KEY);
    const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    window.location.replace(`index.html?next=${next}`);
    return;
  }
  try {
    const part = token.split(".")[1];
    if (!part) throw new Error("Malformed token");
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0))));
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      window.location.replace("index.html?reason=expired");
    }
  } catch (_) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.replace("index.html?reason=invalid");
  }
})();
