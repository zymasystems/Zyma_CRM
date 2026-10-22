(() => {
  "use strict";

  const API_BASE_URL = "https://api.zyma.co.za/api/crm";
  const TOKEN_KEY = "zymaCrmAccessToken";
  const USER_KEY = "zymaCrmAuthenticatedUser";
  const form = document.querySelector("#login-form");
  const message = document.querySelector("#login-message");
  const submit = document.querySelector("#login-submit");
  const password = document.querySelector("#password");
  const emailInput = document.querySelector("#email");

  const say = (text, type = "") => {
    message.textContent = text;
    message.className = `auth-message ${type}`.trim();
  };

  document.querySelector("#toggle-password").addEventListener("click", () => {
    const reveal = password.type === "password";
    password.type = reveal ? "text" : "password";
    document.querySelector("#toggle-password").textContent = reveal ? "Hide" : "Show";
    document.querySelector("#toggle-password").setAttribute(
      "aria-label", reveal ? "Hide password" : "Show password"
    );
  });

  function decodeJwtPayload(token) {
    const part = token.split(".")[1];
    if (!part) throw new Error("The server returned an invalid access token.");
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function normalizeRole(payload) {
    const role = payload.role ||
      payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
      "employee";
    const normalized = String(role).toLowerCase();
    if (normalized === "admin" || normalized === "super_admin" || normalized === "superadmin") {
      return "super_admin";
    }
    if (["sales", "project_manager", "viewer", "employee"].includes(normalized)) return normalized;
    return "employee";
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    say("");
    if (!form.reportValidity()) return;

    submit.disabled = true;
    submit.querySelector("span").textContent = "Signing in…";

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          email: emailInput.value.trim().toLowerCase(),
          password: password.value
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const serverMessage = result.message || result.title;
        if (response.status === 401) {
          throw new Error("Unable to sign in with those details. Check your email and password.");
        }
        throw new Error(serverMessage || `Sign-in failed (HTTP ${response.status}).`);
      }

      const token = result.accessToken;
      if (typeof token !== "string" || !token) {
        throw new Error("The API did not return an access token. Please contact the administrator.");
      }

      const claims = decodeJwtPayload(token);
      const email = claims.email || emailInput.value.trim().toLowerCase();
      const user = {
        id: claims.sub || "",
        email,
        name: claims.name || email,
        role: normalizeRole(claims),
        status: "active"
      };

      // Session storage limits token persistence to this browser tab's session.
      // This is still JavaScript-accessible; prevent XSS and never treat it as server-side authorization.
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      password.value = "";
      window.location.assign("workspace.html");
    } catch (error) {
      say(error instanceof TypeError
        ? "Could not connect to the CRM API. Check your connection and try again."
        : (error.message || "Could not sign in. Please try again."));
    } finally {
      submit.disabled = false;
      submit.querySelector("span").textContent = "Sign in";
    }
  });
})();
