import { T } from '../lib/liveness';

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `0:${String(s).padStart(2, '0')}`;
};

/** Live eye openness (1 = your normal open eyes) against the blink line. */
function EyeMeter({ metrics }) {
  const pct = (v) => `${Math.max(0, Math.min(100, (v / 1.25) * 100))}%`;
  return (
    <div className="eyemeter" aria-hidden="true">
      <span className="eyemeter__label">{metrics.closed ? 'Closed' : 'Eyes'}</span>
      <span className="eyemeter__track">
        <span className={`eyemeter__fill${metrics.closed ? ' eyemeter__fill--closed' : ''}`} style={{ width: pct(metrics.openness) }} />
        <span className="eyemeter__mark" style={{ left: pct(T.blinkClose) }} />
      </span>
    </div>
  );
}

// Same geometry as the oval guide in the stage SVG.
const CX = 200;
const CY = 148;
const RX = 96;
const RY = 122;
const REACH = 20; // degrees that put the dot on the ring
const onRing = (a) => [CX + RX * Math.cos(a), CY + RY * Math.sin(a)];

/** Ring of directions around the oval that light up as the head points at each one. */
function CircleGuide({ visited, metrics }) {
  const n = visited.length;
  const step = (Math.PI * 2) / n;
  const gap = 0.07;
  let dot = null;
  if (metrics && metrics.calibrated) {
    let x = -metrics.yaw / REACH;
    let y = -metrics.pitch / REACH;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    dot = [CX + x * RX, CY + y * RY];
  }
  const inner = T.circleMin / REACH;
  return (
    <svg className="circle-guide" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <ellipse className="circle-guide__min" cx={CX} cy={CY} rx={RX * inner} ry={RY * inner} />
      {visited.map((on, i) => {
        const [x1, y1] = onRing(i * step + gap);
        const [x2, y2] = onRing((i + 1) * step - gap);
        return (
          <path
            key={i}
            className={`circle-guide__seg${on ? ' circle-guide__seg--on' : ''}`}
            d={`M ${x1} ${y1} A ${RX} ${RY} 0 0 1 ${x2} ${y2}`}
          />
        );
      })}
      {dot && <circle className="circle-guide__dot" cx={dot[0]} cy={dot[1]} r="7" />}
    </svg>
  );
}

export default function CameraStage({ videoRef, overlayRef, state, idleTitle, idleText }) {
  const { phase, message, remaining, stage, samples, samplesNeeded, metrics, challenges, circle } = state;
  const blinkActive = challenges.some((c) => c.active && c.key === 'blink');
  const circleActive = challenges.some((c) => c.active && c.key === 'circle');
  const live = phase === 'running';
  const tone = phase === 'passed' ? 'ok' : phase === 'failed' || phase === 'error' ? 'bad' : 'neutral';

  return (
    <div className={`stage stage--${phase}${live && circleActive ? ' stage--circle' : ''}`}>
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

        {live && circleActive && <CircleGuide visited={circle} metrics={metrics} />}

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
              {blinkActive && metrics && metrics.blinkReady && <EyeMeter metrics={metrics} />}
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
