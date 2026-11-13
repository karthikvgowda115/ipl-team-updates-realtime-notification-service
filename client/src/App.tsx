import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AdminLoginRoute, AdminRoute, ProtectedRoute, PublicOnlyRoute } from './auth/RouteGuards';
import AdminDashboardPage from './pages/AdminDashboardPage';
import DashboardPage from './pages/DashboardPage';
import LiveScorePage from './pages/LiveScorePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import StatusPage from './pages/StatusPage';
import TeamsPage from './pages/TeamsPage';
import NotificationToasts from './realtime/NotificationToasts';
import { RealtimeProvider, useRealtimeStatus } from './realtime/RealtimeContext';

function TopBar() {
  const { status, user, logout } = useAuth();
  const ws = useRealtimeStatus();
  return (
    <header className="topbar">
      <span className="brand">🏏 IPL Team Updates</span>
      <nav>
        {status === 'authenticated' ? (
          <>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/teams">Teams</NavLink>
            <NavLink to="/live">Live</NavLink>
            {user?.role === 'admin' && <NavLink to="/admin/dashboard">Admin</NavLink>}
            <span className="who">
              <span
                className={`live-dot ${ws === 'open' ? 'on' : 'off'}`}
                title={ws === 'open' ? 'Real-time connection active' : 'Real-time connection lost, reconnecting…'}
              />
              {user?.username ?? user?.name}
              {user?.role === 'admin' && (
                <span className="role-badge" title="Admin: can edit teams and start matches">
                  Admin
                </span>
              )}
            </span>
            <button type="button" className="link-btn" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/signup">Sign up</NavLink>
          </>
        )}
        <NavLink to="/status">Status</NavLink>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RealtimeProvider>
          <TopBar />
          <NotificationToasts />
          <main className="container">
            <Routes>
              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/teams" element={<TeamsPage />} />
                <Route path="/live" element={<LiveScorePage />} />
              </Route>
              <Route element={<AdminLoginRoute />}>
                <Route path="/admin/login" element={<LoginPage variant="admin" />} />
              </Route>
              <Route element={<AdminRoute />}>
                <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              </Route>
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </RealtimeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
