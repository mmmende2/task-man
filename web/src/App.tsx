import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LoginPage } from './pages/Login';
import { FocusPage } from './pages/Focus';
import { CapturePage } from './pages/Capture';
import { BacklogPage } from './pages/Backlog';
import { MetricsPage } from './pages/Metrics';
import { api } from './api';

// Only checks the session on mount. Subsequent route changes don't
// need a re-check — the API returns 401 and individual pages route
// back to /login when that happens.
function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const navRef = useRef(nav);
  navRef.current = nav;
  const pathRef = useRef(loc.pathname);
  pathRef.current = loc.pathname;

  useEffect(() => {
    api.session().then((ok) => {
      const path = pathRef.current;
      if (!ok && path !== '/login') navRef.current('/login', { replace: true });
      else if (ok && path === '/login') navRef.current('/', { replace: true });
      setReady(true);
    });
  }, []);

  return ready ? <>{children}</> : <div className="boot" />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<FocusPage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/backlog" element={<BacklogPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
