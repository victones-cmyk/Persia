#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/persia}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${PERSIA_SERVICE:-persia}"
RUN_SEED="${RUN_SEED:-0}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf '\nERRO: %s\n' "$*" >&2
  exit 1
}

cd "$APP_DIR" || die "Diretorio do app nao encontrado: $APP_DIR"

command -v git >/dev/null 2>&1 || die "git nao encontrado"
command -v npm >/dev/null 2>&1 || die "npm nao encontrado"

if [ ! -f ".env" ]; then
  die "Arquivo .env nao encontrado em $APP_DIR"
fi

if ! grep -q '^DATABASE_URL=' .env; then
  die "DATABASE_URL nao esta configurado no .env"
fi

log "Atualizando codigo do GitHub ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

log "Instalando dependencias"
npm ci

log "Gerando Prisma Client"
npm run db:generate --workspace apps/api

log "Aplicando migrations no banco"
npm run db:migrate:deploy --workspace apps/api

log "Compilando API e Web"
npm run build

if [ "$RUN_SEED" = "1" ]; then
  log "Executando seed"
  npm run db:seed --workspace apps/api
fi

log "Reiniciando servico"
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  systemctl restart "$SERVICE_NAME"
  systemctl --no-pager --full status "$SERVICE_NAME" || true
else
  printf 'Servico systemd "%s" nao encontrado.\n' "$SERVICE_NAME"
  printf 'Se voce ainda roda manualmente, reinicie com: npm run start\n'
fi

log "Atualizacao concluida"
