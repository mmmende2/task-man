import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PinKeypad } from '../components/PinKeypad';
import { api, ApiError } from '../api';
import './Login.css';

export function LoginPage() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      try {
        await api.login(pin);
        nav('/', { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          setError('Too many attempts. Try again in a few minutes.');
        } else {
          setError('Wrong PIN.');
        }
      } finally {
        setBusy(false);
      }
    },
    [nav],
  );

  return (
    <div className="login-page">
      <div className="login-brand">
        <span className="mono brand-magenta">task-</span>
        <span className="mono brand-cyan">man</span>
      </div>
      <div className="login-sub">Enter your PIN</div>
      <PinKeypad onSubmit={onSubmit} busy={busy} error={error} />
    </div>
  );
}
