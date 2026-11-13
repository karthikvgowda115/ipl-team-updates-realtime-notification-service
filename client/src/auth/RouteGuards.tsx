import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

function Loading() {
  return <p className="muted center">Checking your session…</p>;
}

/** Only for logged-in users; others are sent to /login (and returned here afterwards). */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/**
 * Admin pages: not logged in → /admin/login; logged in without the admin role → 403 message.
 * (UI convenience only — the API checks the role on every admin request.)
 */
export function AdminRoute() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'anonymous') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (user?.role !== 'admin') {
    return (
      <section className="card center">
        <h2>403 · Admins only</h2>
        <p className="muted">Your account doesn't have the admin role.</p>
        <Link to="/dashboard">Go to your dashboard</Link>
      </section>
    );
  }
  return <Outlet />;
}

/** Admin login page: admins who are already logged in go straight to the admin dashboard. */
export function AdminLoginRoute() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'authenticated' && user?.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  return <Outlet />;
}

/** Login/signup pages: logged-in users are sent straight to the dashboard. */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
