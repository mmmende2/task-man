import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, reloadForAuth } from '../api';
import { NavMenu } from '../components/NavMenu';
import './Status.css';

interface Check {
  ok: boolean;
  version?: string;
  serverTime?: string;
  latencyMs: number;
  error?: string;
  at: number; // local clock when the check completed
}

// Liveness page: pings the unauthenticated /healthz, showing the deployed
// server version, its clock, and the round-trip — the source of truth for
// "what's actually live" and "can this device reach it".
export function StatusPage() {
  const nav = useNavigate();
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    const t0 = performance.now();
    try {
      const h = await api.getHealth();
      setCheck({
        ok: h.ok,
        version: h.version,
        serverTime: h.time,
        latencyMs: Math.round(performance.now() - t0),
        at: Date.now(),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        reloadForAuth();
        return;
      }
      setCheck({
        ok: false,
        error: (err as Error).message || 'unreachable',
        latencyMs: Math.round(performance.now() - t0),
        at: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const state = check ? (check.ok ? 'up' : 'down') : 'pending';
  const stateLabel = check ? (check.ok ? 'Reachable' : 'Unreachable') : 'Checking…';

  return (
    <div className="status-page">
      <header className="status-header">
        <button className="back-btn" onClick={() => nav('/')} aria-label="back">←</button>
        <div className="status-title">Status</div>
        <NavMenu current="status" />
      </header>

      <main className="status-body">
        <div className={`status-badge ${state}`}>
          <span className="status-dot" />
          {stateLabel}
        </div>

        <dl className="status-grid">
          <dt>Version</dt>
          <dd className="mono">{check?.version ? `v${check.version}` : '—'}</dd>

          <dt>Server time</dt>
          <dd className="mono">{check?.serverTime ? new Date(check.serverTime).toLocaleString() : '—'}</dd>

          <dt>Round-trip</dt>
          <dd className="mono">{check ? `${check.latencyMs} ms` : '—'}</dd>

          <dt>Checked</dt>
          <dd className="mono">{check ? new Date(check.at).toLocaleTimeString() : '—'}</dd>

          {check?.error && (
            <>
              <dt>Error</dt>
              <dd className="mono status-err">{check.error}</dd>
            </>
          )}
        </dl>

        <button className="status-refresh" onClick={() => void run()} disabled={busy}>
          {busy ? 'Checking…' : 'Check again'}
        </button>
      </main>
    </div>
  );
}
