# 🚀 Jarvi - Productivity App

A modern, cross-platform productivity application featuring task management, notes, personal finance tracking, and habit monitoring with real-time synchronization between web and mobile platforms.

## ✨ Features

- 📝 **Task Management** - Create, organize, and track tasks with priorities and due dates
- 📔 **Notes** - Rich text notes with categories and search functionality  
- 💰 **Personal Finance** - Track income, expenses, and financial goals
- 🎯 **Habit Tracking** - Monitor daily habits and build streaks
- 🔐 **Google OAuth Authentication** - Secure authentication with Google accounts
- 📱 **Cross-Platform Sync** - Real-time synchronization between web and mobile
- 🌙 **Modern UI** - Clean, responsive design with dark mode support

## 🛠️ Technology Stack

### Frontend
- **Web**: React 18, TypeScript, Vite, Tailwind CSS, React Router
- **Mobile**: React Native, Expo 51, TypeScript, React Navigation

### Backend
- **Server**: Node.js, Express, TypeScript
- **Database**: SQLite (development), PostgreSQL (production ready)
- **Authentication**: JWT + Google OAuth 2.0
- **Real-time Sync**: RESTful API with shared data layer

### Architecture
- **Monorepo**: Organized with shared types and utilities
- **TypeScript**: Full type safety across all platforms
- **Environment-based**: Easy configuration for dev/staging/production

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- iOS Simulator or Expo Go app
- Google Cloud Console project (for OAuth)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd Jarvi

# Install all dependencies
npm run install:all

# Build shared package
npm run build:shared
```

### Environment Setup

1. **Backend Configuration**
   ```bash
   cd packages/backend
   cp .env.example .env
   # Edit .env with your Google OAuth credentials
   ```

2. **Web Configuration**
   ```bash
   cd packages/web
   # Create .env.local file
   echo "VITE_API_URL=http://localhost:3001
   VITE_GOOGLE_CLIENT_ID=your-google-web-client-id" > .env.local
   ```

3. **Mobile Configuration**
   ```bash
   cd packages/mobile
   cp env.example .env
   # Edit .env with your Google OAuth credentials
   ```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **People API** or **Google+ API**
4. Configure OAuth consent screen (External for testing)
5. Create OAuth 2.0 Client IDs:
   - **Web Application**: Add `http://localhost:3000` to authorized origins
   - **iOS**: Bundle ID = `com.jarvi.app`
   - **Android**: Package name = `com.jarvi.app`
6. Update your `.env` files with the Client IDs

### Running the Application

```bash
# Start all services
npm run dev:all

# Or start individually:
npm run dev:backend  # http://localhost:3001
npm run dev:web      # http://localhost:3000
npm run dev:mobile   # Expo development server
```

## 📁 Project Structure

```
Jarvi/
├── packages/
│   ├── backend/              # Node.js + Express API
│   │   ├── src/
│   │   │   ├── routes/       # API endpoints
│   │   │   ├── controllers/  # Business logic
│   │   │   ├── middleware/   # Auth & validation
│   │   │   ├── database/     # SQLite setup & schema
│   │   │   └── index.ts      # Server entry point
│   │   ├── jarvi.db         # SQLite database file
│   │   ├── .env             # Environment variables
│   │   └── SETUP.md         # Backend-specific setup
│   ├── web/                 # React web application
│   │   ├── src/
│   │   │   ├── components/  # React components
│   │   │   ├── pages/       # Page components
│   │   │   ├── contexts/    # React contexts (Auth, Tasks)
│   │   │   └── services/    # API services
│   │   └── .env.local       # Web environment variables
│   ├── mobile/              # React Native + Expo
│   │   ├── src/
│   │   │   ├── screens/     # Mobile screens
│   │   │   ├── components/  # Mobile components
│   │   │   └── services/    # API & auth services
│   │   └── .env             # Mobile environment variables
│   └── shared/              # Shared TypeScript types
│       └── src/types/       # Common interfaces
├── ARCHITECTURE.md          # Technical architecture
└── README.md               # This file
```

## 🔧 Available Scripts

### Development
- `npm run dev:all` - Start all services (recommended)
- `npm run dev:backend` - Backend only (port 3001)
- `npm run dev:web` - Web app only (port 3000)
- `npm run dev:mobile` - Expo development server

### Mobile Development
- `npm run mobile:ios` - Run on iOS Simulator
- `npm run mobile:android` - Run on Android Emulator
- Press `i` in Expo terminal to open iOS Simulator
- Press `a` in Expo terminal to open Android Emulator

### Build & Deploy
- `npm run build` - Build all packages for production
- `npm run build:shared` - Build shared package only
- `npm run build:web` - Build web app for deployment

### Maintenance
- `npm run clean` - Clean all build artifacts
- `npm run install:all` - Install dependencies for all packages

## 🗄️ Database

### Schema
The SQLite database includes these tables:
- **users** - User accounts and Google OAuth data
- **tasks** - Task management with sync across platforms
- **notes** - Rich text notes with categories
- **transactions** - Financial transactions tracking
- **habits** - Habit definitions and streaks
- **habit_logs** - Daily habit completion records

### Viewing Database
```bash
# View all tables
sqlite3 packages/backend/jarvi.db ".tables"

# View users
sqlite3 packages/backend/jarvi.db -header -column "SELECT name, email FROM users;"

# View tasks with user info
sqlite3 packages/backend/jarvi.db -header -column "
SELECT t.title, t.description, 
       CASE WHEN t.completed = 1 THEN '✅ Done' ELSE '⏳ Pending' END as Status,
       u.name as User 
FROM tasks t 
JOIN users u ON t.user_id = u.id 
ORDER BY t.created_at DESC;"

# Count tasks by user
sqlite3 packages/backend/jarvi.db -header -column "
SELECT u.name, COUNT(t.id) as 'Total Tasks' 
FROM users u 
LEFT JOIN tasks t ON u.id = t.user_id 
GROUP BY u.id;"
```

### Database Configuration
The `DATABASE_URL` environment variable allows easy switching between:
- **Development**: `sqlite:./jarvi.db`
- **Production**: `postgresql://user:pass@host:5432/jarvi`
- **Testing**: `sqlite::memory:`

## 🔐 Authentication & Sync

### How It Works
1. **Google OAuth**: Users authenticate with their Google account
2. **JWT Tokens**: Secure token-based API access
3. **Real-time Sync**: All data syncs instantly between web and mobile
4. **Same Account**: Use the same Google account on both platforms

### Testing Sync
1. **Web**: Create a task at `http://localhost:3000`
2. **Mobile**: Open app and login with same Google account
3. **Verify**: Task should appear immediately on mobile
4. **Reverse**: Create task on mobile, check web

## 🚀 Production Deployment

### Backend (Railway/Heroku/AWS)
```bash
# Build for production
npm run build

# Set environment variables:
# DATABASE_URL=postgresql://...
# JWT_SECRET=your-secure-secret
# GOOGLE_CLIENT_ID=your-production-client-id
```

### Web App (Vercel/Netlify)
```bash
# Build web app
npm run build:web

# Set environment variables:
# VITE_API_URL=https://your-api-domain.com
# VITE_GOOGLE_CLIENT_ID=your-web-client-id
```

### Mobile App (App Store/Play Store)
```bash
# Build with Expo
cd packages/mobile
expo build:ios
expo build:android

# Or use EAS Build (recommended)
eas build --platform all
```

## 🐛 Troubleshooting

### Common Issues

**Port conflicts:**
```bash
lsof -ti:3000,3001,8081 | xargs kill -9
```

**Metro bundler issues:**
```bash
cd packages/mobile && npx expo start --clear
```

**Google OAuth errors:**
- Verify Client IDs match your Google Cloud Console
- Check authorized origins and redirect URIs
- Ensure OAuth consent screen is configured
- Add test users if using external user type

**Sync not working:**
- Verify both platforms use the same Google account
- Check backend logs for API errors
- Ensure mobile app is connecting to correct API URL

**Database issues:**
```bash
# Backup database
cp packages/backend/jarvi.db packages/backend/jarvi.db.backup

# Reset database (will lose data)
rm packages/backend/jarvi.db
npm run dev:backend  # Will recreate tables
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test on both web and mobile platforms
5. Ensure sync works correctly
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

- 📚 Check [ARCHITECTURE.md](ARCHITECTURE.md) for technical details
- 🔧 Check [packages/backend/SETUP.md](packages/backend/SETUP.md) for backend setup
- 🐛 Open an issue for bugs or feature requests
- 💬 Discussions for questions and help