const API_BASE = (window.AZYVION_CONFIG && window.AZYVION_CONFIG.API_BASE_URL) || "";
const STORAGE_KEY = "azyvion_ai_chats_v1";

const appEl = document.querySelector(".app"),
  menuToggle = document.getElementById("menuToggle"),
  scrim = document.getElementById("scrim"),
  sidebarEl = document.getElementById("sidebar"),
  historyEl = document.getElementById("history"),
  newChatBtn = document.getElementById("newChat"),
  input = document.getElementById("input"),
  composer = document.getElementById("composer"),
  thread = document.getElementById("thread"),
  welcome = document.getElementById("welcome"),
  messagesEl = document.getElementById("messages"),
  send = document.getElementById("send"),
  statusText = document.getElementById("statusText"),
  statusWrap = document.getElementById("statusWrap"),
  suggestions = document.getElementById("suggestions");

let demoMode = false;
let chats = loadChats();
let activeId = chats.length ? chats[0].id : createChat();

/* ---------- persistence ---------- */
function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    /* storage unavailable — chat still works for this session */
  }
}

function createChat() {
  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  chats.unshift({ id, title: "New chat", messages: [] });
  saveChats();
  return id;
}

function getActiveChat() {
  return chats.find((c) => c.id === activeId);
}

/* ---------- sidebar rendering ---------- */
function renderHistory() {
  historyEl.innerHTML = "";
  if (!chats.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "No conversations yet.";
    historyEl.appendChild(empty);
    return;
  }
  chats.forEach((c) => {
    const item = document.createElement("div");
    item.className = `h-item${c.id === activeId ? " active" : ""}`;
    const label = document.createElement("span");
    label.textContent = c.title || "New chat";
    const del = document.createElement("span");
    del.className = "del";
    del.setAttribute("aria-label", "Delete chat");
    del.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(c.id);
    });
    item.appendChild(label);
    item.appendChild(del);
    item.addEventListener("click", () => switchChat(c.id));
    historyEl.appendChild(item);
  });
}

function switchChat(id) {
  activeId = id;
  renderHistory();
  renderMessages();
  closeSidebarOnMobile();
}

function deleteChat(id) {
  const idx = chats.findIndex((c) => c.id === id);
  if (idx === -1) return;
  chats.splice(idx, 1);
  saveChats();
  if (activeId === id) {
    activeId = chats.length ? chats[0].id : createChat();
  }
  renderHistory();
  renderMessages();
}

newChatBtn.addEventListener("click", () => {
  activeId = createChat();
  renderHistory();
  renderMessages();
  closeSidebarOnMobile();
  input.focus();
});

/* ---------- mobile sidebar ---------- */
function openSidebar() {
  appEl.classList.add("sidebar-open");
}
function closeSidebar() {
  appEl.classList.remove("sidebar-open");
}
function closeSidebarOnMobile() {
  if (window.innerWidth <= 860) closeSidebar();
}
menuToggle.addEventListener("click", () => {
  appEl.classList.contains("sidebar-open") ? closeSidebar() : openSidebar();
});
scrim.addEventListener("click", closeSidebar);

/* ---------- message rendering ---------- */
function renderMessages() {
  const chat = getActiveChat();
  messagesEl.innerHTML = "";
  if (!chat || !chat.messages.length) {
    welcome.style.display = "";
    return;
  }
  welcome.style.display = "none";
  chat.messages.forEach((m) => appendMessageEl(m.role, m.content));
  scrollToBottom();
}

function appendMessageEl(role, text) {
  const w = document.createElement("div");
  w.className = `message ${role}`;
  w.innerHTML = `<div class="avatar">${role === "assistant" ? "A" : "YOU"}</div><div class="bubble"><span class="label">${role === "assistant" ? "AZYVION AI" : "YOU"}</span><p></p></div>`;
  w.querySelector("p").textContent = text;
  messagesEl.appendChild(w);
  return w;
}

function typingEl() {
  const w = document.createElement("div");
  w.className = "message assistant";
  w.innerHTML = '<div class="avatar">A</div><div class="bubble"><span class="label">AZYVION AI</span><p class="typing"><span></span><span></span><span></span></p></div>';
  messagesEl.appendChild(w);
  scrollToBottom();
  return w;
}

function scrollToBottom() {
  thread.scrollTop = thread.scrollHeight;
}

function titleFrom(text) {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 42 ? clean.slice(0, 42) + "…" : clean;
}

/* ---------- status ---------- */
async function checkStatus() {
  if (!API_BASE && window.location.protocol !== "http:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    enterDemoMode("No backend configured for this deployment.");
    return;
  }
  try {
    const r = await fetch(`${API_BASE}/api/status`);
    const d = await r.json();
    if (d.configured) {
      statusText.textContent = "System online";
      statusWrap.classList.add("ready");
    } else {
      statusText.textContent = "API key required";
      statusWrap.classList.add("error");
    }
  } catch {
    enterDemoMode("Couldn't reach the Azyvion AI backend.");
  }
}

function enterDemoMode(reason) {
  demoMode = true;
  statusText.textContent = "Demo mode — backend not connected";
  statusWrap.classList.add("error");
  console.info(`Azyvion AI: ${reason} Set API_BASE_URL in config.js to connect a live backend.`);
}

/* ---------- sending ---------- */
async function sendMessage(text) {
  text = text.trim();
  if (!text || send.disabled) return;

  const chat = getActiveChat();
  if (welcome.style.display !== "none") welcome.style.display = "none";

  if (!chat.messages.length) chat.title = titleFrom(text);
  chat.messages.push({ role: "user", content: text });
  saveChats();
  renderHistory();
  appendMessageEl("user", text);
  scrollToBottom();

  input.value = "";
  input.style.height = "auto";

  if (demoMode) {
    const reply = "This is a static preview — no backend is connected here. Deploy server.js (see README) and set API_BASE_URL in config.js to enable real responses.";
    chat.messages.push({ role: "assistant", content: reply });
    saveChats();
    appendMessageEl("assistant", reply);
    scrollToBottom();
    return;
  }

  send.disabled = true;
  const t = typingEl();
  try {
    const r = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat.messages }),
    });
    const d = await r.json();
    t.remove();
    if (!r.ok) throw new Error(d.error || "Request failed");
    chat.messages.push({ role: "assistant", content: d.text });
    saveChats();
    appendMessageEl("assistant", d.text);
  } catch (e) {
    t.remove();
    appendMessageEl("assistant", `I couldn't connect right now. ${e.message}`);
  } finally {
    scrollToBottom();
    send.disabled = false;
    input.focus();
  }
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
});

document.querySelectorAll(".suggestions button").forEach((b) =>
  b.addEventListener("click", () => sendMessage(b.textContent))
);

renderHistory();
renderMessages();
checkStatus();
