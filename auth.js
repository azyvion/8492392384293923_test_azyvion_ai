// Handles Google sign-in (via Google Identity Services) and the resulting
// backend session. The backend issues a JWT after verifying the Google ID
// token; we keep that JWT in localStorage and attach it as a Bearer token
// on every authenticated request.
const AUTH_TOKEN_KEY = "azyvion_token";
const AUTH_API_BASE = (window.AZYVION_CONFIG && window.AZYVION_CONFIG.API_BASE_URL) || "";
const GOOGLE_CLIENT_ID = (window.AZYVION_CONFIG && window.AZYVION_CONFIG.GOOGLE_CLIENT_ID) || "";

window.Auth = (function () {
  let currentUser = null;

  function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  function setToken(token) {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  function getUser() {
    return currentUser;
  }

  function signOut() {
    setToken(null);
    currentUser = null;
    window.location.reload();
  }

  async function handleCredentialResponse(response) {
    const errEl = document.getElementById("authNote");
    try {
      const r = await fetch(`${AUTH_API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sign-in failed.");
      setToken(d.token);
      currentUser = d.user;
      document.dispatchEvent(new CustomEvent("azyvion:signedin", { detail: d.user }));
    } catch (e) {
      console.error(e);
      if (errEl) errEl.textContent = "Sign-in failed. Please try again.";
    }
  }

  async function tryRestoreSession() {
    const token = getToken();
    if (!token) return null;
    try {
      const r = await fetch(`${AUTH_API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("invalid session");
      const d = await r.json();
      currentUser = d.user;
      return currentUser;
    } catch {
      setToken(null);
      return null;
    }
  }

  // Renders the official Google button. Returns false if GIS hasn't loaded
  // yet or no Client ID is configured, so callers can retry.
  function initGoogleButton() {
    const note = document.getElementById("authNote");
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("your_google_oauth_client_id")) {
      if (note) note.textContent = "Google sign-in isn't configured for this deployment yet.";
      return false;
    }
    if (!window.google || !window.google.accounts) return false;

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    const el = document.getElementById("googleSignInButton");
    if (el) {
      el.innerHTML = "";
      google.accounts.id.renderButton(el, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "signin_with",
      });
    }
    return true;
  }

  function authedFetch(url, opts = {}) {
    const token = getToken();
    const headers = Object.assign({}, opts.headers, token ? { Authorization: `Bearer ${token}` } : {});
    return fetch(url, Object.assign({}, opts, { headers }));
  }

  return { getToken, setToken, getUser, signOut, tryRestoreSession, initGoogleButton, authedFetch };
})();
