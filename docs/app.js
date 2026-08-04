const API_BASE = (window.AZYVION_CONFIG && window.AZYVION_CONFIG.API_BASE_URL) || "";

const input = document.getElementById("input"),
  composer = document.getElementById("composer"),
  messagesEl = document.getElementById("messages"),
  send = document.getElementById("send"),
  statusText = document.getElementById("statusText"),
  statusDot = document.getElementById("statusDot"),
  suggestions = document.getElementById("suggestions"),
  authScreen = document.getElementById("authScreen"),
  appShell = document.getElementById("appShell"),
  sidebar = document.getElementById("sidebar"),
  conversationListEl = document.getElementById("conversationList"),
  userFooterEl = document.getElementById("userFooter"),
  newChatBtn = document.getElementById("newChatBtn"),
  menuToggle = document.getElementById("menuToggle"),
  skipAuthBtn = document.getElementById("skipAuth");

let demoMode = false; // no backend at all
let guestMode = false; // backend exists, but user skipped sign-in
let currentConversationId = null;
let conversations = [];

const WELCOME_TEXT = "Hey. I'm Azyvion AI. What are we building today?";

function addMessage(role, text) {
  const w = document.createElement("div");
  w.className = `message ${role}`;
  w.innerHTML = `<div class="avatar">${role === "assistant" ? "A" : "YOU"}</div><div class="bubble"><span class="label">${role === "assistant" ? "AZYVION AI" : "YOU"}</span><p></p></div>`;
  w.querySelector("p").textContent = text;
  messagesEl.appendChild(w);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return w;
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

function typing() {
  const w = document.createElement("div");
  w.className = "message assistant";
  w.innerHTML = '<div class="avatar">A</div><div class="bubble"><span class="label">AZYVION AI</span><p class="typing"><span></span><span></span><span></span></p></div>';
  messagesEl.appendChild(w);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return w;
}

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
      statusDot.parentElement.classList.add("ready");
    } else {
      statusText.textContent = "API key required";
      statusDot.parentElement.classList.add("error");
    }
  } catch {
    enterDemoMode("Couldn't reach the Azyvion AI backend.");
  }
}

function enterDemoMode(reason) {
  demoMode = true;
  statusText.textContent = "Demo mode — backend not connected";
  statusDot.parentElement.classList.add("error");
  console.info(`Azyvion AI: ${reason} Set API_BASE_URL in config.js to connect a live backend.`);
}

function showApp() {
  authScreen.hidden = true;
  appShell.hidden = false;
}

function renderUserFooter(user) {
  if (!user) {
    userFooterEl.innerHTML = "";
    return;
  }
  userFooterEl.innerHTML = `
    <img class="user-avatar" src="${user.picture || ""}" alt="" onerror="this.style.display='none'">
    <div class="user-meta"><span class="user-name">${user.name || user.email || "Account"}</span></div>
    <button type="button" class="signout" id="signOutBtn" title="Sign out">⏻</button>
  `;
  document.getElementById("signOutBtn").addEventListener("click", () => window.Auth.signOut());
}

async function loadConversations() {
  const r = await window.Auth.authedFetch(`${API_BASE}/api/conversations`);
  if (!r.ok) return;
  const d = await r.json();
  conversations = d.conversations || [];
  renderConversationList();
}

function renderConversationList() {
  conversationListEl.innerHTML = "";
  conversations.forEach((c) => {
    const item = document.createElement("div");
    item.className = "conversation-item" + (c.id === currentConversationId ? " active" : "");
    item.innerHTML = `<span class="conversation-title"></span><button type="button" class="conversation-delete" title="Delete">×</button>`;
    item.querySelector(".conversation-title").textContent = c.title || "New chat";
    item.querySelector(".conversation-title").addEventListener("click", () => openConversation(c.id));
    item.querySelector(".conversation-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this conversation?")) return;
      await window.Auth.authedFetch(`${API_BASE}/api/conversations/${c.id}`, { method: "DELETE" });
      if (currentConversationId === c.id) startNewChat();
      await loadConversations();
    });
    conversationListEl.appendChild(item);
  });
}

async function openConversation(id) {
  const r = await window.Auth.authedFetch(`${API_BASE}/api/conversations/${id}`);
  if (!r.ok) return;
  const d = await r.json();
  currentConversationId = id;
  clearMessages();
  suggestions.style.display = "none";
  d.messages.forEach((m) => addMessage(m.role, m.content));
  renderConversationList();
  sidebar.classList.remove("open");
}

function startNewChat() {
  currentConversationId = null;
  clearMessages();
  addMessage("assistant", WELCOME_TEXT);
  suggestions.style.display = "";
  renderConversationList();
  sidebar.classList.remove("open");
}

async function sendMessage(text) {
  text = text.trim();
  if (!text || send.disabled) return;

  addMessage("user", text);
  input.value = "";
  input.style.height = "auto";
  suggestions.style.display = "none";

  if (demoMode || guestMode) {
    addMessage(
      "assistant",
      guestMode
        ? "You're browsing as a guest, so this chat won't be saved. Sign in with Google to save your conversations."
        : "This is a static preview — no backend is connected here. Deploy server.js (see README) and set API_BASE_URL in config.js to enable real responses."
    );
    return;
  }

  send.disabled = true;
  const t = typing();
  try {
    const r = await window.Auth.authedFetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: currentConversationId, message: text }),
    });
    const d = await r.json();
    t.remove();
    if (!r.ok) throw new Error(d.error || "Request failed");
    addMessage("assistant", d.text);
    currentConversationId = d.conversationId;
    loadConversations();
  } catch (e) {
    t.remove();
    addMessage("assistant", `I couldn't connect right now. ${e.message}`);
  } finally {
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
  input.style.height = Math.min(input.scrollHeight, 150) + "px";
});

document.querySelectorAll(".suggestions button").forEach((b) =>
  b.addEventListener("click", () => sendMessage(b.textContent))
);

newChatBtn.addEventListener("click", startNewChat);
menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));

skipAuthBtn.addEventListener("click", () => {
  guestMode = true;
  showApp();
  sidebar.hidden = true;
  startNewChat();
  checkStatus();
});

document.addEventListener("azyvion:signedin", async (e) => {
  showApp();
  sidebar.hidden = false;
  renderUserFooter(e.detail);
  await loadConversations();
  startNewChat();
  checkStatus();
});

(async function init() {
  window.Auth.initGoogleButton();
  // Google's script sometimes finishes loading a beat after ours — retry once.
  setTimeout(() => window.Auth.initGoogleButton(), 500);

  const user = await window.Auth.tryRestoreSession();
  if (user) {
    showApp();
    sidebar.hidden = false;
    renderUserFooter(user);
    await loadConversations();
    startNewChat();
    checkStatus();
  }
})();
