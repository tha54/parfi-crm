# Procédure de restauration des sauvegardes MySQL

**Public** : administrateur système. Peut être exécutée par une personne qui n'a pas participé au projet, si elle a accès à la clé privée `age` (§ 2).

**Portée** : depuis un serveur vierge (Ubuntu ou Debian), reconstituer la base `parfi` à partir d'une sauvegarde offsite chiffrée conservée chez le fournisseur objet (Scaleway ou OVH).

**Durée** : 15 à 30 minutes.

---

## 1. Prérequis

Sur un serveur cible propre :

```
sudo apt-get update
sudo apt-get install -y age awscli mysql-server-8.0
```

## 2. Localiser la clé privée `age`

La clé privée n'est jamais sur le serveur. Elle est conservée hors ligne, en deux emplacements :

- **Gestionnaire de mots de passe partagé du cabinet**, entrée « Parfi CRM — clé privée backup age ».
- **Copie papier**, coffre du cabinet, enveloppe scellée « Backup age Parfi — clé privée ».

Le contenu de la clé commence par `AGE-SECRET-KEY-1…` (une seule ligne). Copier la clé dans un fichier local, **hors du serveur** si possible :

```
umask 077
cat > ~/parfi-backup-age.key <<'EOF'
AGE-SECRET-KEY-1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
EOF
chmod 600 ~/parfi-backup-age.key
```

**Ne jamais copier cette clé sur le serveur de production.** Le déchiffrement se fait sur un poste de travail ou sur un serveur d'administration jetable.

## 3. Récupérer les identifiants du bucket

Deux jeux à récupérer, séparément de la clé privée :

- **Identifiants du bucket** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) — gestionnaire de mots de passe, entrée « Parfi CRM — S3 backup credentials (read only) ».
- **Endpoint et nom de bucket** — même entrée. Format :
  - Scaleway : `https://s3.fr-par.scw.cloud`, bucket `parfi-backups`, region `fr-par`.
  - OVH : `https://s3.gra.io.cloud.ovh.net`, bucket `parfi-backups`, region `gra`.

Les identifiants d'écriture (ceux du serveur de prod) ne permettent pas de lister ni de télécharger. Pour la restauration, il faut des identifiants dédiés en lecture seule sur le bucket, à créer dans la console fournisseur au moment de la restauration puis à révoquer aussitôt après.

## 4. Configurer awscli

```
mkdir -p ~/.aws
cat > ~/.aws/credentials <<EOF
[parfi-restore]
aws_access_key_id     = <AWS_ACCESS_KEY_ID lecture seule>
aws_secret_access_key = <AWS_SECRET_ACCESS_KEY lecture seule>
EOF
chmod 600 ~/.aws/credentials

export AWS_PROFILE=parfi-restore
export ENDPOINT=https://s3.fr-par.scw.cloud   # ou l'endpoint OVH
export BUCKET=parfi-backups
```

## 5. Lister les sauvegardes disponibles

```
aws --endpoint-url "$ENDPOINT" s3 ls "s3://$BUCKET/daily/"
aws --endpoint-url "$ENDPOINT" s3 ls "s3://$BUCKET/monthly/"
```

Les fichiers ont la forme `parfi_YYYY-MM-DD.sql.gz.age` (ou `parfi_test_...`).

## 6. Télécharger et déchiffrer

Sur le poste où réside la clé privée `age` :

```
FILE=parfi_2026-08-09.sql.gz.age

aws --endpoint-url "$ENDPOINT" s3 cp "s3://$BUCKET/daily/$FILE" ./$FILE

age -d -i ~/parfi-backup-age.key -o "${FILE%.age}" "$FILE"

ls -la "${FILE%.age}"
```

Le résultat est un `parfi_2026-08-09.sql.gz` en clair. **À protéger** (`chmod 600`) et à supprimer une fois la restauration terminée.

## 7. Restaurer dans MySQL

Transférer le fichier `.sql.gz` sur le serveur cible (via `scp`, par exemple), puis :

```
DUMP=parfi_2026-08-09.sql.gz

# Sur MySQL 8, l'authentification par socket root est le chemin le plus sûr :
sudo mysql -e "DROP DATABASE IF EXISTS parfi; CREATE DATABASE parfi DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"

gunzip -c "$DUMP" \
  | grep -v "^CREATE DATABASE" \
  | grep -v "^USE \`" \
  | sudo mysql parfi
```

## 8. Vérifier la restauration

```
sudo mysql -e "
  SELECT
    (SELECT COUNT(*) FROM parfi.utilisateurs)     AS utilisateurs,
    (SELECT COUNT(*) FROM parfi.clients)          AS clients,
    (SELECT COUNT(*) FROM parfi.factures)         AS factures,
    (SELECT COUNT(*) FROM parfi.lettres_mission)  AS lettres_mission,
    (SELECT COUNT(*) FROM parfi.dossier)          AS dossier,
    (SELECT COUNT(*) FROM parfi.production_periode) AS periode,
    (SELECT COUNT(*) FROM parfi.tache_modele)       AS tache_modele;
"
```

Comparer ces chiffres avec ceux consignés au jour de la sauvegarde. Un écart peut signaler :
- une sauvegarde corrompue (peu probable si l'exécution du dump n'a pas échoué — `backup-mysql.sh` refuse d'écraser une sauvegarde valide par un dump vide) ;
- une restauration partielle (interruption réseau, disque plein).

## 9. Créer l'utilisateur applicatif

Si l'utilisateur `parfi@localhost` (celui utilisé par le backend) n'existe pas encore sur le serveur cible :

```
sudo mysql -e "
  CREATE USER 'parfi'@'localhost' IDENTIFIED BY '<MOT_DE_PASSE_APP>';
  GRANT ALL PRIVILEGES ON parfi.* TO 'parfi'@'localhost';
  FLUSH PRIVILEGES;
"
```

Le mot de passe applicatif est celui contenu dans `backend/.env` (`DB_PASSWORD`) — même gestionnaire de mots de passe que ci-dessus, entrée « Parfi CRM — MySQL applicatif ».

## 10. Recréer l'utilisateur de sauvegarde

Sur le nouveau serveur, refaire l'installation initiale de la sauvegarde :

```
sudo mysql -e "
  CREATE USER 'parfi_backup'@'localhost' IDENTIFIED BY '<NOUVEAU_MDP>';
  GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER,
        RELOAD, PROCESS, REPLICATION CLIENT ON *.* TO 'parfi_backup'@'localhost';
"

sudo tee /root/.mysql-backup.cnf > /dev/null <<EOF
[client]
user     = parfi_backup
password = <NOUVEAU_MDP>
EOF
sudo chmod 600 /root/.mysql-backup.cnf
```

Puis :

```
sudo mkdir -p /var/backups/mysql/daily /var/backups/mysql/monthly
sudo chmod 700 /var/backups/mysql /var/backups/mysql/daily /var/backups/mysql/monthly
```

Copier `backup-mysql.sh`, `offsite-upload.sh` et le fichier cron (`/etc/cron.d/parfi-backup-mysql`) depuis le dépôt (`/opt/parfi-crm/scripts/` et l'exemple `parfi-backup.env.example`), puis remplir `/etc/parfi-backup.env` avec les identifiants offsite (clé API restreinte en écriture seule, clé publique `age`).

## 11. Nettoyer

```
shred -u ./"$DUMP" ./"$FILE"          # supprime le .sql.gz déchiffré et le .age local
rm -f ~/parfi-backup-age.key          # supprime la clé privée du poste
```

Sur la console du fournisseur objet, **révoquer les identifiants de lecture** créés à l'étape 3 : ils ne servent qu'à la restauration.

## 12. Journal

Consigner dans le registre du cabinet (ou dans le journal d'audit du CRM une fois qu'il existe) :
- date et heure de la restauration ;
- opérateur ;
- fichier restauré ;
- résultat des contrôles de l'étape 8 ;
- motif de la restauration.

---

## Annexe A — Test régulier de la restauration

Une sauvegarde jamais restaurée n'est pas une sauvegarde. Deux mécanismes :

**Test automatique local** — `restore-test.sh` s'exécute sur les dumps locaux à la demande :

```
sudo /opt/parfi-crm/scripts/restore-test.sh /var/backups/mysql/daily/parfi_YYYY-MM-DD.sql.gz
```

Crée une base `restore_test_<timestamp>`, y restaure le dump, compare le nombre de tables et le contenu de quatre tables clés, puis supprime la base.

**Test complet trimestriel** — restauration offsite selon la présente procédure (§ 4-8) sur un serveur jetable, à faire tourner tous les trois mois. Consigner dans le journal.

---

## Annexe B — Rotation de la clé `age`

Rotation recommandée tous les deux ans, ou immédiate en cas de suspicion de compromission :

1. Générer une nouvelle paire hors ligne : `age-keygen -o parfi-backup-age-v2.key`.
2. Extraire la clé publique et remplacer `/etc/parfi-backup-age.pub` sur le serveur.
3. Les sauvegardes existantes restent déchiffrables avec l'ancienne clé privée — la conserver dans le gestionnaire de mots de passe, marquée « ancienne, à garder pour lecture des backups antérieurs à YYYY-MM-DD ».
4. Consigner au journal du cabinet.

Ne jamais réutiliser une clé privée si elle a été copiée sur un poste de travail non de confiance.
