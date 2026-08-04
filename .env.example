import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

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
app.use(express.json({ limit: "20mb" })); // room for a few compressed base64 images per request

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

// Set GROQ_MODEL in .env to change models. llama-3.3-70b-versatile was
// deprecated by Groq on 2026-06-17; openai/gpt-oss-120b is the current
// recommended general-purpose default. See https://console.groq.com/docs/models
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Used automatically whenever a message includes an image. Set
// GROQ_VISION_MODEL in .env to override. See https://console.groq.com/docs/vision
const VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";
const MAX_IMAGES_PER_REQUEST = 5; // Groq's current vision model limit

const SYSTEM_PROMPT = `You are Azyvion AI, the official AI assistant prototype of Azyvion.
Be helpful, concise, intelligent, and natural.
Azyvion is an independent technology company exploring AI, digital platforms,
infrastructure, security, and research.
Do not invent Azyvion products, employees, partnerships, customers, or launches.
If asked about something Azyvion has not officially provided, say that it is not confirmed.`;

app.get("/api/status", (_req, res) => {
  res.json({ configured: Boolean(client) });
});

// Streams the reply as Server-Sent Events so the frontend can render tokens
// as they arrive instead of waiting for the full completion.
app.post("/api/chat", async (req, res) => {
  if (!client) {
    return res
      .status(503)
      .json({ error: "Azyvion AI is not configured yet. Add GROQ_API_KEY to .env." });
  }

  const rawMessages = Array.isArray(req.body.messages) ? req.body.messages : [];

  // Normalizes both plain-string content and OpenAI-style multimodal arrays
  // ({type:"text"} / {type:"image_url"}) into a safe, size-capped shape.
  function cleanContent(content) {
    if (typeof content === "string") {
      const text = content.trim();
      return text ? text.slice(0, 12000) : null;
    }
    if (Array.isArray(content)) {
      const parts = [];
      for (const p of content) {
        if (!p || typeof p !== "object") continue;
        if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
          parts.push({ type: "text", text: p.text.slice(0, 12000) });
        } else if (
          p.type === "image_url" &&
          p.image_url &&
          typeof p.image_url.url === "string" &&
          p.image_url.url.startsWith("data:image/")
        ) {
          parts.push({ type: "image_url", image_url: { url: p.image_url.url } });
        }
      }
      return parts.length ? parts : null;
    }
    return null;
  }

  let cleaned = rawMessages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-20)
    .map((m) => ({ role: m.role, content: cleanContent(m.content) }))
    .filter((m) => m.content !== null);

  if (!cleaned.length) {
    return res.status(400).json({ error: "No valid message content was provided." });
  }

  // Groq's vision model caps a request at 5 images total. Keep images only
  // on the most recent user turn (older turns keep their text, so context
  // isn't lost) so long conversations with several image messages never
  // exceed the limit.
  const lastImgIdx = cleaned.map((m) => Array.isArray(m.content)).lastIndexOf(true);
  cleaned = cleaned.map((m, i) => {
    if (!Array.isArray(m.content) || i === lastImgIdx) return m;
    const textOnly = m.content.filter((p) => p.type === "text");
    return { role: m.role, content: textOnly.length ? textOnly : "[imagen adjunta]" };
  });
  if (lastImgIdx !== -1) {
    const imgs = cleaned[lastImgIdx].content.filter((p) => p.type === "image_url");
    if (imgs.length > MAX_IMAGES_PER_REQUEST) {
      const text = cleaned[lastImgIdx].content.filter((p) => p.type === "text");
      cleaned[lastImgIdx].content = [...text, ...imgs.slice(0, MAX_IMAGES_PER_REQUEST)];
    }
  }

  const hasImages = cleaned.some((m) => Array.isArray(m.content));
  const model = hasImages ? VISION_MODEL : MODEL;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disables proxy buffering (e.g. on Render/Nginx) so chunks flush immediately
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...cleaned],
      stream: true,
    });

    let full = "";
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta) {
        full += delta;
        send("delta", { text: delta });
      }
    }

    if (!full) send("delta", { text: "I couldn't generate a response." });
    send("done", {});
  } catch (e) {
    console.error(e);
    send("error", { error: "Something went wrong while generating the response." });
  } finally {
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Azyvion AI: http://localhost:${port}`);
});
