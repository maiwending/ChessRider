import React, { useCallback, useEffect, useRef, useState } from 'react';
import './UptimePage.css';

const REFRESH_INTERVAL = 30;

function StatusDot({ status }) {
  return <span className={`uptime-dot uptime-dot-${status}`} aria-hidden="true" />;
}

function ServiceCard({ label, status, httpStatus, latencyMs, error }) {
  const statusLabel = status === 'ok' ? 'Operational' : status === 'degraded' ? 'Degraded' : 'Down';
  const detail = httpStatus ? `HTTP ${httpStatus}` : (error || '—');
  const latency = typeof latencyMs === 'number' ? `${latencyMs} ms` : '—';
  return (
    <div className={`uptime-card uptime-card-${status}`}>
      <div className="uptime-card-top">
        <span className="uptime-card-label">{label}</span>
        <StatusDot status={status} />
      </div>
      <div className="uptime-card-meta">
        <span className={`uptime-status-text uptime-status-${status}`}>{statusLabel}</span>
        <span className="uptime-sep">·</span>
        <span>{detail}</span>
        <span className="uptime-sep">·</span>
        <span>{latency}</span>
      </div>
    </div>
  );
}

export default function UptimePage({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_INTERVAL);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/uptime');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setSecondsLeft(REFRESH_INTERVAL);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, REFRESH_INTERVAL * 1000);
    countdownRef.current = setInterval(
      () => setSecondsLeft((s) => (s <= 1 ? REFRESH_INTERVAL : s - 1)),
      1000,
    );
    return () => {
      clearInterval(timerRef.current);
      clearInterval(countdownRef.current);
    };
  }, [fetchStatus]);

  const overall = data?.overall ?? null;
  const overallLabel =
    overall === 'ok'       ? 'All systems operational' :
    overall === 'degraded' ? 'Partial degradation' :
    overall === 'down'     ? 'Major outage' : '—';

  return (
    <div className="uptime-page">
      <div className="uptime-header">
        <button className="uptime-back-btn" onClick={onBack}>← Back</button>
        <div className="uptime-header-title">
          <h1>Service Status</h1>
          <p>Live health of KnightAuraChess services</p>
        </div>
      </div>

      <div className="uptime-body">
        <div className="uptime-overall-row">
          <div className={`uptime-overall-pill uptime-overall-${overall ?? 'loading'}`}>
            {overall && <StatusDot status={overall} />}
            <span>{loading && !data ? 'Checking…' : overallLabel}</span>
          </div>
          <div className="uptime-meta">
            {data && (
              <span>
                Updated {new Date(data.checkedAt).toLocaleTimeString()}
              </span>
            )}
            {!loading && (
              <span className="uptime-countdown">
                Next check in <strong>{secondsLeft}s</strong>
                <button className="uptime-refresh-btn" onClick={fetchStatus} title="Refresh now">↻</button>
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="uptime-error">
            Failed to fetch status: {error}
          </div>
        )}

        {data?.services && (
          <div className="uptime-grid">
            {data.services.map((svc) => (
              <ServiceCard key={svc.label} {...svc} />
            ))}
          </div>
        )}

        {loading && !data && (
          <div className="uptime-spinner-wrap">
            <div className="uptime-spinner" />
          </div>
        )}
      </div>
    </div>
  );
}
