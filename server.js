const http = require("http");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

loadLocalEnv();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || "suitshop_pro";
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || "suits";
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGO_URL;

let mongoClient;
let suitsCollection;

const defaultSuits = [
  { id: "S001", name: "Classic Black Tuxedo", category: "Formal", color: "Black", sizes: "M, L, XL", price: 299, stock: 24, sold: 88, year: 2022, status: "active", desc: "Elegant all-occasion black tuxedo.", images: [] },
  { id: "S002", name: "Navy Blue Business Suit", category: "Business", color: "Navy Blue", sizes: "S, M, L", price: 249, stock: 18, sold: 142, year: 2023, status: "active", desc: "Sharp business-ready navy suit.", images: [] },
  { id: "S003", name: "White Wedding Suit", category: "Wedding", color: "White", sizes: "M, L", price: 399, stock: 12, sold: 65, year: 2023, status: "active", desc: "Premium white wedding collection.", images: [] },
  { id: "S004", name: "Slim Fit Casual Blazer", category: "Casual", color: "Charcoal", sizes: "S, M, L, XL", price: 179, stock: 30, sold: 210, year: 2024, status: "active", desc: "Modern slim fit for casual outings.", images: [] },
  { id: "S005", name: "Vintage Pinstripe Suit", category: "Vintage", color: "Grey", sizes: "M, L", price: 189, stock: 5, sold: 34, year: 2020, status: "low", desc: "Classic 1940s-inspired pinstripe.", images: [] },
  { id: "S006", name: "1980s Double-Breasted", category: "Vintage", color: "Brown", sizes: "M", price: 99, stock: 3, sold: 12, year: 2019, status: "outdated", desc: "Retro double-breasted jacket.", images: [] },
  { id: "S007", name: "Ivory Slim Wedding Suit", category: "Wedding", color: "Ivory", sizes: "S, M, L", price: 459, stock: 8, sold: 45, year: 2024, status: "active", desc: "Slim ivory wedding suit.", images: [] },
  { id: "S008", name: "Charcoal Executive Suit", category: "Business", color: "Charcoal", sizes: "M, L, XL", price: 319, stock: 15, sold: 98, year: 2023, status: "active", desc: "Top-tier executive charcoal suit.", images: [] },
  { id: "S009", name: "Sky Blue Casual Suit", category: "Casual", color: "Sky Blue", sizes: "S, M", price: 199, stock: 20, sold: 72, year: 2024, status: "active", desc: "Breathable sky blue casual suit.", images: [] },
  { id: "S010", name: "70s Retro Suit", category: "Vintage", color: "Mustard", sizes: "M, L", price: 89, stock: 2, sold: 8, year: 2018, status: "outdated", desc: "Funky mustard-colored 70s throwback.", images: [] }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8").trim();
  if (!content) return;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      if (trimmed.startsWith("mongodb://") || trimmed.startsWith("mongodb+srv://")) {
        process.env.MONGODB_URI ||= trimmed;
      }
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ||= value;
  }
}

async function connectDatabase() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it in Render environment variables or .env.");
  }

  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  suitsCollection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
  await suitsCollection.createIndex({ id: 1 }, { unique: true });

  const count = await suitsCollection.countDocuments();
  if (count === 0) {
    await suitsCollection.insertMany(defaultSuits.map(suit => ({ ...suit })));
    console.log("Seeded default suits into MongoDB.");
  }
}

function stripMongoId(suit) {
  if (!suit) return suit;
  const { _id, ...rest } = suit;
  return rest;
}

async function readSuits() {
  const suits = await suitsCollection.find({}).sort({ id: 1 }).toArray();
  return suits.map(stripMongoId);
}

async function writeSuit(suit) {
  await suitsCollection.updateOne({ id: suit.id }, { $set: suit }, { upsert: true });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function cleanSuit(input, id) {
  return {
    id,
    name: String(input.name || "").trim(),
    category: String(input.category || "Formal").trim(),
    color: String(input.color || "").trim(),
    sizes: String(input.sizes || "").trim(),
    price: Number(input.price || 0),
    stock: Number(input.stock || 0),
    sold: Number(input.sold || 0),
    year: Number(input.year || new Date().getFullYear()),
    status: ["active", "low", "outdated"].includes(input.status) ? input.status : "active",
    desc: String(input.desc || "").trim(),
    images: Array.isArray(input.images) ? input.images.slice(0, 4) : []
  };
}

async function nextId() {
  const lastSuit = await suitsCollection
    .find({ id: /^S\d+$/ })
    .sort({ id: -1 })
    .limit(1)
    .next();
  const num = lastSuit ? Number(String(lastSuit.id).replace(/\D/g, "")) : 0;
  return `S${String(num + 1).padStart(3, "0")}`;
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/suits" && req.method === "GET") {
    return sendJson(res, 200, await readSuits());
  }

  if (url.pathname === "/api/suits" && req.method === "POST") {
    const body = await readBody(req);
    const suit = cleanSuit(body, await nextId());
    if (!suit.name) return sendJson(res, 400, { error: "Suit name is required." });
    await writeSuit(suit);
    return sendJson(res, 201, suit);
  }

  const match = url.pathname.match(/^\/api\/suits\/([^/]+)$/);
  if (match && req.method === "PUT") {
    const id = decodeURIComponent(match[1]);
    const existing = await suitsCollection.findOne({ id });
    if (!existing) return sendJson(res, 404, { error: "Suit not found." });
    const body = await readBody(req);
    const suit = cleanSuit(body, id);
    if (!suit.name) return sendJson(res, 400, { error: "Suit name is required." });
    await writeSuit(suit);
    return sendJson(res, 200, suit);
  }

  if (match && req.method === "DELETE") {
    const id = decodeURIComponent(match[1]);
    const result = await suitsCollection.deleteOne({ id });
    if (result.deletedCount === 0) return sendJson(res, 404, { error: "Suit not found." });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "API route not found." });
}

function serveStatic(req, res, url) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function start() {
  await connectDatabase();

  http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
      } else {
        serveStatic(req, res, url);
      }
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: error.message || "Server error" });
    }
  }).listen(PORT, () => {
    console.log(`SuitShop Pro running at http://localhost:${PORT}`);
    console.log(`Using MongoDB database "${DB_NAME}" collection "${COLLECTION_NAME}".`);
  });
}

start().catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
