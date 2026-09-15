import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Spinner } from './components/ui/Spinner';
import { ToastProvider } from './components/ui/Toast';
import { AuthPage } from './features/auth/AuthPage';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import { ApiError } from './lib/api/client';

// Split per route, so the charting library is not downloaded before sign-in.
const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const EntriesPage = lazy(() =>
  import('./features/entries/EntriesPage').then((module) => ({ default: module.EntriesPage })),
);
const GoalsPage = lazy(() =>
  import('./features/goals/GoalsPage').then((module) => ({ default: module.GoalsPage })),
);
const ReportsPage = lazy(() =>
  import('./features/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })),
);
const ImportPage = lazy(() =>
  import('./features/import/ImportPage').then((module) => ({ default: module.ImportPage })),
);
const ChatPage = lazy(() =>
  import('./features/chat/ChatPage').then((module) => ({ default: module.ChatPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // A rejected request is a real answer; only retry what might be transient.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }

        return failureCount < 2;
      },
    },
  },
});

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-plane">
      <Spinner className="size-6 text-ink-muted" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, restoring } = useAuth();

  // Waiting on the refresh cookie. Showing the login page here would flash it
  // for every already-signed-in user on every reload.
  if (restoring) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/** Sits inside the shell, so the header stays put while a page chunk loads. */
function PageFallback() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner className="size-5 text-ink-muted" />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/register" element={<AuthPage mode="register" />} />

              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route
                  path="/"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <DashboardPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/entries"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <EntriesPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/goals"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <GoalsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <ReportsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/import"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <ImportPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/assistant"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <ChatPage />
                    </Suspense>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
