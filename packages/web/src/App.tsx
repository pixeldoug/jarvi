import { lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import type { Location as RouterLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TaskProvider } from './contexts/TaskContext';
import { NoteProvider } from './contexts/NoteContext';
import { CategoryProvider } from './contexts/CategoryContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { ToastProvider } from './components/ui';
import { Loading } from './components/ui/Loading';
import { Layout } from './components/layout';
import { Login } from './pages/Login';

// Lazy load pages
const SubscribePage = lazy(() => import('./pages/Subscribe'));
const VerifyPendingPage = lazy(() => import('./pages/VerifyPending'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading centered size="lg" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// App Routes Component
const AppRoutes: React.FC = () => {
  const subscribeRouteElement = (
    <ProtectedRoute>
      <Suspense fallback={<Loading centered size="lg" />}>
        <SubscribePage />
      </Suspense>
    </ProtectedRoute>
  );

  const settingsRouteElement = (
    <ProtectedRoute>
      <Suspense fallback={<Loading centered size="lg" />}>
        <SettingsPage />
      </Suspense>
    </ProtectedRoute>
  );

  return (
    <Router>
      <ModalSwitch
        subscribeRouteElement={subscribeRouteElement}
        settingsRouteElement={settingsRouteElement}
      />
    </Router>
  );
};

function ModalSwitch({
  subscribeRouteElement,
  settingsRouteElement,
}: {
  subscribeRouteElement: React.ReactElement;
  settingsRouteElement: React.ReactElement;
}) {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: RouterLocation } | null;
  const backgroundLocation = state?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
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
        <Route path="/subscribe" element={subscribeRouteElement} />
        <Route path="/settings" element={settingsRouteElement} />
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

      {/* Modal routes */}
      {backgroundLocation && (
        <Routes>
          <Route path="/subscribe" element={subscribeRouteElement} />
        </Routes>
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <CategoryProvider>
              <TaskProvider>
                <NoteProvider>
                  <ToastProvider>
                    <AppRoutes />
                  </ToastProvider>
                </NoteProvider>
              </TaskProvider>
            </CategoryProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
