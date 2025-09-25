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