# AGENTS.md

## Cursor Cloud specific instructions

### Architecture

Jarvi is an npm workspaces monorepo with 5 packages:

| Package | Path | Dev command | Port |
|---------|------|-------------|------|
| Backend (Express + TS) | `packages/backend` | `npm run dev:backend` | 3001 |
| Web (React + Vite) | `packages/web` | `npm run dev:web` | 3000 |
| Marketing (Next.js) | `packages/marketing` | `npm run dev:marketing` | 3002 |
| Mobile (Expo) | `packages/mobile` | `npm run dev:mobile` | 8081 |
| Shared (types/tokens) | `packages/shared` | `npm run build:shared` | N/A |

Run backend + web together: `npm run dev` from the root.

### Environment variables

Backend requires a `.env` at `packages/backend/.env` with at minimum:
- `JWT_SECRET` – any 64+ hex chars
- `RESEND_API_KEY` – even a dummy value like `re_dev_placeholder` is required or the backend crashes at startup (the Resend SDK throws if the key is missing)
- `GOOGLE_CLIENT_ID` – placeholder is fine for API-only testing; real OAuth requires valid credentials

Web requires a `.env` at `packages/web/.env` with:
- `VITE_API_URL=http://localhost:3001/api`

### Database

Dev uses SQLite (auto-created at `packages/backend/jarvi.db`). No external database needed. Migrations run automatically on startup.

### Important caveats

- **Redis not required for core dev**: The WhatsApp/Gmail queue workers will log `ECONNREFUSED` to Redis (port 6379) on startup but the app runs fine without Redis. These are non-blocking background workers.
- **Shared must be built before web/backend**: Run `npm run build:shared` if you change code in `packages/shared`. The update script handles this.
- **ESLint config is broken**: The `.eslintrc.js` files reference `@typescript-eslint/recommended` (v8 style) but use `@typescript-eslint/eslint-plugin` v6 which expects `plugin:@typescript-eslint/recommended`. Use `npx tsc --noEmit` for type checking instead.
- **No automated test suites**: No `test` scripts are configured in workspace packages.
- **Build verification**: `npx tsc --noEmit` in `packages/backend` and `packages/web` are the best static verification checks.

### Quick start for future agents

1. The update script handles `npm install` and `npm run build:shared && npm run build:backend`.
2. Create env files if missing (see above).
3. Start services with `npm run dev` (backend + web concurrently).
4. Health check: `curl http://localhost:3001/health`

### Auth for API testing

You can register a user via POST `/api/auth/register` with `{email, name, password}`, then manually verify in SQLite:
```
cd packages/backend && node -e "
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
(async () => {
  const db = await open({ filename: './jarvi.db', driver: sqlite3.Database });
  await db.run('UPDATE users SET email_verified = 1 WHERE email = ?', ['YOUR_EMAIL']);
})();
"
```
Then login via POST `/api/auth/login` with `{email, password}` to get a JWT token.
