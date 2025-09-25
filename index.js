import express from "express";
import Database from "better-sqlite3";

const app = express();
app.use(express.json());

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
    return res.status(400).json({ message: "Missing fields: name, email, cpf, rg" });
  }
  try {
    const stmt = db.prepare(
      "INSERT INTO users (name, email, cpf, rg) VALUES (@name, @email, @cpf, @rg)"
    );
    const info = stmt.run({ name, email, cpf, rg });
    return res.status(201).json({ id: info.lastInsertRowid, name, email, cpf, rg });
  } catch (e) {
    const msg = ("" + e).includes("UNIQUE") ? "Email already exists" : String(e);
    return res.status(400).json({ error: msg });
  }
});

app.get("/api/users", (_req, res) => {
  const rows = db.prepare("SELECT id, name, email, cpf, rg, created_at FROM users ORDER BY id DESC").all();
  return res.json(rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT} (DB=${DB_PATH})`);
});