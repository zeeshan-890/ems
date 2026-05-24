import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  HeartPulse,
  Play,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  Waves,
} from 'lucide-react';
import './styles.css';

type HealthResponse = {
  status?: string;
  inference_ready?: boolean;
  load_error?: string | null;
  product?: string;
};

type SummaryResponse = {
  total_patients: number;
  active_sessions: number;
  open_alerts: number;
  last_event_at: string;
};

type LivePatient = {
  patient_name?: string;
  severity?: string;
  score?: number;
  fall_probability?: number;
  predicted_activity_class?: string;
  last_message?: string;
  sample_rate_hz?: number;
  updated_at?: string;
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

type DemoResources = {
  patientId: string;
  deviceId: string;
  sessionId: string;
  patientName: string;
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

type SimulatorSettings = {
  profile: string;
  scenario: 'rest' | 'walk' | 'stairs' | 'fall';
  sampleRateHz: number;
  durationSec: number;
  intensity: number;
  impactForce: number;
  noise: number;
};

const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'https://detectionbackend.zeeshan-abbas.tech').replace(
  /\/+$/,
  '',
);

const profiles = [
  { key: 'ayesha', name: 'Ayesha Khan', age: 72 },
  { key: 'robert', name: 'Robert Chen', age: 79 },
  { key: 'maria', name: 'Maria Santos', age: 68 },
];

const scenarioLabels: Record<SimulatorSettings['scenario'], string> = {
  rest: 'Resting',
  walk: 'Walking',
  stairs: 'Stairs',
  fall: 'Fall-like impact',
};

function round(value: number) {
  return Number(value.toFixed(4));
}

function noiseAt(seed: number, amount: number) {
  return (Math.sin(seed * 12.9898) * 43758.5453 % 1) * amount;
}

function generateSamples(settings: SimulatorSettings): SensorSample[] {
  const count = Math.round(settings.sampleRateHz * settings.durationSec);
  const now = Date.now();
  const intervalMs = Math.round(1000 / settings.sampleRateHz);
  const motion = settings.intensity / 100;
  const impactMagnitude = settings.impactForce / 4;
  const noise = settings.noise / 100;

  return Array.from({ length: count }, (_, index) => {
    const t = index / settings.sampleRateHz;
    const gait = Math.sin(t * Math.PI * 4);
    const fastGait = Math.sin(t * Math.PI * 8);
    const impactWindow = settings.scenario === 'fall' && index > count * 0.46 && index < count * 0.53;
    const stairBoost = settings.scenario === 'stairs' ? 1.35 : 1;
    const resting = settings.scenario === 'rest';
    const impact = impactWindow ? impactMagnitude : 0;
    const n = noiseAt(index + settings.impactForce, noise);

    return {
      timestamp_ms: now + index * intervalMs,
      acc_x: round(resting ? 0.02 + n : motion * stairBoost * 1.1 * gait + impact),
      acc_y: round(9.81 + (resting ? n : motion * stairBoost * 0.85 * Math.cos(t * Math.PI * 4) - impact * 0.35)),
      acc_z: round(resting ? 0.03 + n : motion * stairBoost * 0.55 * fastGait + impact * 0.45),
      gyro_x: round(resting ? 0.01 + n : motion * 0.28 * Math.sin(t * Math.PI * 3) + impact * 0.045),
      gyro_y: round(resting ? 0.01 + n : motion * 0.22 * Math.cos(t * Math.PI * 3) + impact * 0.035),
      gyro_z: round(resting ? 0.01 + n : motion * 0.18 * Math.sin(t * Math.PI * 2) + impact * 0.03),
      azimuth: null,
      pitch: null,
      roll: null,
    };
  });
}

async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.detail || `Request failed with HTTP ${response.status}`);
  }
  return payload as T;
}

function formatPercent(value?: number) {
  if (typeof value !== 'number') return '-';
  return `${Math.round(value * 100)}%`;
}

function formatTime(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'simulator'>('dashboard');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [livePatients, setLivePatients] = useState<LivePatient[]>([]);
  const [dashboardError, setDashboardError] = useState('');
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [resources, setResources] = useState<DemoResources | null>(null);
  const [settings, setSettings] = useState<SimulatorSettings>({
    profile: 'ayesha',
    scenario: 'walk',
    sampleRateHz: 50,
    durationSec: 3,
    intensity: 55,
    impactForce: 70,
    noise: 8,
  });
  const [sending, setSending] = useState(false);
  const [simError, setSimError] = useState('');
  const [simResult, setSimResult] = useState<IngestResponse | null>(null);

  async function refreshDashboard() {
    setLoadingDashboard(true);
    setDashboardError('');
    try {
      const [healthPayload, summaryPayload, livePayload] = await Promise.all([
        apiJson<HealthResponse>('/api/v1/health'),
        apiJson<SummaryResponse>('/api/v1/summary'),
        apiJson<LivePatient[]>('/api/v1/monitor/patients/live'),
      ]);
      setHealth(healthPayload);
      setSummary(summaryPayload);
      setLivePatients(livePayload.slice(0, 6));
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : 'Could not refresh dashboard');
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function ensureDemoResources() {
    if (resources && profiles.find((profile) => profile.name === resources.patientName)?.key === settings.profile) {
      return resources;
    }

    const profile = profiles.find((item) => item.key === settings.profile) || profiles[0];
    const patient = await apiJson<{ id: string; full_name: string }>('/api/v1/patients', {
      method: 'POST',
      body: JSON.stringify({ full_name: `${profile.name} Demo`, age: profile.age }),
    });
    const device = await apiJson<{ id: string }>('/api/v1/devices', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: patient.id,
        label: 'Web Simulator IMU',
        platform: 'web_simulator',
      }),
    });
    const session = await apiJson<{ id: string }>('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: patient.id,
        device_id: device.id,
        sample_rate_hz: settings.sampleRateHz,
        started_by: 'web_simulator',
      }),
    });

    const nextResources = {
      patientId: patient.id,
      deviceId: device.id,
      sessionId: session.id,
      patientName: patient.full_name,
    };
    setResources(nextResources);
    return nextResources;
  }

  async function sendSimulation() {
    setSending(true);
    setSimError('');
    setSimResult(null);

    try {
      const demo = await ensureDemoResources();
      const samples = generateSamples(settings);
      const payload = await apiJson<IngestResponse>('/api/v1/ingest/live', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: demo.patientId,
          device_id: demo.deviceId,
          session_id: demo.sessionId,
          source: 'web_simulator',
          sampling_rate_hz: settings.sampleRateHz,
          acceleration_unit: 'm_s2',
          gyroscope_unit: 'rad_s',
          battery_level: 96,
          samples,
        }),
      });
      setSimResult(payload);
      await refreshDashboard();
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Could not send simulated samples');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    refreshDashboard();
  }, []);

  const isOnline = health?.status === 'ok';
  const generatedSampleCount = useMemo(
    () => Math.round(settings.sampleRateHz * settings.durationSec),
    [settings.durationSec, settings.sampleRateHz],
  );
  const selectedProfile = profiles.find((profile) => profile.key === settings.profile) || profiles[0];

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Elder Monitoring System</p>
          <h1>Operations Dashboard</h1>
        </div>
        <div className={isOnline ? 'status online' : 'status offline'}>
          {isOnline ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {isOnline ? 'System online' : 'System offline'}
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
        <section className="dashboard-stack">
          <div className="stat-grid">
            <StatCard icon={<Users size={20} />} label="Patients" value={summary?.total_patients ?? '-'} />
            <StatCard icon={<Activity size={20} />} label="Active Sessions" value={summary?.active_sessions ?? '-'} />
            <StatCard icon={<ShieldAlert size={20} />} label="Open Alerts" value={summary?.open_alerts ?? '-'} tone="warn" />
            <StatCard
              icon={<HeartPulse size={20} />}
              label="Inference"
              value={health?.inference_ready ? 'Ready' : 'Pending'}
              tone={health?.inference_ready ? 'good' : 'warn'}
            />
          </div>

          <section className="workspace dashboard-grid">
            <div className="panel">
              <div className="panel-heading split">
                <span>
                  <Activity size={20} />
                  <h2>Live Patient Stream</h2>
                </span>
                <button
                  className="icon-button"
                  onClick={refreshDashboard}
                  disabled={loadingDashboard}
                  aria-label="Refresh dashboard"
                >
                  <RefreshCw size={18} className={loadingDashboard ? 'spin' : ''} />
                </button>
              </div>

              <div className="table">
                <div className="table-row table-head">
                  <span>Patient</span>
                  <span>Severity</span>
                  <span>Fall Risk</span>
                  <span>Activity</span>
                  <span>Updated</span>
                </div>
                {livePatients.length ? (
                  livePatients.map((patient, index) => (
                    <div className="table-row" key={`${patient.patient_name}-${index}`}>
                      <span>{patient.patient_name || 'Demo patient'}</span>
                      <span className={`pill ${patient.severity || 'low'}`}>{patient.severity || 'low'}</span>
                      <span>{formatPercent(patient.fall_probability)}</span>
                      <span>{patient.predicted_activity_class || '-'}</span>
                      <span>{formatTime(patient.updated_at)}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No live patient samples yet.</div>
                )}
              </div>

              {dashboardError && <p className="error">{dashboardError}</p>}
            </div>

            <div className="panel">
              <div className="panel-heading">
                <Gauge size={20} />
                <h2>Service State</h2>
              </div>
              <dl>
                <div>
                  <dt>API</dt>
                  <dd>{health?.status || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Model runtime</dt>
                  <dd>{health?.inference_ready ? 'Ready' : 'Not ready'}</dd>
                </div>
                <div>
                  <dt>Last refresh</dt>
                  <dd>{formatTime(summary?.last_event_at)}</dd>
                </div>
              </dl>
              {health?.load_error && <p className="error">{health.load_error}</p>}
            </div>
          </section>
        </section>
      ) : (
        <section className="simulator-grid">
          <div className="panel">
            <div className="panel-heading">
              <SlidersHorizontal size={20} />
              <h2>Sensor Simulator</h2>
            </div>

            <div className="selector-group">
              <span className="field-label">Demo profile</span>
              <div className="segmented">
                {profiles.map((profile) => (
                  <button
                    className={settings.profile === profile.key ? 'segment active' : 'segment'}
                    key={profile.key}
                    onClick={() => {
                      setResources(null);
                      setSettings((current) => ({ ...current, profile: profile.key }));
                    }}
                  >
                    {profile.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="selector-group">
              <span className="field-label">Test data scenario</span>
              <div className="scenario-grid">
                {(['rest', 'walk', 'stairs', 'fall'] as SimulatorSettings['scenario'][]).map((scenario) => (
                  <button
                    className={settings.scenario === scenario ? 'scenario-card active' : 'scenario-card'}
                    key={scenario}
                    onClick={() => setSettings((current) => ({ ...current, scenario }))}
                  >
                    <strong>{scenarioLabels[scenario]}</strong>
                    <span>{scenario === 'fall' ? 'Impact spike' : scenario === 'stairs' ? 'Vertical motion' : scenario}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="slider-grid">
              <Slider
                label="Duration"
                max={6}
                min={1}
                suffix="s"
                value={settings.durationSec}
                onChange={(value) => setSettings((current) => ({ ...current, durationSec: value }))}
              />
              <Slider
                label="Sample rate"
                max={100}
                min={20}
                suffix="Hz"
                value={settings.sampleRateHz}
                onChange={(value) => setSettings((current) => ({ ...current, sampleRateHz: value }))}
              />
              <Slider
                label="Motion intensity"
                max={100}
                min={5}
                suffix="%"
                value={settings.intensity}
                onChange={(value) => setSettings((current) => ({ ...current, intensity: value }))}
              />
              <Slider
                label="Impact force"
                max={100}
                min={0}
                suffix="%"
                value={settings.impactForce}
                onChange={(value) => setSettings((current) => ({ ...current, impactForce: value }))}
              />
              <Slider
                label="Sensor noise"
                max={40}
                min={0}
                suffix="%"
                value={settings.noise}
                onChange={(value) => setSettings((current) => ({ ...current, noise: value }))}
              />
            </div>

            <div className="sim-summary">
              <span>{selectedProfile.name}</span>
              <span>{scenarioLabels[settings.scenario]}</span>
              <span>{generatedSampleCount} samples</span>
            </div>

            <button className="primary-action" onClick={sendSimulation} disabled={sending}>
              <Play size={17} />
              {sending ? 'Generating and sending' : 'Run Simulation'}
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
                <dd>{formatPercent(simResult?.detection?.fall_probability)}</dd>
              </div>
              <div>
                <dt>Activity</dt>
                <dd>{simResult?.detection?.predicted_activity_class || '-'}</dd>
              </div>
            </dl>
            {simResult?.detection?.message ? (
              <p className="result-message">{simResult.detection.message}</p>
            ) : (
              <div className="empty-state compact">Run a simulation to see model output.</div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div className={`stat-card ${tone}`}>
      <span className="stat-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Slider({
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
}) {
  return (
    <label className="slider-field">
      <span>
        {label}
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input max={max} min={min} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
