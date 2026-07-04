import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FocusPage } from './pages/Focus';
import { CapturePage } from './pages/Capture';
import { BacklogPage } from './pages/Backlog';
import { MetricsPage } from './pages/Metrics';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FocusPage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/backlog" element={<BacklogPage />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
