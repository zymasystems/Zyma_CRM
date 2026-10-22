/* Authenticated request helper for the Zyma CRM API. Only use implemented API routes. */
(() => {
  "use strict";
  const API_BASE_URL = "https://api.zyma.co.za/api/crm";
  const TOKEN_KEY = "zymaCrmAccessToken";
  const USER_KEY = "zymaCrmAuthenticatedUser";

  async function request(path, options = {}) {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
      throw new TypeError("API path must be an absolute path within the CRM API.");
    }
    const token = sessionStorage.getItem(TOKEN_KEY);
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: "omit"
    });
    if (response.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      if (!window.location.pathname.endsWith("/index.html") && window.location.pathname !== "/") {
        window.location.replace("index.html?reason=expired");
      }
      throw new Error("Your CRM session is invalid or has expired. Please sign in again.");
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = response.status === 204
      ? null
      : contentType.includes("application/json")
        ? await response.json()
        : await response.text();

    if (!response.ok) {
      const message = payload && typeof payload === "object"
        ? payload.message || payload.title || `CRM API request failed (${response.status}).`
        : (payload || `CRM API request failed (${response.status}).`);
      throw new Error(message);
    }
    return payload;
  }

  window.ZymaCrmApi = Object.freeze({
    baseUrl: API_BASE_URL,
    request,
    getToken: () => sessionStorage.getItem(TOKEN_KEY),
    getUser: () => {
      try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); }
      catch (_) { return null; }
    }
  });
})();
