#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#   restore-test.sh — restaure un dump dans une DB temporaire et vérifie qu'il
#   est reconstituable. « Une sauvegarde jamais restaurée n'est pas une
#   sauvegarde. »
#
#   Utilisation :
#     restore-test.sh <chemin/vers/dump.sql.gz>
#
#   Ce que fait le script :
#     1. Crée une base parfi_restore_test_<timestamp> (DROP en fin, quoi qu'il
#        arrive, y compris en cas d'échec).
#     2. Restaure le dump dedans.
#     3. Compare le nombre de tables du dump avec celui de la base restaurée.
#     4. Vérifie que quelques tables clés (utilisateurs, clients, factures) ont
#        au moins autant de lignes que dans la source (celle indiquée dans le
#        nom du dump, par convention "<db>_YYYY-MM-DD.sql.gz").
#     5. Affiche un rapport de contrôle.
#
#   Sortie : exit 0 si tout OK, exit != 0 sinon.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DUMP="${1:-}"
[[ -n "$DUMP" && -f "$DUMP" ]] || {
  echo "Usage : $0 <dump.sql.gz>" >&2
  exit 2
}

DEFAULTS_FILE="/root/.mysql-backup.cnf"
[[ -f "$DEFAULTS_FILE" ]] || { echo "manque $DEFAULTS_FILE" >&2; exit 2; }

# Base source déduite du nom : parfi_2026-08-09.sql.gz → parfi
BASENAME=$(basename "$DUMP" .sql.gz)
SRC_DB="${BASENAME%_*}"
RESTORE_DB="restore_test_$(date +%s)"

echo "── Restore test ────────────────────────────────────────────────"
echo "  dump    : $DUMP"
echo "  source  : $SRC_DB"
echo "  target  : $RESTORE_DB (temporaire, sera supprimée)"

# Nettoyage garanti quel que soit le motif de sortie
cleanup() {
  sudo mysql -e "DROP DATABASE IF EXISTS \`$RESTORE_DB\`" 2>/dev/null || true
}
trap cleanup EXIT

# Création base temp (parfi_backup ne peut pas — utiliser socket root)
sudo mysql -e "CREATE DATABASE \`$RESTORE_DB\` DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"

# Le dump contient CREATE DATABASE `parfi` — on force la restauration dans
# RESTORE_DB en filtrant le CREATE DATABASE et USE, puis en passant --database
gunzip -c "$DUMP" \
  | grep -v "^CREATE DATABASE" \
  | grep -v "^USE \`" \
  | sudo mysql "$RESTORE_DB"

# Nombre de tables
NB_TABLES_RESTORE=$(sudo mysql -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$RESTORE_DB'")
NB_TABLES_SRC=$(mysql --defaults-extra-file="$DEFAULTS_FILE" -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$SRC_DB'" 2>/dev/null || echo "?")

echo "  tables source   : $NB_TABLES_SRC"
echo "  tables restore  : $NB_TABLES_RESTORE"
if [[ "$NB_TABLES_SRC" != "?" && "$NB_TABLES_RESTORE" != "$NB_TABLES_SRC" ]]; then
  echo "  ❌ nombre de tables divergent"
  exit 1
fi

# Contrôles de contenu sur quelques tables clés (si présentes dans la source)
for t in utilisateurs clients factures lettres_mission; do
  SRC=$(mysql --defaults-extra-file="$DEFAULTS_FILE" -N -B -e "SELECT COUNT(*) FROM \`$SRC_DB\`.\`$t\`" 2>/dev/null || echo "-")
  RST=$(sudo mysql -N -B -e "SELECT COUNT(*) FROM \`$RESTORE_DB\`.\`$t\`" 2>/dev/null || echo "-")
  if [[ "$SRC" == "-" || "$RST" == "-" ]]; then
    printf "  %-20s : (table absente d'un côté, ignorée)\n" "$t"
    continue
  fi
  if [[ "$SRC" == "$RST" ]]; then
    printf "  %-20s : %8s lignes ✓\n" "$t" "$RST"
  else
    printf "  %-20s : %8s → %s ❌\n" "$t" "$SRC" "$RST"
    exit 1
  fi
done

echo "── OK : dump réputé restaurable ────────────────────────────────"
