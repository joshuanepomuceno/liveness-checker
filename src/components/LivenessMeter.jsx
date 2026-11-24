import { T } from '../lib/liveness';

const R = 80;
const CX = 100;
const CY = 100;
const ARC = Math.PI * R;
const TICKS = [0, 20, 40, 60, 80, 100];

const point = (v, r = R) => {
  const a = Math.PI * (1 - v / 100);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
};

const PARTS = [
  { key: 'criteria', label: 'Passive criteria', max: 40 },
  { key: 'challenges', label: 'Active challenges', max: 50 },
  { key: 'capture', label: 'Frontal capture', max: 10 },
];

export default function LivenessMeter({ score, parts, phase }) {
  const v = Math.max(0, Math.min(100, score));
  const level = v >= T.livePass ? 'ok' : v >= 50 ? 'warn' : 'bad';
  const verdict =
    phase === 'passed' ? 'Live' : phase === 'idle' ? 'Not started' : phase === 'running' || phase === 'loading' ? 'Checking' : 'Not live';
  const [tx1, ty1] = point(T.livePass, R - 14);
  const [tx2, ty2] = point(T.livePass, R + 14);

  return (
    <section className="meter" aria-label="Liveness meter">
      <svg viewBox="0 0 200 122" className="meter__svg" role="img" aria-label={`Liveness score ${v} of 100`}>
        <path className="meter__track" d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} />
        <path
          className={`meter__value meter__value--${level}`}
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          strokeDasharray={ARC}
          strokeDashoffset={ARC * (1 - v / 100)}
        />
        <line className="meter__threshold" x1={tx1} y1={ty1} x2={tx2} y2={ty2} />
        {TICKS.map((t) => {
          const [x, y] = point(t, R + 24);
          return (
            <text key={t} x={x} y={y + 3} className="meter__tick" textAnchor="middle">
              {t}
            </text>
          );
        })}
        <text x={CX} y={CY - 14} className="meter__score" textAnchor="middle">
          {v}
        </text>
        <text x={CX} y={CY + 8} className="meter__unit" textAnchor="middle">
          LIVENESS / 100
        </text>
      </svg>
      <div className="meter__side">
        <div className="meter__foot">
          <span className={`pill pill--${phase === 'passed' ? 'ok' : phase === 'failed' ? 'bad' : 'muted'}`}>{verdict}</span>
          <span className="meter__note">Pass at {T.livePass}</span>
        </div>
        <dl className="parts">
          {PARTS.map((p) => {
            const val = parts ? parts[p.key] : 0;
            return (
              <div key={p.key} className="parts__row">
                <dt>{p.label}</dt>
                <dd className="mono">
                  {Math.round(val)}/{p.max}
                </dd>
                <span className="parts__bar" aria-hidden="true">
                  <span style={{ width: `${(val / p.max) * 100}%` }} />
                </span>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
