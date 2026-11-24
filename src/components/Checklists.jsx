function Mark({ status }) {
  return (
    <span className={`mark mark--${status}`} aria-hidden="true">
      {status === 'ok' ? (
        <svg viewBox="0 0 16 16">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      ) : status === 'active' ? (
        <span className="mark__pulse" />
      ) : null}
    </span>
  );
}

export function ChallengeSteps({ challenges, stage, phase, samples, samplesNeeded }) {
  if (!challenges.length) return null;
  const captureStatus = phase === 'passed' ? 'ok' : stage === 'capture' && phase === 'running' ? 'active' : 'idle';
  return (
    <section className="panel-block">
      <h3 className="block-title">Active challenges</h3>
      <ol className="steps">
        {challenges.map((c) => {
          const status = c.done ? 'ok' : c.active && phase === 'running' ? 'active' : 'idle';
          return (
            <li key={c.key} className={`step step--${status}`}>
              <Mark status={status} />
              <span className="step__label">{c.label}</span>
              <span className="step__state">{c.done ? 'Done' : status === 'active' ? 'Now' : 'Waiting'}</span>
            </li>
          );
        })}
        <li className={`step step--${captureStatus}`}>
          <Mark status={captureStatus} />
          <span className="step__label">Frontal capture</span>
          <span className="step__state mono">
            {samples}/{samplesNeeded}
          </span>
        </li>
      </ol>
    </section>
  );
}

export function CriteriaList({ criteria, metrics, phase }) {
  const running = phase === 'running';
  const hasValues = running || phase === 'passed';
  return (
    <section className="panel-block">
      <h3 className="block-title">Passive criteria</h3>
      <ul className="criteria">
        {criteria.map((c) => {
          const status = !running ? (phase === 'passed' ? 'ok' : 'idle') : c.ok ? 'ok' : 'bad';
          return (
            <li key={c.key} className={`crit crit--${status}`}>
              <Mark status={status} />
              <span className="crit__label">{c.label}</span>
              <span className="crit__value mono">{hasValues ? c.value : '—'}</span>
              <span className="crit__range mono">{c.range}</span>
            </li>
          );
        })}
      </ul>
      {running && metrics && (
        <dl className="readouts mono">
          <div>
            <dt>EAR</dt>
            <dd>{metrics.ear.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Yaw</dt>
            <dd>
              {Math.abs(metrics.yaw) < 1 ? '0°' : `${Math.round(Math.abs(metrics.yaw))}° ${metrics.yaw > 0 ? 'L' : 'R'}`}
            </dd>
          </div>
          <div>
            <dt>Smile</dt>
            <dd>{Math.round(metrics.happy * 100)}%</dd>
          </div>
          <div>
            <dt>Detector</dt>
            <dd>{metrics.confidence.toFixed(2)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
