import { useEffect, useState } from 'react';
import { fetchHealth, type HealthResponse } from '../api/client';

/** Phase 1 system-status view, kept at /status. */
export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetchHealth()
      .then(setHealth)
      .catch((err: Error) => {
        setHealth(null);
        setError(err.message);
      });
  };

  useEffect(load, []);

  return (
    <section className="card">
      <h2>System status</h2>
      {error && <p className="bad">API unreachable: {error}</p>}
      {!error && !health && <p>Checking…</p>}
      {health && (
        <ul>
          <li>
            API: <span className="good">{health.status}</span>
          </li>
          <li>
            MongoDB Atlas:{' '}
            <span className={health.database === 'connected' ? 'good' : 'bad'}>{health.database}</span>
          </li>
          <li>Uptime: {health.uptime}s</li>
        </ul>
      )}
      <button onClick={load}>Refresh</button>
    </section>
  );
}
