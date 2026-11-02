const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const FALLBACK_FILE = path.join(__dirname, "data", "quotes_fallback.json");
const FAV_FILE = path.join(__dirname, "data", "favorites.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readFavs() {
  try { return JSON.parse(fs.readFileSync(FAV_FILE, "utf8")); } catch { return []; }
}
function writeFavs(list) {
  fs.mkdirSync(path.dirname(FAV_FILE), { recursive: true });
  fs.writeFileSync(FAV_FILE, JSON.stringify(list, null, 2));
}

// GET /api/quote/random - public API first, local fallback data on failure
app.get("/api/quote/random", async (req, res) => {
  try {
    const r = await fetch("https://dummyjson.com/quotes/random", {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error("API status " + r.status);
    const d = await r.json();
    if (!d.quote) throw new Error("Bad API response");
    return res.json({ text: d.quote, author: d.author, source: "api" });
  } catch (err) {
    const seed = JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8"));
    const q = seed[Math.floor(Math.random() * seed.length)];
    return res.json({ text: q.text, author: q.author, topic: q.topic, source: "fallback" });
  }
});

// GET /api/favorites?topic=&search=
app.get("/api/favorites", (req, res) => {
  const topic = (req.query.topic || "").toString();
  const search = (req.query.search || "").toString().toLowerCase();
  let list = readFavs();
  if (topic) list = list.filter((f) => f.topic === topic);
  if (search) {
    list = list.filter(
      (f) => f.text.toLowerCase().includes(search) || f.author.toLowerCase().includes(search)
    );
  }
  res.json(list.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)));
});

// POST /api/favorites
app.post("/api/favorites", (req, res) => {
  const text = (req.body.text || "").toString().trim();
  const author = (req.body.author || "Unknown").toString().trim();
  const topic = (req.body.topic || "General").toString().trim();
  if (!text) return res.status(400).json({ error: "Quote text is required." });
  if (text.length > 1000) return res.status(400).json({ error: "Quote is too long." });

  const list = readFavs();
  if (list.some((f) => f.text === text)) {
    return res.status(409).json({ error: "Already in favorites." });
  }
  const fav = { id: crypto.randomUUID(), text, author, topic, savedAt: new Date().toISOString() };
  list.push(fav);
  writeFavs(list);
  res.status(201).json(fav);
});

// DELETE /api/favorites/:id
app.delete("/api/favorites/:id", (req, res) => {
  const list = readFavs();
  const rest = list.filter((f) => f.id !== req.params.id);
  if (rest.length === list.length) return res.status(404).json({ error: "Not found." });
  writeFavs(rest);
  res.json({ message: "Removed." });
});

app.listen(PORT, () => console.log(`Quote Generator running on port ${PORT}`));
