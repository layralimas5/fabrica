import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProviders, useSession } from './app/services';
import type { Services } from './application/ports';
import { LoginPage } from './pages/LoginPage';
import { Shell } from './ui/Shell';
import { Spinner } from './ui/primitives';

const CreatePage = lazy(() => import('./pages/CreatePage').then((m) => ({ default: m.CreatePage })));
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const BrandKitsPage = lazy(() => import('./pages/BrandKitsPage').then((m) => ({ default: m.BrandKitsPage })));
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
              <Route path="/carrossel/:id" element={<EditorPage />} />
              <Route path="/projetos" element={<ProjectsPage />} />
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
