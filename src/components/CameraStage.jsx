const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `0:${String(s).padStart(2, '0')}`;
};

/** Live eye openness against the learned open-eye level, so people can see a blink register. */
function EyeMeter({ metrics }) {
  const scale = metrics.earBaseline * 1.25;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  return (
    <div className="eyemeter" aria-hidden="true">
      <span className="eyemeter__label">{metrics.earClosed ? 'Closed' : 'Eyes'}</span>
      <span className="eyemeter__track">
        <span className={`eyemeter__fill${metrics.earClosed ? ' eyemeter__fill--closed' : ''}`} style={{ width: pct(metrics.ear) }} />
        <span className="eyemeter__mark" style={{ left: pct(metrics.earBaseline * 0.8) }} />
      </span>
    </div>
  );
}

export default function CameraStage({ videoRef, overlayRef, state, idleTitle, idleText }) {
  const { phase, message, remaining, stage, samples, samplesNeeded, metrics, challenges } = state;
  const blinkActive = challenges.some((c) => c.active && c.key === 'blink');
  const live = phase === 'running';
  const tone = phase === 'passed' ? 'ok' : phase === 'failed' || phase === 'error' ? 'bad' : 'neutral';

  return (
    <div className={`stage stage--${phase}`}>
      <div className="stage__frame">
        <video ref={videoRef} className="stage__video" playsInline muted hidden={!live} />
        <canvas ref={overlayRef} className="stage__overlay" hidden={!live} />
        {phase === 'passed' && state.still && <img className="stage__still" src={state.still} alt="Captured frame" />}

        <svg className={`stage__guide stage__guide--${tone}`} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <ellipse cx="200" cy="148" rx="82" ry="108" />
        </svg>

        {phase === 'idle' && (
          <div className="stage__empty">
            <p className="stage__empty-title">{idleTitle}</p>
            <p className="stage__empty-text">{idleText}</p>
          </div>
        )}
        {phase === 'loading' && (
          <div className="stage__empty" role="status">
            <span className="spinner" aria-hidden="true" />
            <p className="stage__empty-text">{message}</p>
          </div>
        )}
        {phase === 'error' && (
          <div className="stage__empty" role="alert">
            <p className="stage__empty-title">Camera unavailable</p>
            <p className="stage__empty-text">{state.error}</p>
          </div>
        )}
        {phase === 'failed' && (
          <div className="stage__empty" role="alert">
            <p className="stage__empty-title">Check not completed</p>
            <p className="stage__empty-text">{message}</p>
          </div>
        )}

        {live && (
          <>
            <div className="stage__chips">
              <span className="chip chip--rec">
                <span className="chip__dot" aria-hidden="true" />
                {stage === 'capture' ? `Capturing ${samples}/${samplesNeeded}` : 'Live check'}
              </span>
              <span className={`chip chip--time${remaining < 10000 ? ' chip--low' : ''}`}>{fmt(remaining)}</span>
            </div>
            <div className="stage__prompt">
              <p aria-live="polite">{message}</p>
              {blinkActive && metrics && metrics.earBaseline > 0 && <EyeMeter metrics={metrics} />}
            </div>
          </>
        )}
        {phase === 'passed' && (
          <div className="stage__chips">
            <span className="chip chip--ok">Liveness confirmed</span>
          </div>
        )}
      </div>
    </div>
  );
}
