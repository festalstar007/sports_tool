import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { HomePage } from './pages/HomePage';

const ActivitiesPage = lazy(() => import('./pages/ActivitiesPage').then((module) => ({ default: module.ActivitiesPage })));
const ActivityDetailPage = lazy(() => import('./pages/ActivityDetailPage').then((module) => ({ default: module.ActivityDetailPage })));
const ImportReviewPage = lazy(() => import('./pages/ImportReviewPage').then((module) => ({ default: module.ImportReviewPage })));
const ManualActivityPage = lazy(() => import('./pages/ManualActivityPage').then((module) => ({ default: module.ManualActivityPage })));
const TrendsPage = lazy(() => import('./pages/TrendsPage').then((module) => ({ default: module.TrendsPage })));

export function App() {
  return (
    <Suspense fallback={<div className="state-card">正在打开页面…</div>}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="imports/:id/review" element={<ImportReviewPage />} />
          <Route path="activities/new" element={<ManualActivityPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="activities/:id" element={<ActivityDetailPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
