#!/usr/bin/env bash
#
# Backup flowpedia — dump de la base Postgres (comptes / social : donnees a conserver).
# La DB n'est pas exposee sur l'hote en prod -> dump via `docker exec`.
#
# Usage (sur le VPS, typiquement via cron) :
#   BACKUP_DIR=/backup/current ./scripts/backup.sh
#
# Variables d'environnement :
#   BACKUP_DIR    repertoire de sortie          (defaut: /backup/current)
#   RETENTION     nb de dumps a conserver        (defaut: 7)
#   DB_CONTAINER  nom du conteneur Postgres      (defaut: flowpedia-postgres)
#
# Identifiants lus dans l'environnement du conteneur (POSTGRES_USER/POSTGRES_DB) :
# aucun secret n'est stocke dans ce script.
#
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

APP="flowpedia"
DB_CONTAINER="${DB_CONTAINER:-flowpedia-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/backup/current}"
RETENTION="${RETENTION:-7}"
STAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

echo "[$APP] Dump de la base ($DB_CONTAINER)..."
TMP="$BACKUP_DIR/.${APP}_db_${STAMP}.sql.gz.tmp"
if docker exec "$DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$TMP"; then
  mv "$TMP" "$BACKUP_DIR/${APP}_db_${STAMP}.sql.gz"
else
  rm -f "$TMP"
  echo "[$APP] ERREUR : echec du dump de la base" >&2
  exit 1
fi

find "$BACKUP_DIR" -maxdepth 1 -type f -name "${APP}_db_*.sql.gz" -printf '%T@ %p\n' \
  | sort -rn | tail -n +$((RETENTION + 1)) | cut -d' ' -f2- | xargs -r rm -f

echo "[$APP] Termine -> $BACKUP_DIR"
