# Nginx + SQLite + API Node.js (Docker Compose Stack)
[link video](https://youtu.be/NGtDsWW5qLY)
## 📖 Introdução
Este projeto implementa uma stack mínima em **Ubuntu Server** (sem GUI) com:

- **Docker + Docker Compose**: orquestração dos serviços.  
- **Nginx**: reverse proxy na porta 80.  
- **SQLite**: banco persistente montado em volume externo (`./db/ivi.db`).  
- **API Node.js (Express)**: endpoints para criação e listagem de usuários.  
- **Cron job**: anonimização diária de dados sensíveis (PII).  

O desenvolvimento foi feito em passos pequenos, com depuração de erros e ajustes.


## ⚙️ Passo a passo

- Instalar pacotes iniciais
```bash
sudo apt-get update -y
sudo apt-get install -y docker.io docker-compose-plugin nginx curl
```

- Habilitar serviços
```bash
sudo systemctl enable --now docker
sudo systemctl enable --now nginx
```

- Adicionar usuário ao grupo docker
```bash
sudo usermod -aG docker "$USER" || true
```

- Instalar chave GPG e repositório oficial da Docker
```bash
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

- Adicionar repositório:
```bash
echo   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg]   https://download.docker.com/linux/ubuntu   $(. /etc/os-release; echo $VERSION_CODENAME) stable"   | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

- Instalar Docker CE + Compose v2 + Nginx
```bash
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nginx
```

# 🐛 Problemas encontrados e soluções

- **Erro:** `docker-compose-plugin` não encontrado  
  ✅ Corrigido adicionando repositório oficial da Docker.

- **Erro:** `docker.service` falhando ao iniciar  
  ✅ Corrigido reiniciando `containerd` e recriando `/etc/docker/daemon.json`.

- **Erro:** `nginx` container não subia (`bind() to 0.0.0.0:80 failed`)  
  ✅ Corrigido desabilitando o Nginx do host (`systemctl stop/disable nginx`).

- **Erro:** `GET /api/health` retornava `Cannot GET /health`  
  ✅ Corrigido ajustando `proxy_pass` no `nginx/default.conf` para manter prefixo `/api`.


## 📂 Estrutura de diretórios

```
os-stack/
 ├── api/
 │   ├── Dockerfile
 │   ├── index.js
 │   └── package.json
 ├── db/
 │   └── ivi.db
 ├── nginx/
 │   └── default.conf
 ├── scripts/
 │   └── anonymize.sh
 └── docker-compose.yml
```

## 📄 Arquivos principais

### docker-compose.yml
```yaml
version: "3.9"

services:
  api:
    build: ./api
    container_name: os_api
    environment:
      - NODE_ENV=production
      - DB_PATH=/data/ivi.db
    ports:
      - "3000:3000"
    volumes:
      - ./db:/data
    depends_on:
      - sqlite
    restart: unless-stopped

  nginx:
    image: nginx:stable-alpine
    container_name: os_nginx
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "80:80"
    depends_on:
      - api
    restart: unless-stopped

  sqlite:
    image: alpine:3.20
    container_name: os_sqlite
    entrypoint: ["/bin/sh","-c"]
    command: >
      "apk add --no-cache sqlite sqlite-libs &&
       echo 'SQLite util pronto; mantendo container em sleep.' &&
       tail -f /dev/null"
    volumes:
      - ./db:/data
      - ./scripts:/scripts
    restart: unless-stopped
```

### nginx/default.conf
```nginx
server {
  listen 80;
  server_name _;

  location = /health {
    return 200 "OK\n";
    add_header Content-Type text/plain;
  }

  location /api {
    proxy_pass         http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }

  location = / {
    return 200 "Ivi OS Stack up\n";
    add_header Content-Type text/plain;
  }
}
```

### api/package.json
```json
{
  "name": "ivi-os-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.0",
    "express": "^4.19.2"
  }
}
```

### api/index.js
```js
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
```

### api/Dockerfile
```dockerfile
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm i --only=production

COPY index.js ./

EXPOSE 3000
CMD ["node", "index.js"]
```

### scripts/anonymize.sh
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${SCRIPT_DIR}/.."
cd "${COMPOSE_DIR}"

docker compose exec -T sqlite sqlite3 /data/ivi.db "
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  cpf TEXT NOT NULL,
  rg  TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"

docker compose exec -T sqlite sqlite3 /data/ivi.db "
UPDATE users SET
  name = lower(substr(name,1,1)) || '-' || substr(hex(randomblob(3)),1,6),
  cpf  = '*******' || substr(replace(replace(replace(cpf,'.',''),'-',''),' ',''), -4, 4),
  rg   = '****'    || substr(replace(replace(replace(rg ,'.',''),'-',''),' ',''), -3, 3);
"
echo '[anonymize] OK'
```

# ▶️ Como rodar

1. Subir containers:
```bash
cd ~/os-stack
sudo docker compose up -d --build
```

2. Testar endpoints:
```bash
curl http://localhost/health
curl http://localhost/api/health
```

3. Inserir e listar usuários:
```bash
curl -X POST http://localhost/api/users   -H 'Content-Type: application/json'   -d '{"name":"Teste","email":"teste@example.com","cpf":"123.456.789-00","rg":"12.345.678-9"}'

curl http://localhost/api/users
```

4. Rodar anonimização manual:
```bash
./scripts/anonymize.sh
```


## 🕒 Cron job

Adicionado no `crontab -e`:
```cron
0 2 * * * /usr/bin/env bash -lc 'cd $HOME/os-stack && ./scripts/anonymize.sh >> $HOME/os-stack/scripts/anonymize.log 2>&1'
```

Como o script usa docker, o jeito mais simples e seguro é agendar como root (assim não precisa mexer em grupos). Abra o crontab do root:
```bash
sudo crontab -e
```
Salva e sai. Confirma que o cron foi escrito:
```bash
sudo crontab -l
```
---

## ✅ Conclusão
✔️ Stack funcional com API + Nginx + SQLite + anonimização.  
✔️ Persistência entre reinícios.  
✔️ 100% dos requisitos atendidos.  
