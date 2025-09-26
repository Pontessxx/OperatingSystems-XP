import express from "express";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import useragent from "express-useragent";
import Joi from "joi";

const app = express();
app.use(express.json());
app.use(useragent.express());

// --- DB ---
const DB_PATH = process.env.DB_PATH || "/data/ivi.db";
const db = new Database(DB_PATH, { fileMustExist: false });

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    cpf TEXT NOT NULL,
    rg  TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- LOGS ---
const LOG_DIR = process.env.LOG_DIR || "/var/log/xp";
const ACCESS_LOG = path.join(LOG_DIR, "xp_access.log");
const APP_LOG = path.join(LOG_DIR, "xp_app.log");

// garante diretório (não dá erro se já existir)
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function line(ts, level, msg, extra = {}) {
  const ctx = Object.entries(extra)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return `[${ts}] ${level} ${msg}${ctx ? " " + ctx : ""}\n`;
}

const logSchema = Joi.object({
  level: Joi.string().valid("INFO", "WARN", "ERROR", "DEBUG").default("INFO"),
  message: Joi.string().min(1).max(2000).required(),
  context: Joi.object().unknown(true).default({})
});

// ---- ENDPOINTS DE LOG (Sprint 4) ----
// Logs de Acesso (grava IP e user-agent)
app.post("/api/logs/access", (req, res) => {
  const { error, value } = logSchema.validate(req.body || {});
  if (error) return res.status(400).json({ error: error.message });

  const ts = new Date().toISOString();
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
  const ua = req.useragent?.source || "";
  const lineStr = line(ts, value.level, value.message, { ip, ua });

  fs.appendFile(ACCESS_LOG, lineStr, (err) => {
    if (err) return res.status(500).json({ error: "failed_to_write_log" });
    return res.json({ ok: true });
  });
});

// Logs de Operação da aplicação
app.post("/api/logs/operation", (req, res) => {
  const { error, value } = logSchema.validate(req.body || {});
  if (error) return res.status(400).json({ error: error.message });

  const ts = new Date().toISOString();
  const lineStr = line(ts, value.level, value.message, value.context);

  fs.appendFile(APP_LOG, lineStr, (err) => {
    if (err) return res.status(500).json({ error: "failed_to_write_log" });
    return res.json({ ok: true });
  });
});

// ---- SEUS ENDPOINTS EXISTENTES ----
app.get("/api/health", (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    return res.status(200).json({ status: "OK" });
  } catch (e) {
    return res.status(500).json({ status: "ERROR", error: String(e) });
  }
});

app.post("/api/users", (req, res) => {
  const { name, email, cpf, rg } = req.body || {};
  if (!name || !email || !cpf || !rg) {
    return res
      .status(400)
      .json({ message: "Missing fields: name, email, cpf, rg" });
  }
  try {
    const stmt = db.prepare(
      "INSERT INTO users (name, email, cpf, rg) VALUES (@name, @email, @cpf, @rg)"
    );
    const info = stmt.run({ name, email, cpf, rg });
    return res
      .status(201)
      .json({ id: info.lastInsertRowid, name, email, cpf, rg });
  } catch (e) {
    const msg = ("" + e).includes("UNIQUE")
      ? "Email already exists"
      : String(e);
    return res.status(400).json({ error: msg });
  }
});

app.get("/api/users", (_req, res) => {
  const rows = db
    .prepare(
      "SELECT id, name, email, cpf, rg, created_at FROM users ORDER BY id DESC"
    )
    .all();
  return res.json(rows);
});

// --- SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT} (DB=${DB_PATH})`);
});