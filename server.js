import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { randomUUID } from "crypto";
import { db, initDb } from "./db.js";

initDb();

const app = express();
const port = process.env.PORT || 3000;

// If ALLOWED_ORIGINS is set (comma-separated), only those origins can call the
// API — set this to your GitHub Pages URL, e.g. https://yourname.github.io
// when the frontend and backend are hosted on different domains.
// Left unset, CORS is open (fine for local dev / testing).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors(
    allowedOrigins.length
      ? { origin: allowedOrigins }
      : { origin: true }
  )
);
app.use(express.json({ limit: "2mb" }));

// Serves the static frontend too, so `npm start` still gives you a full
// working app locally at http://localhost:3000 — the same /docs folder is
// what GitHub Pages serves independently in production.
app.use(express.static("docs"));

// Groq's API is OpenAI-compatible, so we reuse the same "openai" SDK —
// just pointed at Groq's endpoint with a Groq key. Free tier, no card
// required. Get a key at https://console.groq.com/keys
const client = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

// Set GROQ_MODEL in .env to change models. llama-3.3-70b-versatile is a
// solid free default; see https://console.groq.com/docs/models for others.
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are Azyvion AI, the official AI assistant prototype of Azyvion.
Be helpful, concise, intelligent, and natural.
Azyvion is an independent technology company exploring AI, digital platforms,
infrastructure, security, and research.
Do not invent Azyvion products, employees, partnerships, customers, or launches.
If asked about something Azyvion has not officially provided, say that it is not confirmed.`;

// ---------------------------------------------------------------------------
// Auth: Google Identity Services on the frontend hands us a Google ID token.
// We verify it server-side, upsert a user row, and issue our own short-lived
// JWT. The frontend stores that JWT and sends it as a Bearer token on every
// request — this avoids cross-site cookie headaches since the GitHub Pages
// frontend and the backend usually live on different domains.
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

if (!process.env.JWT_SECRET) {
  console.warn(
    "⚠️  JWT_SECRET is not set in .env — using an insecure default. Set a real random value before deploying."
  );
}

function signToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: "30d" });
}

function toPublicUser(user) {
  return { id: user.id, email: user.email, name: user.name, picture: user.picture };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.uid);
    if (!user) return res.status(401).json({ error: "Not authenticated." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired, please sign in again." });
  }
}

app.get("/api/status", (_req, res) => {
  res.json({ configured: Boolean(client), googleConfigured: Boolean(googleClient) });
});

app.post("/api/auth/google", async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(503).json({ error: "Google sign-in is not configured on the server." });
    }
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: "Missing credential." });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email || "";
    const name = payload.name || email;
    const picture = payload.picture || "";

    let user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId);
    if (!user) {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO users (id, google_id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, googleId, email, name, picture, Date.now());
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    } else {
      db.prepare("UPDATE users SET name = ?, picture = ?, email = ? WHERE id = ?").run(
        name,
        picture,
        email,
        user.id
      );
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    }

    const token = signToken(user);
    res.json({ token, user: toPublicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: "Google sign-in failed." });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
app.get("/api/conversations", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC")
    .all(req.user.id);
  res.json({ conversations: rows });
});

app.get("/api/conversations/:id", requireAuth, (req, res) => {
  const convo = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!convo) return res.status(404).json({ error: "Conversation not found." });
  const rows = db
    .prepare("SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(convo.id);
  res.json({ conversation: { id: convo.id, title: convo.title }, messages: rows });
});

app.patch("/api/conversations/:id", requireAuth, (req, res) => {
  const convo = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!convo) return res.status(404).json({ error: "Conversation not found." });
  const title = String((req.body && req.body.title) || "").trim().slice(0, 80);
  if (!title) return res.status(400).json({ error: "Title required." });
  db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, convo.id);
  res.json({ ok: true });
});

app.delete("/api/conversations/:id", requireAuth, (req, res) => {
  const convo = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!convo) return res.status(404).json({ error: "Conversation not found." });
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(convo.id);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(convo.id);
  res.json({ ok: true });
});

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    if (!client) {
      return res
        .status(503)
        .json({ error: "Azyvion AI is not configured yet. Add GROQ_API_KEY to .env." });
    }

    const text = typeof req.body.message === "string" ? req.body.message.trim().slice(0, 12000) : "";
    if (!text) return res.status(400).json({ error: "No message provided." });

    let conversationId = req.body.conversationId || null;
    let convo = conversationId
      ? db.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?").get(conversationId, req.user.id)
      : null;

    const now = Date.now();
    if (!convo) {
      conversationId = randomUUID();
      db.prepare(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).run(conversationId, req.user.id, text.slice(0, 60), now, now);
    }

    db.prepare(
      "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)"
    ).run(conversationId, text, now);

    const history = db
      .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(conversationId)
      .slice(-20);

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
    });

    const replyText = completion.choices?.[0]?.message?.content || "I couldn't generate a response.";
    const replyTime = Date.now();
    db.prepare(
      "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)"
    ).run(conversationId, replyText, replyTime);
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(replyTime, conversationId);

    res.json({ text: replyText, conversationId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Something went wrong while generating the response." });
  }
});

app.listen(port, () => {
  console.log(`Azyvion AI: http://localhost:${port}`);
});
