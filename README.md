# Jarvi

A cross-platform productivity app with task management, notes, AI assistant, and real-time collaboration — available on web and mobile.

## Features

- **Task Management** — Create and organize tasks with priorities, due dates, subtasks, lists, and categories. Drag-and-drop reordering with `@dnd-kit`.
- **AI Assistant** — Streaming chat panel (Anthropic + OpenAI) embedded in the task sidebar. Understands context, executes tool calls (create, update, complete tasks), and renders task card artifacts inline.
- **WhatsApp Agent** — Manage tasks and notes via WhatsApp messages, powered by a queue-based agent (`bullmq` + Twilio).
- **Notes** — Rich-text editor built on Tiptap v3 with markdown, links, images, and task lists. Supports note sharing with collaboration indicators.
- **Categories** — Color-coded categories shared across tasks and notes with full CRUD from a settings panel.
- **Subscriptions & Payments** — Stripe integration with plan management, payment form, and webhooks.
- **Google OAuth** — Passport.js + JWT authentication with Google OAuth 2.0.
- **Real-time Sync** — Socket.IO for live collaboration across clients.
- **Marketing Site** — Next.js App Router site in `packages/marketing` with early-access capture.
- **Design System** — Token-based design system with Figma sync, Storybook, and CSS variables.

## Tech Stack

### Web (`packages/web`)
- React 18 + TypeScript + Vite
- React Router v6, TanStack Query v5
- Tiptap v3 (rich text editor)
- Framer Motion (`motion`)
- Stripe React SDK
- PostHog analytics
- Storybook 8
- CSS Modules (no Tailwind on web)

### Mobile (`packages/mobile`)
- React Native 0.74 + Expo 51
- React Navigation (bottom tabs + stack)
- NativeWind + Tailwind CSS
- TanStack Query v5

### Backend (`packages/backend`)
- Node.js + Express + TypeScript
- PostgreSQL (production) / SQLite (dev) via `pg` / `sqlite3`
- Socket.IO (real-time)
- Passport.js + JWT (auth)
- Stripe (payments + webhooks)
- Anthropic SDK + OpenAI (AI chat)
- BullMQ + Redis (WhatsApp queue)
- Resend (email), Twilio (WhatsApp/SMS)
- Rate limiting, helmet, express-validator

### Marketing (`packages/marketing`)
- Next.js App Router + TypeScript
- MDX support
- Early-access route

### Shared (`packages/shared`)
- Common TypeScript types and design tokens shared across packages

## Project Structure

```
jarvi/
├── packages/
│   ├── backend/              # Express API
│   │   └── src/
│   │       ├── routes/
│   │       ├── controllers/
│   │       ├── services/
│   │       ├── queues/
│   │       ├── middleware/
│   │       └── database/
│   ├── web/                  # React SPA
│   │   └── src/
│   │       ├── components/
│   │       │   ├── features/ # tasks, notes, categories, account, subscription, auth
│   │       │   ├── layout/
│   │       │   └── ui/       # design system primitives
│   │       ├── contexts/
│   │       ├── design-system/ # tokens, CSS variables, Figma sync
│   │       └── hooks/
│   ├── mobile/               # React Native + Expo
│   │   └── src/
│   │       └── screens/
│   ├── marketing/            # Next.js marketing site
│   └── shared/               # Shared types & design tokens
├── docs/
└── docker-compose.yml
```

## Quick Start

### Prerequisites
- Node.js >= 18
- npm >= 9
- Redis (for WhatsApp queue, optional in dev)
- Google Cloud project (OAuth)

### Install & Run

```bash
# Install all dependencies
npm run setup

# Start backend + web together
npm run dev

# Or start everything including mobile
npm run dev:all

# Marketing site
npm run dev:marketing
```

Default ports are configured in each package's `.env` file.

### Environment Setup

Copy the example files and fill in your credentials:

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/web/.env.example packages/web/.env.local
```

Required services: Google OAuth, a database (SQLite for dev / PostgreSQL for production), and optionally Stripe, an AI provider, Twilio, and Resend depending on which features you want to enable.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Backend + web |
| `npm run dev:all` | Backend + web + mobile |
| `npm run dev:marketing` | Marketing site |
| `npm run dev:stripe` | Backend + web + Stripe webhook listener |
| `npm run build` | Build all packages |
| `npm run build:web` | Build web for deployment |
| `npm run build:marketing` | Build marketing site |
| `npm run storybook` | Launch Storybook |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database |
| `npm run type-check` | TypeScript check across all packages |
| `npm run lint` | Lint all packages |
| `npm run format` | Prettier format |
| `npm run clean` | Remove all build artifacts and node_modules |
| `npm run docker:up` | Start services via Docker Compose |

## Database

SQLite in development, PostgreSQL in production. Switch by setting `DATABASE_URL` in the backend `.env`.

## AI Features

The AI chat panel streams responses from Anthropic (Claude) or OpenAI via the backend. The assistant can answer questions about tasks, create/update/complete tasks via tool calls, and render task card artifacts inline in the chat.

The WhatsApp agent processes incoming messages asynchronously using a background queue, interpreting natural language commands to manage tasks and notes.

## Stripe Integration

See [`docs/STRIPE_SETUP.md`](./docs/STRIPE_SETUP.md) for full setup. Stripe handles subscription plans, payment processing, webhook events, and plan management.

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — System architecture
- [`docs/PRODUCTION_PLAN.md`](./docs/PRODUCTION_PLAN.md) — Deployment guide
- [`docs/STRIPE_SETUP.md`](./docs/STRIPE_SETUP.md) — Stripe configuration
- [`packages/web/src/design-system/README.md`](./packages/web/src/design-system/README.md) — Design system

## License

MIT
