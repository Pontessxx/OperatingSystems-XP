# Nginx + SQLite + API Node.js (Docker Compose Stack)

[link video](https://youtu.be/NGtDsWW5qLY)

### 👥 Integrantes da Equipe

| Nome                                | RM       |
| ----------------------------------- | -------- |
| Henrique Pontes Oliveira            | RM98036  |
| Levy Nascimento Junior              | RM98655  |
| Rafael Autieri dos Anjos            | RM550885 |
| Rafael Carvalho Mattos              | RM99874  |
| Vinicius Santos Yamashita de Farias | RM550885 |

---

## 📖 Introdução

Este projeto implementa uma stack mínima em **Ubuntu Server** (sem GUI) com:

* **Docker + Docker Compose**: orquestração dos serviços.
* **Nginx**: reverse proxy na porta 80.
* **SQLite**: banco persistente montado em volume externo (`./db/ivi.db`).
* **API Node.js (Express)**: endpoints para criação e listagem de usuários.
* **Scripts externos + logs**: endpoints de logs, script de anonimização fora do endpoint, permissões Linux específicas.

O desenvolvimento foi feito em passos pequenos, com depuração de erros e ajustes.

---

## ⚙️ Passo a passo

* Instalar pacotes iniciais

```bash
sudo apt-get update -y
sudo apt-get install -y docker.io docker-compose-plugin nginx curl
```

* Habilitar serviços

```bash
sudo systemctl enable --now docker
sudo systemctl enable --now nginx
```

* Adicionar usuário ao grupo docker

```bash
sudo usermod -aG docker "$USER" || true
```

* Instalar chave GPG e repositório oficial da Docker

```bash
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

* Adicionar repositório:

```bash
echo   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg]   https://download.docker.com/linux/ubuntu   $(. /etc/os-release; echo $VERSION_CODENAME) stable"   | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

* Instalar Docker CE + Compose v2 + Nginx

```bash
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nginx
```

---

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

---

## 📄 Arquivos principais

### docker-compose.yml

```yaml
services:
  api:
    build: ./api
    container_name: os_api
    environment:
      - NODE_ENV=production
      - DB_PATH=/db/ivi.db
      - LOG_DIR=/var/log/xp
    ports:
      - "3000:3000"
    volumes:
      - ./db:/db
      - /var/log/xp:/var/log/xp
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
      apk add --no-cache sqlite sqlite-libs &&
      echo 'SQLite util pronto; mantendo container em sleep.' &&
      tail -f /dev/null
    volumes:
      - ./db:/db
      - ./scripts:/scripts
      - /var/log/xp:/var/log/xp
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

### api/index.js

Contém:

* `/api/health` → verifica DB
* `/api/users` (POST/GET)
* `/api/logs/access` → grava acessos em `/var/log/xp/xp_access.log`
* `/api/logs/operation` → grava operações em `/var/log/xp/xp_app.log`

### scripts/anonymize.sh

Script roda **fora da API**, diretamente no container sqlite. Ele anonimiza dados, cria coluna `anonymized` se não existir e registra execução em `/var/log/xp/xp_anonymize.log`.

Exemplo de log:

```
[2025-09-26T10:25:08+00:00] START anonymize script (db=/db/ivi.db)
[2025-09-26T10:25:08+00:00] INFO rows_anonymized=1
[2025-09-26T10:25:08+00:00] END anonymize script
```

---

## ▶️ Como rodar

1. Subir containers:

```bash
cd ~/os-stack
docker compose up -d --build
```

2. Testar health:

```bash
curl http://localhost/health
curl http://localhost/api/health
```

3. Inserir e listar usuários:

```bash
curl -X POST http://localhost/api/users   -H 'Content-Type: application/json'   -d '{"name":"Teste","email":"teste@example.com","cpf":"123.456.789-00","rg":"12.345.678-9"}'

curl http://localhost/api/users
```

4. Testar endpoints de log:

```bash
curl -X POST http://localhost/api/logs/access   -H 'Content-Type: application/json'   -d '{"message":"rota /api/users consultada","level":"INFO"}'

curl -X POST http://localhost/api/logs/operation   -H 'Content-Type: application/json'   -d '{"message":"insert usuario ok","context":{"id":123}}'
```

5. Rodar anonimização manual:

```bash
docker compose exec sqlite sh -lc 'DB_PATH=/db/ivi.db /scripts/anonymize.sh'
```

6. Conferir logs:

```bash
sudo tail -n 20 /var/log/xp/xp_access.log
sudo tail -n 20 /var/log/xp/xp_app.log
sudo tail -n 20 /var/log/xp/xp_anonymize.log
```

---

## 🕒 Cron job

Agendamento diário da anonimização (como root):

```cron
0 2 * * * DB_PATH=/db/ivi.db /scripts/anonymize.sh >> /var/log/xp/xp_anonymize.log 2>&1
```

---

## 🔐 Permissões e usuários Linux

Pré-requisitos Sprint 4:

```bash
# Criar grupo e pasta de logs
sudo groupadd -f xplogs
sudo mkdir -p /var/log/xp
sudo chgrp -R xplogs /var/log/xp
sudo chmod 2775 /var/log/xp   # setgid no diretório

# Criar usuários específicos
sudo useradd -m -s /bin/bash app_logger  -G xplogs
sudo useradd -m -s /bin/bash anonymizer  -G xplogs
```

Validação:

```bash
getent group xplogs
id app_logger
id anonymizer
ls -ld /var/log/xp
```

---

## ✅ Conclusão

✔️ Endpoints de logs implementados com escrita em `/var/log/xp`.
✔️ Script de anonimização externo funcionando e logado.
✔️ Usuários e permissões configurados no Linux.
✔️ Persistência de dados via volume Docker.
✔️ Requisitos da **Sprint 4** totalmente atendidos.
