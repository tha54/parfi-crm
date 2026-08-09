#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#   backup-mysql.sh — sauvegarde quotidienne des bases parfi et parfi_test.
#
#   Politique de rétention :
#     - /var/backups/mysql/daily/    30 jours glissants (purge automatique)
#     - /var/backups/mysql/monthly/  12 mois (copie le 1er de chaque mois,
#                                    purge automatique après 366 jours)
#
#   Écriture atomique : on dump dans un fichier temporaire (.part), on
#   vérifie la taille, puis on renomme. Un dump vide ou anormalement petit
#   n'écrase JAMAIS une sauvegarde antérieure valide (« fail loudly »).
#
#   Identifiants : /root/.mysql-backup.cnf (mode 600, user parfi_backup avec
#   les droits minimaux SELECT / LOCK TABLES / SHOW VIEW / EVENT / TRIGGER /
#   RELOAD / PROCESS / REPLICATION CLIENT). Jamais de mot de passe sur la
#   ligne de commande (visible dans ps).
#
#   Copie hors machine : voir la variable OFFSITE_HOOK plus bas — le script
#   exécute un hook optionnel après un dump réussi. La copie hors machine
#   est un point structurant à décider séparément (§ discussion).
#
#   Journal : /var/log/mysql-backup.log (append). En cas d'échec, exit != 0
#   pour que cron envoie un mail (si MAILTO est configuré).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Environnement optionnel (offsite, notifications) ────────────────────────
# /etc/parfi-backup.env est un fichier 600 root, à remplir par l'admin.
# Sert notamment à définir OFFSITE_HOOK, AGE_RECIPIENT_FILE, S3_ENDPOINT,
# S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, MAILTO_ERROR.
# Voir docs-production/procedure-restauration-backup.md et
# /opt/parfi-crm/scripts/offsite-upload.sh.
if [[ -f /etc/parfi-backup.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /etc/parfi-backup.env; set +a
fi

# ── Paramètres ──────────────────────────────────────────────────────────────
BASES=("parfi" "parfi_test")
BACKUP_DIR="/var/backups/mysql"
DAILY_DIR="$BACKUP_DIR/daily"
MONTHLY_DIR="$BACKUP_DIR/monthly"
DEFAULTS_FILE="/root/.mysql-backup.cnf"
LOG_FILE="/var/log/mysql-backup.log"
# Seuil de plausibilité : un dump correct dépasse largement 1 Ko compressé.
# Un fichier plus petit signale un dump avorté avant d'écrire le moindre INSERT.
MIN_SIZE_BYTES=1024
# Hook optionnel appelé après chaque dump réussi (offsite copy).
# Reçoit en argument le chemin du .sql.gz. Non défini → pas d'offsite.
OFFSITE_HOOK="${OFFSITE_HOOK:-}"

# ── Utilitaires ─────────────────────────────────────────────────────────────
log() {
  echo "$(date -Is) $*" | tee -a "$LOG_FILE" >&2
}
die() {
  log "ERREUR : $*"
  exit 1
}

# Vérifications préalables
[[ $EUID -eq 0 ]] || die "doit être exécuté en root"
[[ -f "$DEFAULTS_FILE" ]] || die "fichier $DEFAULTS_FILE manquant"
[[ $(stat -c "%a" "$DEFAULTS_FILE") == "600" ]] || die "$DEFAULTS_FILE doit être en 600"
[[ -d "$DAILY_DIR" ]] || die "$DAILY_DIR n'existe pas"
[[ -d "$MONTHLY_DIR" ]] || die "$MONTHLY_DIR n'existe pas"

TODAY=$(date +%Y-%m-%d)
IS_FIRST_OF_MONTH=$([[ $(date +%d) == "01" ]] && echo yes || echo no)

# ── Sauvegarde par base ─────────────────────────────────────────────────────
for base in "${BASES[@]}"; do
  final="$DAILY_DIR/${base}_${TODAY}.sql.gz"
  part="$final.part"

  log "[$base] début dump"

  # --single-transaction : cohérence sans lock pour InnoDB
  # --routines --triggers --events : tout ce qu'on peut avoir à restaurer
  # --set-gtid-purged=OFF : évite les erreurs GTID à la restauration hors master
  mysqldump \
    --defaults-extra-file="$DEFAULTS_FILE" \
    --single-transaction \
    --quick \
    --routines --triggers --events \
    --set-gtid-purged=OFF \
    --databases "$base" \
    2> >(while read l; do log "[$base] mysqldump: $l"; done) \
    | gzip -c > "$part" || die "[$base] échec mysqldump"

  size=$(stat -c "%s" "$part")
  if (( size < MIN_SIZE_BYTES )); then
    log "[$base] taille anormale ($size octets < $MIN_SIZE_BYTES), abandon sans écrasement"
    rm -f "$part"
    die "[$base] dump vide ou tronqué — l'éventuelle sauvegarde précédente est PRÉSERVÉE"
  fi

  # Écriture atomique
  mv "$part" "$final"
  chmod 600 "$final"
  chown root:root "$final"
  log "[$base] dump OK — $final ($(du -h "$final" | cut -f1))"

  # Copie mensuelle le 1er
  if [[ $IS_FIRST_OF_MONTH == "yes" ]]; then
    monthly="$MONTHLY_DIR/${base}_$(date +%Y-%m).sql.gz"
    cp -p "$final" "$monthly"
    chmod 600 "$monthly"
    log "[$base] copie mensuelle → $monthly"
  fi

  # Hook offsite (si défini) — après validation locale.
  if [[ -n "$OFFSITE_HOOK" ]]; then
    if "$OFFSITE_HOOK" "$final"; then
      log "[$base] offsite OK"
    else
      log "[$base] offsite ÉCHOUÉ (dump local préservé)"
    fi
  fi
done

# ── Purge ───────────────────────────────────────────────────────────────────
# Daily : au-delà de 30 jours. Monthly : au-delà de 366 jours.
purged_daily=$(find "$DAILY_DIR" -maxdepth 1 -type f -name "*.sql.gz" -mtime +30 -print -delete | wc -l)
purged_monthly=$(find "$MONTHLY_DIR" -maxdepth 1 -type f -name "*.sql.gz" -mtime +366 -print -delete | wc -l)
log "purge — $purged_daily fichier(s) daily / $purged_monthly fichier(s) monthly"

log "terminé"
