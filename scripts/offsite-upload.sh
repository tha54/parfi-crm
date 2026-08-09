#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#   offsite-upload.sh — chiffre un dump avec `age` et l'envoie sur un stockage
#   objet S3-compatible (Scaleway Object Storage ou OVH Object Storage).
#
#   Est appelé par backup-mysql.sh via la variable OFFSITE_HOOK. Reçoit en
#   argument le chemin du fichier .sql.gz local (déjà validé et non vide).
#
#   Principe : le fichier envoyé est chiffré côté client avec la clé publique
#   AGE_RECIPIENT (fichier .txt contenant une ligne "age1..."). La clé privée
#   correspondante n'est PAS sur ce serveur — elle est conservée hors ligne.
#   Une compromission du serveur ne donne donc pas accès aux sauvegardes
#   déjà envoyées.
#
#   Variables d'environnement lues (via /etc/parfi-backup.env) :
#     OFFSITE_HOOK           = /opt/parfi-crm/scripts/offsite-upload.sh
#     AGE_RECIPIENT_FILE     = /etc/parfi-backup-age.pub  (chmod 644 root)
#     S3_ENDPOINT            = https://s3.fr-par.scw.cloud
#                              (ou https://s3.<region>.io.cloud.ovh.net/)
#     S3_BUCKET              = parfi-backups
#     S3_PREFIX              = "" (ou p.ex. cabinet-parfi/)
#     AWS_ACCESS_KEY_ID      = clé restreinte en écriture seule
#     AWS_SECRET_ACCESS_KEY  = idem
#     AWS_DEFAULT_REGION     = fr-par | rbx | ...
#     MAILTO_ERROR           = destinataire pour notification d'échec
#                              (par défaut root, remis à cron via MAILTO)
#
#   Exigences côté fournisseur (à configurer dans la console) :
#     - Bucket privé, sans accès public.
#     - Object lock activé (WORM), rétention conforme au cycle de vie.
#     - Cycle de vie : suppression après 30 jours pour prefix daily/,
#       suppression après 366 jours pour prefix monthly/.
#     - Clé API en écriture seule sur ce bucket (PutObject uniquement).
#       Pas de DeleteObject, pas de PutObjectRetention (le cycle de vie
#       s'en charge).
#
#   Sortie :
#     0 : upload OK.
#     != 0 : échec (le script backup-mysql.sh journalise et alerte via cron).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DUMP="${1:-}"
[[ -n "$DUMP" && -f "$DUMP" ]] || { echo "usage: $0 <fichier.sql.gz>" >&2; exit 2; }

# Vérifications de config
: "${AGE_RECIPIENT_FILE:?AGE_RECIPIENT_FILE non défini dans /etc/parfi-backup.env}"
: "${S3_ENDPOINT:?S3_ENDPOINT non défini}"
: "${S3_BUCKET:?S3_BUCKET non défini}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID non défini}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY non défini}"
: "${AWS_DEFAULT_REGION:?AWS_DEFAULT_REGION non défini}"

[[ -f "$AGE_RECIPIENT_FILE" ]] || { echo "clé publique age introuvable : $AGE_RECIPIENT_FILE" >&2; exit 2; }
command -v age >/dev/null       || { echo "'age' non installé" >&2; exit 2; }
command -v aws >/dev/null       || { echo "'aws' (awscli) non installé" >&2; exit 2; }

# Choix du prefix : /var/backups/mysql/{daily,monthly}/... → daily/... | monthly/...
case "$DUMP" in
  */monthly/*) REMOTE_PREFIX="${S3_PREFIX:-}monthly/" ;;
  */daily/*)   REMOTE_PREFIX="${S3_PREFIX:-}daily/"   ;;
  *)           REMOTE_PREFIX="${S3_PREFIX:-}other/"   ;;
esac

BASENAME=$(basename "$DUMP")
REMOTE_KEY="${REMOTE_PREFIX}${BASENAME}.age"
ENC_FILE=$(mktemp --suffix=".age")

# Chiffrement local
age -R "$AGE_RECIPIENT_FILE" -o "$ENC_FILE" "$DUMP"

# Upload — sans ACL publique, chiffrement au repos côté fournisseur en plus
# du chiffrement client déjà appliqué (ceinture + bretelles).
aws s3api put-object \
  --endpoint-url "$S3_ENDPOINT" \
  --bucket "$S3_BUCKET" \
  --key "$REMOTE_KEY" \
  --body "$ENC_FILE" \
  --content-type "application/octet-stream" \
  --server-side-encryption AES256 \
  >/dev/null

# Nettoyage local (le fichier chiffré est éphémère)
rm -f "$ENC_FILE"

echo "offsite: $BASENAME → s3://$S3_BUCKET/$REMOTE_KEY"
