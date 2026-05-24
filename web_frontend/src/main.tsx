import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Play,
  RefreshCw,
  Waves,
} from 'lucide-react';
import './styles.css';

type HealthResponse = {
  status?: string;
  inference_ready?: boolean;
  load_error?: string | null;
  product?: string;
};

type SensorSample = {
  timestamp_ms: number;
  acc_x: number;
  acc_y: number;
  acc_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  azimuth: number | null;
  pitch: number | null;
  roll: number | null;
};

type IngestResponse = {
  ingested_samples?: number;
  detection?: {
    severity?: string;
    score?: number;
    fall_probability?: number;
    predicted_activity_class?: string;
    message?: string;
  };
};

const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'https://detectionbackend.zeeshan-abbas.tech').replace(
  /\/+$/,
  '',
);

function generateSamples(mode: string, count: number, sampleRateHz: number): SensorSample[] {
  const now = Date.now();
  const intervalMs = Math.round(1000 / sampleRateHz);

  return Array.from({ length: count }, (_, index) => {
    const t = index / sampleRateHz;
    const walkingWave = Math.sin(t * Math.PI * 4);
    const impact = mode === 'fall' && index > count * 0.45 && index < count * 0.52 ? 18 : 0;
    const still = mode === 'rest';
    const moving = mode === 'walk';

    return {
      timestamp_ms: now + index * intervalMs,
      acc_x: still ? 0.02 : moving ? 0.9 * walkingWave : 0.4 * walkingWave + impact,
      acc_y: 9.81 + (still ? 0.03 : moving ? 0.75 * Math.cos(t * Math.PI * 4) : -impact * 0.35),
      acc_z: still ? 0.04 : moving ? 0.5 * Math.sin(t * Math.PI * 8) : 0.2 + impact * 0.45,
      gyro_x: still ? 0.01 : moving ? 0.22 * Math.sin(t * Math.PI * 3) : 0.08 + impact * 0.05,
      gyro_y: still ? 0.01 : moving ? 0.18 * Math.cos(t * Math.PI * 3) : 0.04 + impact * 0.04,
      gyro_z: still ? 0.01 : moving ? 0.15 * Math.sin(t * Math.PI * 2) : 0.03 + impact * 0.03,
      azimuth: null,
      pitch: null,
      roll: null,
    };
  });
}

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'simulator'>('dashboard');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState('');
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [mode, setMode] = useState('walk');
  const [sampleCount, setSampleCount] = useState(128);
  const [sampleRateHz, setSampleRateHz] = useState(50);
  const [sending, setSending] = useState(false);
  const [simError, setSimError] = useState('');
  const [simResult, setSimResult] = useState<IngestResponse | null>(null);

  async function checkHealth() {
    setLoadingHealth(true);
    setHealthError('');
    try {
      const response = await fetch(`${backendUrl}/api/v1/health`);
      if (!response.ok) {
        throw new Error(`Health check failed with HTTP ${response.status}`);
      }
      setHealth(await response.json());
    } catch (err) {
      setHealth(null);
      setHealthError(err instanceof Error ? err.message : 'Could not reach backend');
    } finally {
      setLoadingHealth(false);
    }
  }

  async function sendSimulation() {
    setSending(true);
    setSimError('');
    setSimResult(null);

    try {
      const body = {
        patient_id: patientId.trim(),
        device_id: deviceId.trim(),
        session_id: sessionId.trim(),
        source: 'web_simulator',
        sampling_rate_hz: sampleRateHz,
        acceleration_unit: 'm_s2',
        gyroscope_unit: 'rad_s',
        battery_level: 96,
        samples: generateSamples(mode, sampleCount, sampleRateHz),
      };

      const response = await fetch(`${backendUrl}/api/v1/ingest/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail || `Simulation failed with HTTP ${response.status}`);
      }
      setSimResult(payload);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Could not send simulated samples');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  const isOnline = health?.status === 'ok';
  const canSend = useMemo(
    () => patientId.trim() && deviceId.trim() && sessionId.trim() && !sending,
    [deviceId, patientId, sending, sessionId],
  );

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

      <nav className="tabs" aria-label="Main views">
        <button className={activeView === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setActiveView('dashboard')}>
          <Activity size={17} />
          Dashboard
        </button>
        <button className={activeView === 'simulator' ? 'tab active' : 'tab'} onClick={() => setActiveView('simulator')}>
          <Waves size={17} />
          Simulator
        </button>
      </nav>

      {activeView === 'dashboard' ? (
        <section className="workspace dashboard-grid">
          <div className="panel">
            <div className="panel-heading split">
              <span>
                <Activity size={20} />
                <h2>System Health</h2>
              </span>
              <button className="icon-button" onClick={checkHealth} disabled={loadingHealth} aria-label="Refresh health">
                <RefreshCw size={18} className={loadingHealth ? 'spin' : ''} />
              </button>
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
            {(healthError || health?.load_error) && <p className="error">{healthError || health?.load_error}</p>}
          </div>

          <div className="panel">
            <div className="panel-heading">
              <Gauge size={20} />
              <h2>Operations</h2>
            </div>
            <div className="metric-list">
              <div>
                <strong>Live ingestion</strong>
                <span>Ready for mobile and simulator streams</span>
              </div>
              <div>
                <strong>Sensor simulator</strong>
                <span>Generate rest, walk, or fall-like IMU windows</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="simulator-grid">
          <div className="panel">
            <div className="panel-heading">
              <Waves size={20} />
              <h2>Sensor Simulator</h2>
            </div>

            <div className="form-grid">
              <label>
                Patient ID
                <input value={patientId} onChange={(event) => setPatientId(event.target.value)} />
              </label>
              <label>
                Device ID
                <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} />
              </label>
              <label>
                Session ID
                <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
              </label>
              <label>
                Scenario
                <select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="walk">Walking</option>
                  <option value="rest">Resting</option>
                  <option value="fall">Fall-like impact</option>
                </select>
              </label>
              <label>
                Samples
                <input
                  min={32}
                  max={300}
                  type="number"
                  value={sampleCount}
                  onChange={(event) => setSampleCount(Number(event.target.value))}
                />
              </label>
              <label>
                Sample rate
                <input
                  min={10}
                  max={100}
                  type="number"
                  value={sampleRateHz}
                  onChange={(event) => setSampleRateHz(Number(event.target.value))}
                />
              </label>
            </div>

            <button className="primary-action" onClick={sendSimulation} disabled={!canSend}>
              <Play size={17} />
              {sending ? 'Sending' : 'Send Samples'}
            </button>
            {simError && <p className="error">{simError}</p>}
          </div>

          <div className="panel">
            <div className="panel-heading">
              <Activity size={20} />
              <h2>Detection Result</h2>
            </div>
            <dl>
              <div>
                <dt>Samples</dt>
                <dd>{simResult?.ingested_samples ?? '-'}</dd>
              </div>
              <div>
                <dt>Severity</dt>
                <dd>{simResult?.detection?.severity || '-'}</dd>
              </div>
              <div>
                <dt>Fall probability</dt>
                <dd>
                  {typeof simResult?.detection?.fall_probability === 'number'
                    ? simResult.detection.fall_probability.toFixed(3)
                    : '-'}
                </dd>
              </div>
              <div>
                <dt>Activity</dt>
                <dd>{simResult?.detection?.predicted_activity_class || '-'}</dd>
              </div>
            </dl>
            {simResult?.detection?.message && <p className="result-message">{simResult.detection.message}</p>}
          </div>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
