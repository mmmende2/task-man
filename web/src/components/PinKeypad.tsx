import { useEffect, useState } from 'react';
import './PinKeypad.css';

interface Props {
  onSubmit: (pin: string) => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
}

const KEYS: (string | 'del' | null)[] = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  null, '0', 'del',
];

export function PinKeypad({ onSubmit, busy, error }: Props) {
  const [pin, setPin] = useState('');

  // Auto-submit on the 4th digit. The plan spec calls this out
  // explicitly — no extra "go" tap.
  useEffect(() => {
    if (pin.length === 4) {
      const next = pin;
      // Defer one tick so the dot animation paints before the submit.
      const id = setTimeout(() => {
        onSubmit(next);
      }, 80);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [pin, onSubmit]);

  // Clear when an error comes in so the user can retry without
  // having to manually backspace four times.
  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  const push = (digit: string) => {
    if (busy) return;
    setPin((p) => (p.length >= 4 ? p : p + digit));
  };
  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="pin-keypad">
      <div className="pin-dots" aria-label={`PIN ${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />
        ))}
      </div>
      {error && <div className="pin-error">{error}</div>}
      <div className="pin-grid">
        {KEYS.map((k, i) => {
          if (k === null) return <span key={i} />;
          if (k === 'del') {
            return (
              <button key={i} className="pin-key del" onClick={back} aria-label="delete" disabled={busy || pin.length === 0}>
                ⌫
              </button>
            );
          }
          return (
            <button key={i} className="pin-key digit" onClick={() => push(k)} aria-label={`digit ${k}`} disabled={busy}>
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
