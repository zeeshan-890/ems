import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Server } from 'lucide-react';
import './styles.css';

type HealthResponse = {
  status?: string;
  inference_ready?: boolean;
  load_error?: string | null;
  product?: string;
};

const defaultBackendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function App() {
  const [backendUrl, setBackendUrl] = useState(localStorage.getItem('emsBackendUrl') || defaultBackendUrl);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizedBackendUrl = useMemo(() => backendUrl.replace(/\/+$/, ''), [backendUrl]);

  async function checkHealth() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${normalizedBackendUrl}/api/v1/health`);
      if (!response.ok) {
        throw new Error(`Health check failed with HTTP ${response.status}`);
      }
      setHealth(await response.json());
      localStorage.setItem('emsBackendUrl', normalizedBackendUrl);
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : 'Could not reach backend');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  const isOnline = health?.status === 'ok';

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Elder Monitoring System</p>
          <h1>Care Console</h1>
        </div>
        <div className={isOnline ? 'status online' : 'status offline'}>
          {isOnline ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {isOnline ? 'Backend online' : 'Backend offline'}
        </div>
      </section>

      <section className="workspace">
        <div className="panel connection-panel">
          <div className="panel-heading">
            <Server size={20} />
            <h2>Backend Connection</h2>
          </div>
          <label htmlFor="backend-url">API base URL</label>
          <div className="url-row">
            <input
              id="backend-url"
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
              placeholder="https://ems-backend.your-domain.com"
            />
            <button onClick={checkHealth} disabled={loading}>
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
              Check
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>

        <div className="panel health-panel">
          <div className="panel-heading">
            <Activity size={20} />
            <h2>Health</h2>
          </div>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{health?.status || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Inference</dt>
              <dd>{health?.inference_ready ? 'Ready' : 'Not ready'}</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>{health?.product || 'EMS backend'}</dd>
            </div>
          </dl>
          {health?.load_error && <p className="error">{health.load_error}</p>}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
