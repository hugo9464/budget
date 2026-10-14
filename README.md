# Mon budget

PWA personnelle de gestion de budget, synchronisée avec BoursoBank via GoCardless Bank Account Data. L’application est construite avec Next.js, TypeScript, Supabase et OpenAI.

## Démarrage local

Prérequis : Node.js 22 LTS ou 24+, npm et Docker pour utiliser Supabase localement.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Le mode démo est activé par défaut. Ouvrez `http://localhost:3000`, connectez-vous avec n’importe quelle adresse email et le mot de passe `demo1234`. Le mode démo n’appelle ni Supabase, ni GoCardless, ni OpenAI.

## Configuration de production

1. Créez un projet Supabase récent et appliquez `supabase/migrations/20260712000000_initial_budget_schema.sql` avec le CLI Supabase ou le SQL Editor.
2. Créez un compte dans le portail **GoCardless Bank Account Data**, puis récupérez `secret_id` et `secret_key`.
3. Créez une clé API OpenAI avec une limite de dépense adaptée.
4. Dans Supabase **Authentication** : créez votre utilisateur (**Users → Add user**, email + mot de passe, « Auto Confirm User »), puis **désactivez les inscriptions** (**Sign In / Providers → Allow new users to sign up** décoché). Indispensable : tout utilisateur Supabase Auth a accès à l’application.
5. Générez un secret de session (signature des retours bancaires) :

```bash
openssl rand -base64 48
```

6. Configurez les variables Vercel suivantes :

| Variable | Utilisation |
| --- | --- |
| `DEMO_MODE=false` | Active les données réelles |
| `SESSION_SECRET` | Secret aléatoire de signature des jetons de retour bancaire |
| `NEXT_PUBLIC_APP_URL` | URL HTTPS publique, sans slash final |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SECRET_KEY` | Clé secrète serveur, jamais publique |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | URL et clé publishable, pour Supabase Auth |
| `GOCARDLESS_SECRET_ID` / `GOCARDLESS_SECRET_KEY` | Identifiants Bank Account Data |
| `GOCARDLESS_SANDBOX=false` | Utiliser BoursoBank réel |
| `OPENAI_API_KEY` | Catégorisation des seuls libellés inconnus |
| `OPENAI_MODEL=gpt-5.4-nano` | Modèle de classification |

La clé Supabase secrète ne doit jamais porter le préfixe `NEXT_PUBLIC_`. Les tables ont RLS activé, aucun accès `anon`/`authenticated`, et ne sont manipulées que par les routes serveur après validation de la session. La connexion utilise Supabase Auth (email + mot de passe) ; la session est gérée par les cookies `@supabase/ssr` et vérifiée côté serveur avec `getClaims`.

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Le service worker ne met en cache que la page hors ligne et les icônes. Les pages authentifiées, les API, les soldes et les transactions restent en réseau uniquement.
