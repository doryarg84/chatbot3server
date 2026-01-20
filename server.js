import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const app = express();
app.use(express.json());

// ===============================
// 📁 Static files
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// ===============================
// ❤️ Health Check (Keep Alive)
// ===============================
app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

// ===============================
// 🤖 Lazy OpenAI Client (CRITICAL)
// ===============================
let openaiClient;

function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("✅ OpenAI client initialized");
  }
  return openaiClient;
}

// ===============================
// 💬 Chat State (In-Memory)
// ===============================
/**
 * chats = Map<chatId, messages[]>
 */
const chats = new Map();

const SYSTEM_PROMPT = "אתה צ'אטבוט עוזר, ענה בקצרה וברורה.";
const MAX_TURNS = 20;

function getOrCreateChat(chatId) {
  if (!chats.has(chatId)) {
    chats.set(chatId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return chats.get(chatId);
}

function trimHistory(messages) {
  const system = messages[0]?.role === "system" ? [messages[0]] : [];
  const rest = messages.filter((m) => m.role !== "system");

  const maxMessages = MAX_TURNS * 2;
  const trimmedRest = rest.slice(-maxMessages);

  return [...system, ...trimmedRest];
}

// ===============================
// 🗑️ Delete chat
// ===============================
app.delete("/api/chat/:chatId", (req, res) => {
  const { chatId } = req.params;

  if (!chatId) {
    return res.status(400).json({ error: "chatId is required" });
  }

  if (!chats.has(chatId)) {
    return res.status(404).json({ error: "Chat not found" });
  }

  chats.delete(chatId);
  res.json({ ok: true });
});

// ===============================
// 📋 List chats (debug)
// ===============================
app.get("/api/chats", (req, res) => {
  res.json({ chatIds: Array.from(chats.keys()) });
});

// ===============================
// 💬 Main Chat Endpoint
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { chatId, message } = req.body || {};

    if (!chatId || typeof chatId !== "string") {
      return res.status(400).json({ error: "chatId is required" });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    // Load or create chat
    const history = getOrCreateChat(chatId);

    history.push({ role: "user", content: message });
    chats.set(chatId, trimHistory(history));

    // 🔥 OpenAI call (lazy)
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: chats.get(chatId),
    });

    const reply =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "לא הצלחתי לנסח תשובה.";

    const updated = chats.get(chatId);
    updated.push({ role: "assistant", content: reply });
    chats.set(chatId, trimHistory(updated));

    res.json({ reply });
  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===============================
// 🚀 Server start
// ===============================
const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${port}`);
});
