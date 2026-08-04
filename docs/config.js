// Where the Azyvion AI backend (server.js) is deployed, and the public
// Google OAuth Client ID for the sign-in button (safe to expose — it's not
// a secret, it just identifies your app to Google).
//
// - Running locally with `npm start`, or hosting server.js somewhere that
//   also serves this /docs folder: leave API_BASE_URL as "" (same origin).
// - Hosting this frontend on GitHub Pages with the backend deployed
//   separately (Render, Railway, Fly.io, etc.): set API_BASE_URL to that
//   backend's full URL, e.g. "https://azyvion-ai.onrender.com" (no
//   trailing slash).
//
// GOOGLE_CLIENT_ID must match the GOOGLE_CLIENT_ID set in the backend's
// .env — get one at https://console.cloud.google.com/apis/credentials

window.AZYVION_CONFIG = {
  API_BASE_URL: "https://azyvion-ai.onrender.com", // o donde tengas el backend
  GOOGLE_CLIENT_ID: "194566142436-07pven8a6uh0clmgcqphcoquhkppekjl.apps.googleusercontent.com",
};
