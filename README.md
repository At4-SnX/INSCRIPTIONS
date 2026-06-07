# 🎖️ Bot Inscription — Gendarmerie Nationale RP

## Variables d'environnement Railway

| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Token du bot Discord |
| `CLIENT_ID` | ✅ | Application ID Discord |
| `GUILD_ID` | ✅ | ID du serveur Discord (enregistrement instantané des commandes) |
| `FORUM_INSCRIPTION_ID` | ✅ | ID du salon **Forum** où les candidatures sont postées |
| `ROLE_ECOLE_2` | ✅ | ID du 2ᵉ rôle école à ajouter si ACCEPTÉ (le 1er est hardcodé) |

---

## Fonctionnement

### 1. Poster le panel de recrutement
```
/panel_inscription
```
Poster le bouton de candidature dans un salon. Commande réservée aux gestionnaires (`Manage Guild`).

### 2. Déposer une candidature
- Via le bouton du panel **ou** via `/inscription`
- Un **modal Discord** s'ouvre avec 4 champs :
  - Nom et Prénom RP
  - Âge RP
  - Affectation souhaitée
  - Spécialité voulue
- La candidature est postée dans le **Forum** avec le **Nom Prénom RP comme titre du post**
- Les boutons ✅ Accepter / ❌ Refuser apparaissent sur le post

### 3. Décision — ACCEPTÉ
- Tous les rôles sont retirés
- Rôles école ajoutés : `1508161838968471742` + `ROLE_ECOLE_2`
- Membre renommé : `NOM Prénom [NIGEND]` (ex : `DUPONT Jean [482931]`)
- NIGEND à 6 chiffres généré automatiquement
- DM envoyé au candidat

### 4. Décision — REFUSÉ
- Tous les rôles sont retirés
- Rôles refus ajoutés : `1509596844701909002` + `1508169377470480384`
- DM envoyé au candidat

---

## Permissions bot requises
`Manage Roles` · `Manage Nicknames` · `Send Messages` · `Embed Links` · `Create Public Threads` · `Read Message History`

## Intents requis (Developer Portal → Bot)
- ✅ Server Members Intent
- ✅ Message Content Intent
