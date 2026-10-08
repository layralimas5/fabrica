import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProviders, useSession } from './app/services';
import type { Services } from './application/ports';
import { LoginPage } from './pages/LoginPage';
import { Shell } from './ui/Shell';
import { Spinner } from './ui/primitives';

const CreatePage = lazy(() => import('./pages/CreatePage').then((m) => ({ default: m.CreatePage })));
const VideosPage = lazy(() => import('./pages/VideosPage').then((m) => ({ default: m.VideosPage })));
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const BrandKitsPage = lazy(() => import('./pages/BrandKitsPage').then((m) => ({ default: m.BrandKitsPage })));
const ExperimentsPage = lazy(() => import('./pages/ExperimentsPage').then((m) => ({ default: m.ExperimentsPage })));
const ExperimentDetailPage = lazy(() => import('./pages/ExperimentDetailPage').then((m) => ({ default: m.ExperimentDetailPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const WinnersPage = lazy(() => import('./pages/WinnersPage').then((m) => ({ default: m.WinnersPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const WinnerDetailPage = lazy(() => import('./pages/WinnerDetailPage').then((m) => ({ default: m.WinnerDetailPage })));
const AccountsPage = lazy(() => import('./pages/AccountsPage').then((m) => ({ default: m.AccountsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/entrar" replace />;
  return children;
}

export default function App({ services }: { services: Services }) {
  return (
    <AppProviders services={services}>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/entrar" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <Shell />
                </RequireAuth>
              }
            >
              <Route path="/criar" element={<CreatePage />} />
              <Route path="/videos" element={<VideosPage />} />
              <Route path="/carrossel/:id" element={<EditorPage />} />
              <Route path="/projetos" element={<ProjectsPage />} />
              <Route path="/calendario" element={<CalendarPage />} />
              <Route path="/agenda" element={<Navigate to="/calendario?visao=dia" replace />} />
              <Route path="/vencedores" element={<WinnersPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/vencedores/analise" element={<Navigate to="/analytics" replace />} />
              <Route path="/vencedores/:id" element={<WinnerDetailPage />} />
              <Route path="/testes" element={<ExperimentsPage />} />
              <Route path="/testes/:id" element={<ExperimentDetailPage />} />
              <Route path="/contas" element={<AccountsPage />} />
              <Route path="/biblioteca" element={<LibraryPage />} />
              <Route path="/marcas" element={<BrandKitsPage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/criar" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  );
}
