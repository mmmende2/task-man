import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FocusPage } from './pages/Focus';
import { CapturePage } from './pages/Capture';
import { BacklogPage } from './pages/Backlog';
import { RefinePage } from './pages/Refine';
import { MetricsPage } from './pages/Metrics';
import { StatusPage } from './pages/Status';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FocusPage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/backlog" element={<BacklogPage />} />
        <Route path="/refine" element={<RefinePage />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
