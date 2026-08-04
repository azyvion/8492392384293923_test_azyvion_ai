# Azyvion AI — MVP

Azyvion-branded chat UI with streaming responses, conversation history, image
attachments, and a server-side API key.

## Why two parts

GitHub Pages only serves static files — it can't run Node.js or keep an API
key secret. So this project is split:

- **`/docs`** — the static frontend. This is what you deploy to GitHub Pages.
- **`server.js`** (root) — the Express backend that talks to Groq. This
  needs a real Node host (Render, Railway, Fly.io, a VPS, etc.) — anywhere
  that runs a persistent Node process and lets you set environment
  variables.

They talk to each other over HTTP; `docs/config.js` is where the frontend is
told where the backend lives.

## Run everything locally (frontend + backend together)

1. Install Node.js 20+.
2. `npm install`
3. Copy `.env.example` to `.env` and add `GROQ_API_KEY=...` (free, no card
   required — get one at https://console.groq.com/keys).
4. `npm start`
5. Open `http://localhost:3000` — `server.js` serves `/docs` itself, so this
   works standalone with no extra config. Leave `API_BASE_URL` in
   `docs/config.js` as `""`.

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
   - Environment variables — see `.env.example` for the full list.
     `GROQ_API_KEY` is required; `ALLOWED_ORIGINS` is **strongly**
     recommended once you're not just testing (see Production checklist
     below).
2. Copy the URL your host gives you (e.g. `https://azyvion-ai.onrender.com`).
3. Edit `docs/config.js`:
   ```js
   window.AZYVION_CONFIG = {
     API_BASE_URL: "https://azyvion-ai.onrender.com",
   };
   ```
4. Commit and push — GitHub Pages picks up the change automatically.

## Production checklist

This project starts life as a demo/MVP. Before sharing the link widely,
close these out:

- [ ] **`ALLOWED_ORIGINS` set** on your host to your GitHub Pages URL. Left
      empty, any website can call your `/api/chat` and spend your Groq
      quota. The server logs a warning on boot if this is unset.
- [ ] **Rate limits tuned** (`RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY`
      in `.env`) — defaults are 20/min and 200/day per IP, meant for a
      small personal deployment, not high traffic.
- [ ] **Groq account limits checked** at
      https://console.groq.com/settings/limits — the free tier has its own
      requests-per-minute/day ceiling independent of the app's own limits.
- [ ] **Decide on access control.** The chat is public to anyone with the
      link by default. Fine for a demo; add a captcha, invite code, or login
      if this represents Azyvion publicly and you want to control who can
      use it.
- [ ] **Know the vision model is a preview.** `qwen/qwen3.6-27b` (image
      understanding) is marked "preview" by Groq, meaning it can change or
      be retired with less notice than stable models. Not a blocker, just
      don't treat it as a permanent guarantee.
- [ ] **Monitor deprecations.** Groq retires models with a few weeks'
      notice via email + https://console.groq.com/docs/deprecations. Worth
      a periodic check so `GROQ_MODEL/GROQ_VISION_MODEL` don't go stale.

## Project structure

```
azyvion-ai/
├── docs/              # Static frontend — served by GitHub Pages
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── config.js      # Points the frontend at the backend URL
│   ├── logo.png
│   └── favicon.ico
├── server.js           # Express backend — deploy separately
├── package.json
├── .env.example
└── .gitignore
```

## Notes

- Never expose `GROQ_API_KEY` in frontend code or commit `.env` — it's
  already listed in `.gitignore`.
- `GROQ_MODEL` / `GROQ_VISION_MODEL` in `.env` let you change models without
  touching code — see `.env.example` for current defaults and docs links.
- `ALLOWED_ORIGINS` restricts which domains may call `/api/chat` — set it
  once you know your GitHub Pages URL so random sites can't ride on your key.
- `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY` cap how many messages a
  single IP can send, protecting your Groq quota from abuse or runaway
  scripts.
