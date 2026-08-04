# Azyvion AI — MVP

Azyvion-branded chat UI with Google sign-in, saved conversation history, and
a server-side API key.

## Why two parts

GitHub Pages only serves static files — it can't run Node.js or keep an API
key secret. So this project is split:

- **`/docs`** — the static frontend. This is what you deploy to GitHub Pages.
- **`server.js`** (root) — the Express backend that talks to Groq, verifies
  Google sign-in, and stores conversations in SQLite. This needs a real
  Node host (Render, Railway, Fly.io, a VPS, etc.) — anywhere that runs a
  persistent Node process and lets you set environment variables.

They talk to each other over HTTP; `docs/config.js` is where the frontend is
told where the backend lives.

## Set up Google sign-in

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth client ID** → Application type: **Web application**.
3. Under **Authorized JavaScript origins**, add every origin the frontend
   will be served from, e.g. `http://localhost:3000` and
   `https://yourname.github.io`.
4. Copy the generated Client ID. You'll use the same value in two places:
   - `docs/config.js` → `GOOGLE_CLIENT_ID` (safe to expose — it's public)
   - the backend's `.env` → `GOOGLE_CLIENT_ID` (used to verify tokens)

## Run everything locally (frontend + backend together)

1. Install Node.js 20+.
2. `npm install`
3. Copy `.env.example` to `.env` and fill in:
   - `GROQ_API_KEY` — get one free at https://console.groq.com/keys
   - `GOOGLE_CLIENT_ID` — from the step above
   - `JWT_SECRET` — any long random string (e.g. `openssl rand -hex 32`)
4. Also paste your `GOOGLE_CLIENT_ID` into `docs/config.js`.
5. `npm start`
6. Open `http://localhost:3000` — `server.js` serves `/docs` itself, so this
   works standalone with no extra config. Leave `API_BASE_URL` in
   `docs/config.js` as `""`.

Conversations are stored in a local SQLite file at `data/azyvion.db`
(auto-created, already in `.gitignore`).

## Deploy the frontend to GitHub Pages

1. Push this repo to GitHub.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch:
   `main`, folder: **`/docs`** → Save.
3. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

On its own this gives you a working UI in **demo mode**: it loads, looks
right, and replies with a message explaining no backend is connected yet —
it won't silently break or hang on "Checking system".

## Connect a live backend to the GitHub Pages site

1. Deploy `server.js` to a Node host (Render, Railway, Fly.io, etc.):
   - Build/start command: `npm install && npm start`
   - Environment variables: `GROQ_API_KEY` (required), `GROQ_MODEL`
     (optional), `GOOGLE_CLIENT_ID` (required for sign-in), `JWT_SECRET`
     (required), `ALLOWED_ORIGINS` (recommended — set it to your GitHub
     Pages URL, e.g. `https://yourname.github.io`)
   - If your host supports a **persistent disk/volume**, mount it and point
     `DB_PATH` at a file inside it — otherwise the SQLite database resets
     on every redeploy (fine for testing, not for production).
2. Copy the URL your host gives you (e.g. `https://azyvion-ai.onrender.com`).
3. Edit `docs/config.js`:
   ```js
   window.AZYVION_CONFIG = {
     API_BASE_URL: "https://azyvion-ai.onrender.com",
     GOOGLE_CLIENT_ID: "xxxxxxxx.apps.googleusercontent.com",
   };
   ```
4. Commit and push — GitHub Pages picks up the change automatically.

## Project structure

```
azyvion-ai/
├── docs/              # Static frontend — served by GitHub Pages
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── auth.js         # Google sign-in + session handling
│   ├── config.js       # Points the frontend at the backend URL + Google Client ID
│   ├── logo.png
│   └── favicon.ico
├── server.js            # Express backend — deploy separately
├── db.js                # SQLite setup (users, conversations, messages)
├── package.json
├── .env.example
└── .gitignore
```

## How auth + persistence work

- The frontend renders Google's official "Sign in with Google" button
  (Google Identity Services). On success it gets a Google ID token.
- The backend verifies that token with Google, creates/updates a `users`
  row, and issues its own signed session token (JWT), valid 30 days.
- The frontend stores that JWT in `localStorage` and sends it as
  `Authorization: Bearer <token>` on every request — no cookies involved,
  which keeps things simple across the GitHub Pages ↔ backend domain split.
- Every message is saved to SQLite (`conversations` + `messages` tables) as
  it's sent, so refreshing or coming back later restores the sidebar and
  chat history.
- Users can also **"Continue without signing in"** — that's a local-only
  guest mode where nothing is saved (no login required, no backend calls
  beyond the chat itself... actually in this mode messages aren't sent to
  the backend at all, to avoid guest data ending up unowned in the database).

## Notes

- Never expose `GROQ_API_KEY`, `JWT_SECRET`, or commit `.env` — it's
  already listed in `.gitignore`. (`GOOGLE_CLIENT_ID` is the only credential
  that's safe to expose publicly.)
- `GROQ_MODEL` in `.env` lets you change models without touching code;
  see https://console.groq.com/docs/models for options.
- `ALLOWED_ORIGINS` restricts which domains may call the API — set it once
  you know your GitHub Pages URL so random sites can't ride on your key.
- SQLite is great for an MVP but is a single file — for real production
  scale (multiple server instances, high write volume) migrate to Postgres.
