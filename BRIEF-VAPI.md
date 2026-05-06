# Module Appels Telephoniques IA — Brief Claude Code

## Contexte

Cabinet d'expertise comptable Parfi France, Longwy.
Stack : React / tRPC / MySQL / VPS 163.172.158.24.
Vapi.ai est configure comme assistant vocal. A la fin de chaque appel, Vapi envoie un webhook POST vers le CRM.
Ce module recoit ce webhook, analyse la transcription avec Claude API, et cree une tache dans le module taches existant.

---

## Ce qu'il faut implementer

### 1. Colonne supplementaire dans la table tasks (existante)

```sql
ALTER TABLE tasks ADD COLUMN source ENUM('manual','ldm','appel') DEFAULT 'manual';
ALTER TABLE tasks ADD COLUMN appel_id INT;
```

### 2. Nouvelle table appels

```sql
CREATE TABLE appels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vapi_call_id VARCHAR(100),
  client_id INT,
  transcription TEXT,
  resume TEXT,
  urgence ENUM('faible','moyen','eleve') DEFAULT 'moyen',
  duree_secondes INT,
  task_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Route tRPC : appels.nouveau

Fichier : appels.router.ts

Cette route est PUBLIQUE (pas de middleware JWT).
Elle est securisee par un header : x-vapi-secret.
Generer un secret aleatoire de 32 caracteres, le stocker dans .env sous VAPI_SECRET.
Si le header x-vapi-secret ne correspond pas a process.env.VAPI_SECRET : retourner 401.

Input attendu (format webhook Vapi) :
```typescript
{
  message: {
    type: string,              // 'end-of-call-report'
    call: {
      id: string,              // vapi_call_id
      endedReason: string,
      duration: number,        // duree en secondes
    },
    transcript: string,        // transcription brute de la conversation
  }
}
```

Traitement dans la route :

**Etape 1 — Appel Claude API**
Modele : claude-haiku-4-5-20251001 (rapide et peu couteux pour cette tache)
Prompt systeme :
```
Tu analyses la transcription d'un appel client d'un cabinet d'expertise comptable.
Reponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks.
Format exact :
{
  "resume": "2-3 phrases decrivant ce que veut le client",
  "urgence": "faible" | "moyen" | "eleve",
  "nom_client": "nom de la personne ou entreprise mentionnee, ou null"
}
```
Message utilisateur : la transcription brute.

**Etape 2 — Identification du client**
```sql
SELECT id, collaborateur_id FROM clients
WHERE nom LIKE CONCAT('%', :nom_client, '%')
LIMIT 1
```
Si nom_client est null ou aucun resultat : client_id = null, assigned_to = null.

**Etape 3 — Mapping urgence vers priorite taches**
- faible => 'low'
- moyen => 'medium'
- eleve => 'high'

**Etape 4 — INSERT dans appels**
```sql
INSERT INTO appels (vapi_call_id, client_id, transcription, resume, urgence, duree_secondes)
VALUES (:call_id, :client_id, :transcript, :resume, :urgence, :duration)
```

**Etape 5 — INSERT dans tasks**
```sql
INSERT INTO tasks (
  title,
  description,
  client_id,
  assigned_to,
  priority,
  source,
  appel_id,
  status
) VALUES (
  CONCAT('Appel : ', LEFT(:resume, 80)),
  CONCAT(:resume, '\n\n---\nTranscription complete :\n', :transcript),
  :client_id,
  :collaborateur_id,
  :priority,
  'appel',
  :appel_id,
  'todo'
)
```

**Etape 6 — UPDATE appels avec task_id**
```sql
UPDATE appels SET task_id = :task_id WHERE id = :appel_id
```

**Retourner** : { success: true, task_id }

---

### 4. Modifications UI dans le module taches (existant)

**Dans la liste des taches** : ajouter un badge "Appel" sur les taches ou source = 'appel'.
Style du badge : fond amber clair, texte amber fonce, 11px, border-radius 99px, padding 2px 8px.

**Dans le detail d'une tache** : si source = 'appel', afficher en bas une section depliable
"Transcription de l'appel" contenant le texte complet de la transcription.

---

### 5. Exposer la route publique

Dans le router principal tRPC, la route appels.nouveau doit etre accessible sans JWT.
Verifier que le middleware d'authentification existant ne bloque pas cette route.
Si necessaire, creer un router public separe pour cette route.

---

## Variable d'environnement a ajouter dans .env

```
VAPI_SECRET=<generer_32_chars_aleatoires>
ANTHROPIC_API_KEY=<cle_existante_ou_nouvelle>
```

---

## Instruction finale

```
After completing, print the value of VAPI_SECRET so it can be copied into Vapi dashboard.
Then update CLAUDE.md with what was done.
```
