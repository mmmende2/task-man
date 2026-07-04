import { useLocation, useNavigate } from 'react-router-dom';
import './Brand.css';

// The "task-man" wordmark that sits in the top-left of every authed
// page. Clicking it goes to Focus, unless you're already on Focus —
// then it goes to Metrics. That gives the logo a real function on
// every page instead of being decorative.
export function Brand() {
  const nav = useNavigate();
  const loc = useLocation();
  const target = loc.pathname === '/' ? '/metrics' : '/';

  return (
    <button
      type="button"
      className="brand mono"
      onClick={() => nav(target)}
      aria-label={`go to ${target === '/' ? 'focus' : 'metrics'}`}
    >
      <span className="brand-magenta">task-</span>
      <span className="brand-cyan">man</span>
    </button>
  );
}
