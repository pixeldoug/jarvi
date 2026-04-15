import { lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TaskProvider } from './contexts/TaskContext';
import { NoteProvider } from './contexts/NoteContext';
import { CategoryProvider } from './contexts/CategoryContext';
import { ListProvider } from './contexts/ListContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BackgroundProvider } from './contexts/BackgroundContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { ToastProvider } from './components/ui';
import { Loading } from './components/ui/Loading';
import { Layout } from './components/layout';
import { Login } from './pages/Login';
import { TrialExpiredGate } from './components/features/subscription/TrialExpiredGate/TrialExpiredGate';

// Lazy load pages
const VerifyPendingPage = lazy(() => import('./pages/VerifyPending'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword'));


// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading centered size="lg" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {children}
      <TrialExpiredGate />
    </>
  );
};

// App Routes Component
const AppRoutes: React.FC = () => {
  return (
    <Router>
      <AppSwitch />
    </Router>
  );
};

function AppSwitch() {
  const location = useLocation();

  return (
    <Routes location={location}>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route
        path="/verify-pending"
        element={
          <Suspense fallback={<Loading centered size="lg" />}>
            <VerifyPendingPage />
          </Suspense>
        }
      />
      <Route
        path="/verify-email"
        element={
          <Suspense fallback={<Loading centered size="lg" />}>
            <VerifyEmailPage />
          </Suspense>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <Suspense fallback={<Loading centered size="lg" />}>
            <ForgotPasswordPage />
          </Suspense>
        }
      />
      <Route
        path="/reset-password"
        element={
          <Suspense fallback={<Loading centered size="lg" />}>
            <ResetPasswordPage />
          </Suspense>
        }
      />

      {/* Protected routes */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notes"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/finances"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/habits"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/goals"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/categories"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BackgroundProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <CategoryProvider>
              <ListProvider>
                <TaskProvider>
                  <NoteProvider>
                    <ToastProvider>
                      <AppRoutes />
                    </ToastProvider>
                  </NoteProvider>
                </TaskProvider>
              </ListProvider>
            </CategoryProvider>
          </SubscriptionProvider>
        </AuthProvider>
        </BackgroundProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
