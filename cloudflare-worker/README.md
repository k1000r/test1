# Proxy Vincod — Cloudflare Worker

Ce Worker sert d'intermédiaire entre l'app Mon Cellier et l'API Vincod.

## Étapes de déploiement

### 1. Créer un compte Vincod
1. Allez sur [vincod.com](https://www.vincod.com)
2. Créez un compte (plan gratuit disponible)
3. Récupérez votre **clé API** dans votre tableau de bord

### 2. Créer un compte Cloudflare (gratuit)
1. Allez sur [cloudflare.com](https://www.cloudflare.com)
2. Créez un compte gratuit
3. Les Workers gratuits = 100 000 requêtes/jour — largement suffisant

### 3. Installer et déployer

```bash
# Installer Wrangler (outil Cloudflare)
npm install -g wrangler

# Se connecter à Cloudflare
wrangler login

# Dans ce dossier — ajouter la clé Vincod comme secret sécurisé
wrangler secret put VINCOD_API_KEY
# → Entrez votre clé Vincod quand demandé

# Déployer le Worker
wrangler deploy
```

### 4. Récupérer l'URL du Worker

Après le déploiement, Wrangler affiche une URL comme :
```
https://mon-cellier-vincod.VOTRE-SOUS-DOMAINE.workers.dev
```

### 5. Configurer l'app

Dans l'app Mon Cellier → **Profil** → **Base de données SAQ** :
- Collez l'URL du Worker dans le champ **URL du proxy Vincod**
- Appuyez sur **Enregistrer**

Le scanner utilisera désormais Vincod en premier pour tous les lookups.

## Autoriser votre domaine

Si votre app est sur un domaine différent de `k1000r.github.io`,
modifiez la liste `ALLOWED_ORIGINS` dans `worker.js` avant de déployer.

## Endpoints disponibles

| Endpoint | Description |
|---|---|
| `GET /ean/{barcode}` | Lookup par code-barres EAN-13 |
| `GET /vincod/{code}` | Lookup par code Vincod |
| `GET /search?q={nom}` | Recherche par nom de vin |
| `GET /health` | Test de fonctionnement |
