import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { dashboardPath, useAuth } from './auth.js';
import { Loading, Shell } from '../components/ui.js';
import { HomePage, JobDetailPage, JobsPage, CompanyPage, NotFoundPage } from '../features/public-pages.js';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from '../features/auth-pages.js';

const ApplicantPages = lazy(() => import('../features/applicant-pages.js'));
const EmployerPages = lazy(() => import('../features/employer-pages.js'));

function Guard({ role }: { role?: 'APPLICANT' | 'EMPLOYER' }) {
  const { status, user } = useAuth(); const location = useLocation();
  if (status === 'initializing') return <Loading label="Restoring your session…" />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user?.role !== role) return <Navigate to={user ? dashboardPath(user) : '/'} replace />;
  return <Outlet />;
}
function GuestOnly({ children }: { children: ReactNode }) { const { status, user } = useAuth(); if (status === 'initializing') return <Loading label="Loading…" />; return user ? <Navigate to={dashboardPath(user)} replace /> : <>{children}</>; }
function AppShell() { return <Shell><Suspense fallback={<Loading label="Loading page…" />}><Routes>
  <Route path="/" element={<HomePage />} /><Route path="/jobs" element={<JobsPage />} /><Route path="/jobs/:slug" element={<JobDetailPage />} /><Route path="/companies/:slug" element={<CompanyPage />} />
  <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} /><Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} /><Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} />
  <Route element={<Guard role="APPLICANT" />}><Route path="/applicant/*" element={<ApplicantPages />} /></Route><Route element={<Guard role="EMPLOYER" />}><Route path="/employer/*" element={<EmployerPages />} /></Route>
  <Route path="*" element={<NotFoundPage />} />
</Routes></Suspense></Shell>; }
export function AppRouter() { return <AppShell />; }
