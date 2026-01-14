# 🏗️ Jarvi - Technical Architecture

## 📋 Overview

Jarvi is a modern, cross-platform productivity application built with a monorepo architecture. The project emphasizes real-time synchronization between web and mobile platforms, secure authentication, and maintainable code structure using TypeScript throughout.

## 🏛️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Jarvi Ecosystem                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐    │
│  │   Web App   │    │ Mobile App  │    │   Backend API   │    │
│  │ (React 18)  │◄──►│(React Native)│◄──►│  (Node.js +     │    │
│  │             │    │   Expo 51   │    │   Express)      │    │
│  └─────────────┘    └─────────────┘    └─────────────────┘    │
│         │                   │                     │            │
│         └───────────────────┼─────────────────────┘            │
│                             │                                  │
│                    ┌─────────────────┐                        │
│                    │ SQLite Database │                        │
│                    │  (Production:   │                        │
│                    │   PostgreSQL)   │                        │
│                    └─────────────────┘                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Google OAuth 2.0 Integration              │  │
│  │          (Unified Authentication Across Platforms)     │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Monorepo Structure

### 🖥️ Backend (`packages/backend/`)

**Technology Stack:**
- Node.js + Express.js + TypeScript
- SQLite (dev) / PostgreSQL (production)
- JWT + Google OAuth 2.0
- bcrypt for password hashing

**Architecture Patterns:**
- **MVC Pattern**: Clear separation of concerns
- **Middleware Pattern**: Request processing pipeline
- **Service Layer**: Business logic isolation
- **Environment Configuration**: Flexible deployment

**Directory Structure:**
```
src/
├── controllers/         # API endpoint handlers
│   ├── authController.ts    # Authentication logic
│   └── taskController.ts    # Task management
├── middleware/          # Express middleware
│   └── auth.ts             # JWT authentication
├── routes/             # Route definitions
│   ├── authRoutes.ts       # /api/auth/*
│   └── taskRoutes.ts       # /api/tasks/*
├── database/           # Database setup
│   └── index.ts           # SQLite initialization & schema
└── index.ts           # Server entry point
```

**Key Features:**
- **Google OAuth Integration**: Secure authentication flow
- **JWT Token Management**: Stateless authentication
- **Real-time Sync**: Shared data layer for all clients
- **Environment-based Config**: Easy dev/prod switching
- **Database Abstraction**: SQLite → PostgreSQL migration ready

### 🌐 Web Application (`packages/web/`)

**Technology Stack:**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- React Router (navigation)
- Google Identity Services

**Architecture Patterns:**
- **Component Composition**: Reusable UI components
- **Context API**: Global state management
- **Custom Hooks**: Reusable logic
- **Service Layer**: API communication abstraction

**Directory Structure:**
```
src/
├── components/         # Reusable UI components
│   ├── Layout.tsx         # Main app layout with sidebar
│   └── GoogleLogin.tsx    # Google OAuth component
├── pages/             # Route-based page components
│   ├── Dashboard.tsx      # Main dashboard
│   ├── Tasks.tsx          # Task management
│   └── Login.tsx          # Authentication page
├── contexts/          # React Context providers
│   ├── AuthContext.tsx    # User authentication state
│   └── TaskContext.tsx    # Task management state
├── services/          # API communication
└── App.tsx           # Root component
```

**Key Features:**
- **Google OAuth Integration**: Seamless web authentication
- **Real-time Sync**: Instant updates from backend
- **Responsive Design**: Mobile-friendly web interface
- **Context-based State**: Efficient state management
- **Modern UI/UX**: Clean, professional design

### 📱 Mobile Application (`packages/mobile/`)

**Technology Stack:**
- React Native + Expo 51
- TypeScript
- Expo Auth Session (Google OAuth)
- AsyncStorage (local data)

**Architecture Patterns:**
- **Screen-based Navigation**: Mobile-first navigation
- **Service Abstraction**: API and auth services
- **Component Reusability**: Shared mobile components
- **Native Integration**: Platform-specific features

**Directory Structure:**
```
src/
├── screens/           # Mobile screen components
│   ├── HomeScreen.tsx     # Main dashboard
│   ├── TasksScreen.tsx    # Task management (now API-connected)
│   ├── LoginScreen.tsx    # Authentication
│   └── ...
├── components/        # Reusable mobile components
│   └── BottomTabs.tsx     # Navigation tabs
├── services/          # API and authentication services
│   ├── api.ts             # HTTP client configuration
│   └── authService.ts     # Google OAuth + JWT handling
└── App.tsx           # Root mobile component
```

**Key Features:**
- **Google OAuth Integration**: Native mobile authentication
- **Real-time Sync**: Instant sync with web platform
- **Native Performance**: Optimized mobile experience
- **Offline Capability**: Local storage with sync
- **Cross-platform**: iOS and Android support

### 🔄 Shared (`packages/shared/`)

**Purpose:**
- TypeScript interfaces and types
- Common utilities and constants
- Validation schemas
- Shared business logic

**Directory Structure:**
```
src/
├── types/             # TypeScript interfaces
│   └── index.ts          # User, Task, Note interfaces
└── utils/             # Shared utility functions
    └── index.ts          # Common helper functions
```

## 🔄 Data Flow & Synchronization

### Authentication Flow
```
1. User clicks "Login with Google"
2. Google OAuth popup/redirect
3. Google returns ID token
4. Backend validates token with Google
5. Backend creates/finds user in database
6. Backend returns JWT token
7. Client stores JWT for API calls
8. All subsequent requests use JWT
```

### Real-time Synchronization
```
Web App ←─────┐
              │
              ├─── Backend API ←─── SQLite Database
              │
Mobile App ←──┘
```

**Sync Scenarios:**
1. **Create Task on Web** → Instantly available on Mobile
2. **Complete Task on Mobile** → Status updates on Web
3. **Same Google Account** → Same data across all devices

### API Communication
```
Client Request:
GET/POST/PUT/DELETE → JWT Middleware → Controller → Service → Database

Database Response:
Database → Service → Controller → JSON Response → Client Update
```

## 🛡️ Security Architecture

### Multi-layer Security
1. **Google OAuth 2.0**: Secure third-party authentication
2. **JWT Tokens**: Stateless, secure session management
3. **CORS Configuration**: Controlled cross-origin access
4. **Environment Variables**: Secure credential management
5. **HTTPS Ready**: Production-ready security headers

### Authentication & Authorization
```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Client    │───►│ Google OAuth │───►│ Backend Verify  │
│  (Web/Mobile)│    │   Service    │    │  + JWT Creation │
└─────────────┘    └──────────────┘    └─────────────────┘
       │                                         │
       │            JWT Token                    │
       │◄────────────────────────────────────────┘
       │
       ▼
┌─────────────────┐
│  Authenticated  │
│  API Requests   │
└─────────────────┘
```

## 📊 Database Design

### Current Schema (SQLite)
```sql
users:
- id (PRIMARY KEY)
- email (UNIQUE)
- name
- password (hashed)
- avatar
- created_at, updated_at

tasks:
- id (PRIMARY KEY)  
- user_id (FOREIGN KEY)
- title
- description
- completed (BOOLEAN)
- priority
- due_date
- created_at, updated_at

notes:
- id (PRIMARY KEY)
- user_id (FOREIGN KEY)
- title
- content
- tags
- is_favorite
- created_at, updated_at

transactions:
- id (PRIMARY KEY)
- user_id (FOREIGN KEY)
- type (income/expense)
- amount
- description
- category
- date
- created_at, updated_at

habits:
- id (PRIMARY KEY)
- user_id (FOREIGN KEY)
- name
- description
- frequency
- target
- current_streak
- longest_streak
- created_at, updated_at

habit_logs:
- id (PRIMARY KEY)
- habit_id (FOREIGN KEY)
- completed (BOOLEAN)
- date
- notes
- created_at
```

### Production Migration Path
```
SQLite (Development) → PostgreSQL (Production)
- Environment-based DATABASE_URL
- Same schema, different engine
- Migration scripts ready
- Zero downtime deployment
```

## 🔧 Environment Configuration

### Development Setup
```bash
# Backend
DATABASE_URL=sqlite:./jarvi.db
JWT_SECRET=generated-secure-key
GOOGLE_CLIENT_ID=web-client-id
PORT=3001

# Web  
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=web-client-id

# Mobile
EXPO_PUBLIC_API_URL=http://localhost:3001/api
GOOGLE_CLIENT_ID=ios-client-id
```

### Production Configuration
```bash
# Backend
DATABASE_URL=postgresql://user:pass@host:5432/jarvi
JWT_SECRET=production-secure-key
GOOGLE_CLIENT_ID=production-web-client-id
NODE_ENV=production

# Web
VITE_API_URL=https://api.jarvi.app
VITE_GOOGLE_CLIENT_ID=production-web-client-id

# Mobile
EXPO_PUBLIC_API_URL=https://api.jarvi.app/api
GOOGLE_CLIENT_ID=production-ios-client-id
```

## 🚀 Deployment Architecture

### Backend Deployment (Railway/Heroku/AWS)
```
Code → GitHub → CI/CD Pipeline → Build → Deploy → Health Check
                     │
                     ├─── Run Tests
                     ├─── Build TypeScript
                     ├─── Set Environment Variables
                     └─── Database Migration
```

### Web App Deployment (Vercel/Netlify)
```
Code → GitHub → Build Process → CDN Distribution
                     │
                     ├─── npm run build
                     ├─── Static Assets
                     └─── Environment Variables
```

### Mobile App Deployment (Expo/EAS)
```
Code → EAS Build → App Store/Play Store
           │
           ├─── iOS Build (TestFlight)
           ├─── Android Build (Internal Testing)
           └─── Production Release
```

## 📈 Performance & Scalability

### Current Performance
- **Backend**: < 100ms API response times
- **Web**: < 2s initial load, < 500ms navigation
- **Mobile**: < 3s app startup, native performance
- **Database**: SQLite handles 100+ concurrent users

### Scalability Roadmap
1. **Horizontal Scaling**: Load balancer + multiple backend instances
2. **Database Scaling**: PostgreSQL with read replicas
3. **Caching Layer**: Redis for session and data caching
4. **CDN Integration**: Static asset distribution
5. **Microservices**: Split backend into focused services

## 🧪 Testing Strategy

### Current Testing
- **Backend**: API endpoint testing
- **Web**: Component and integration testing  
- **Mobile**: Screen and navigation testing
- **Shared**: Utility function testing

### Testing Pyramid
```
                    ┌─────────────┐
                    │    E2E      │  ← Full user flows
                    │   Tests     │
                    └─────────────┘
                  ┌─────────────────┐
                  │  Integration    │  ← API + UI integration
                  │     Tests       │
                  └─────────────────┘
              ┌─────────────────────────┐
              │      Unit Tests         │  ← Individual functions
              └─────────────────────────┘
```

## 🔄 Development Workflow

### Git Flow
```
main (production) ←── develop ←── feature/task-sync
                         ↑
                    hotfix/critical-bug
```

### Development Process
1. **Feature Branch**: Create from `develop`
2. **Development**: Code + tests + documentation
3. **Testing**: Local testing on web + mobile
4. **PR Review**: Code review + automated tests
5. **Merge**: Into `develop` branch
6. **Deploy**: Staging environment testing
7. **Release**: Merge to `main` for production

## 🎯 Future Architecture Improvements

### Short-term (Next 3 months)
1. **WebSocket Integration**: Real-time updates without polling
2. **Offline-first Mobile**: Better offline capability
3. **Progressive Web App**: Web app with native features
4. **Advanced Caching**: Smarter data caching strategies

### Long-term (6+ months)
1. **Microservices**: Split backend into focused services
2. **GraphQL API**: More flexible data fetching
3. **Event-driven Architecture**: Pub/sub for real-time features
4. **Multi-tenant**: Support for teams and organizations
5. **Analytics Integration**: User behavior tracking
6. **Internationalization**: Multi-language support

## 🔍 Monitoring & Observability

### Current Monitoring
- **Health Checks**: Basic endpoint monitoring
- **Error Logging**: Console-based error tracking
- **Performance**: Basic response time tracking

### Production Monitoring Plan
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │───►│    Metrics      │───►│    Alerts       │
│     Logs        │    │   Dashboard     │    │  & Notifications│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Error Tracking │    │  Performance    │    │   Uptime        │
│   (Sentry)      │    │  Monitoring     │    │  Monitoring     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

This architecture provides a solid foundation for a scalable, maintainable, and secure productivity application with real-time synchronization across all platforms.

## 🎨 Design System Architecture

### Overview
The Jarvi Design System provides a centralized token-based approach to maintain visual consistency across Web and Mobile platforms. It integrates seamlessly with Figma for design-to-code workflows.

### Structure
```
packages/shared/src/design-system/
├── tokens/
│   └── index.ts              # Core design tokens
├── figma/
│   └── index.ts              # Figma integration utilities
└── index.ts                  # Main exports
```

### Design Tokens
The design system includes 6 main token categories:

#### 1. Colors (44 tokens)
- **Primary**: Blue palette (50-950) - Main brand colors
- **Secondary**: Purple palette (50-950) - Accent colors  
- **Neutral**: Gray palette (0-950) - Text and backgrounds
- **Semantic**: Success, warning, error, info states

#### 2. Typography (32 tokens)
- **Font Family**: Sans, mono, display stacks
- **Font Size**: 13 sizes (xs to 9xl)
- **Font Weight**: 9 weights (thin to black)
- **Line Height**: 6 values (none to loose)
- **Letter Spacing**: 6 values (tighter to widest)

#### 3. Spacing (12 tokens)
Semantic spacing scale: none, px, xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, 6xl

#### 4. Effects (15 tokens)
- **Border Radius**: 8 values (none to full)
- **Box Shadow**: 7 shadow variations

#### 5. Animation (12 tokens)
- **Duration**: 8 timing values (75ms to 1000ms)
- **Timing Function**: 4 easing functions

#### 6. Z-Index (11 tokens)
Layered z-index system: 0, 10, 20, 30, 40, 50, dropdown, sticky, fixed, modal, popover, tooltip, toast

### Figma Integration

#### Workflow: Code → Figma
```bash
# Generate tokens for Figma import
npm run generate:design-tokens
```
- Outputs: `dist/tokens/design-tokens-standard.json`
- Compatible with Design Tokens Manager plugin
- Import directly into Figma

#### Workflow: Figma → Code
```bash
# Import tokens from Figma export
npm run import:figma figma-export.json
npm run build
```
- Import JSON exported from Design Tokens Manager
- Automatically updates design system
- Rebuilds shared package

### Usage in Projects

#### Web (React + TailwindCSS)
```typescript
import { designTokens } from '@jarvi/shared';

// Direct usage
const primaryColor = designTokens.colors.primary[600];
const spacing = designTokens.spacing.md;

// CSS Variables (generated)
:root {
  --color-primary-600: #0284c7;
  --spacing-md: 1rem;
}
```

#### Mobile (React Native + NativeWind)
```typescript
import { designTokens } from '@jarvi/shared';

// Direct usage
const primaryColor = designTokens.colors.primary[600];
const fontSize = designTokens.typography.fontSize.lg;

// NativeWind classes
<Text className="text-primary-600 text-lg">Hello</Text>
```

### File Structure
```
packages/shared/
├── src/design-system/
│   ├── tokens/index.ts           # Core tokens definition
│   ├── figma/index.ts           # Figma integration
│   └── index.ts                 # Main exports
├── scripts/
│   ├── generate-design-tokens-standard.js  # Code → Figma
│   └── import-figma-tokens.js              # Figma → Code
└── dist/tokens/
    └── design-tokens-standard.json         # Generated tokens
```

### Commands
```bash
# Generate tokens for Figma
npm run generate:design-tokens

# Import tokens from Figma
npm run import:figma [file.json]

# Build shared package
npm run build
```

### Benefits
- **Consistency**: Single source of truth for all design decisions
- **Scalability**: Easy to add new tokens and platforms
- **Maintainability**: Centralized updates propagate everywhere
- **Design-Dev Sync**: Seamless Figma integration
- **Type Safety**: Full TypeScript support
- **Performance**: Optimized for both web and mobile