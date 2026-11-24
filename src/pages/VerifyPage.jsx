import { useMemo, useRef } from 'react';
import CameraStage from '../components/CameraStage';
import LivenessMeter from '../components/LivenessMeter';
import { ChallengeSteps, CriteriaList } from '../components/Checklists';
import { randomChallenges } from '../lib/liveness';
import { MATCH_THRESHOLD, rankMatches, similarity } from '../lib/registry';
import { useLivenessSession } from '../lib/useLivenessSession';

const SAMPLES = 3;
const SCALE_MAX = 1; // distance axis shown on the match bar

export default function VerifyPage({ registry, navigate }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const { state, start, reset, swap } = useLivenessSession({ videoRef, overlayRef, samplesNeeded: SAMPLES });
  const busy = state.phase === 'loading' || state.phase === 'running';
  const empty = registry.people.length === 0;

  const ranking = useMemo(
    () => (state.phase === 'passed' ? rankMatches(state.descriptors, registry.people) : []),
    [state.phase, state.descriptors, registry.people],
  );
  const best = ranking[0];
  const matched = best && best.distance < MATCH_THRESHOLD;

  return (
    <div className="workspace">
      <div className="workspace__main">
        <CameraStage
          videoRef={videoRef}
          overlayRef={overlayRef}
          state={state}
          onSwap={swap}
          idleTitle="Verify a person"
          idleText="Each scan asks for two random challenges, then compares the live face against everyone in the registry."
        />
        <LivenessMeter score={state.score} parts={state.parts} phase={state.phase} />
      </div>

      <aside className="workspace__side">
        <header className="side-head">
          <p className="eyebrow">Module 02 · Verification</p>
          <h2>Verify face</h2>
        </header>

        {empty && !busy && state.phase !== 'passed' ? (
          <div className="notice notice--warn">
            <div>
              <p className="notice__title">The registry is empty</p>
              <p className="notice__text">Add at least one face before you verify. Liveness can still be tested on its own.</p>
              <div className="row">
                <button type="button" className="btn btn--primary" onClick={() => navigate('enroll')}>
                  Add a face
                </button>
                <button type="button" className="btn" onClick={() => start(randomChallenges())}>
                  Test liveness only
                </button>
              </div>
            </div>
          </div>
        ) : state.phase === 'passed' ? (
          <MatchResult best={best} matched={matched} ranking={ranking} onAgain={() => start(randomChallenges())} onReset={reset} />
        ) : (
          <div className="row">
            {busy ? (
              <button type="button" className="btn" onClick={reset}>
                Cancel scan
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => start(randomChallenges())}>
                {state.phase === 'failed' || state.phase === 'error' ? 'Try again' : 'Start verification'}
              </button>
            )}
            <span className="hint mono">{registry.people.length} enrolled</span>
          </div>
        )}

        <ChallengeSteps
          challenges={state.challenges.length ? state.challenges : [{ key: 'r1', label: 'Random challenge' }, { key: 'r2', label: 'Random challenge' }]}
          stage={state.stage}
          phase={state.phase}
          samples={state.samples || state.descriptors.length}
          samplesNeeded={SAMPLES}
        />
        <CriteriaList criteria={state.criteria} metrics={state.metrics} phase={state.phase} />
      </aside>
    </div>
  );
}

function MatchResult({ best, matched, ranking, onAgain, onReset }) {
  if (!best) {
    return (
      <section className="result">
        <p className="result__verdict result__verdict--ok">Live person detected</p>
        <p className="notice__text">No one is enrolled yet, so there was nothing to compare against.</p>
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={onAgain}>
            Scan again
          </button>
          <button type="button" className="btn" onClick={onReset}>
            Done
          </button>
        </div>
      </section>
    );
  }
  const pos = (d) => `${Math.min(100, (d / SCALE_MAX) * 100)}%`;
  return (
    <section className={`result result--${matched ? 'ok' : 'bad'}`}>
      <p className={`result__verdict result__verdict--${matched ? 'ok' : 'bad'}`}>{matched ? 'Verified' : 'No match'}</p>
      <div className="result__head">
        {matched ? (
          <img src={best.person.thumbnail} alt={best.person.name} className="result__thumb" />
        ) : (
          <span className="result__thumb result__thumb--blank" aria-hidden="true">?</span>
        )}
        <div>
          <p className="result__name">{matched ? best.person.name : 'Unknown person'}</p>
          <p className="result__meta mono">
            {matched ? `${Math.round(similarity(best.distance) * 100)}% similarity` : `Closest: ${best.person.name}`}
          </p>
        </div>
      </div>

      <div className="distbar" aria-label={`Distance ${best.distance.toFixed(3)}, threshold ${MATCH_THRESHOLD}`}>
        <div className="distbar__track">
          <span className="distbar__zone" style={{ width: pos(MATCH_THRESHOLD) }} />
          <span className="distbar__threshold" style={{ left: pos(MATCH_THRESHOLD) }} />
          <span className={`distbar__marker distbar__marker--${matched ? 'ok' : 'bad'}`} style={{ left: pos(best.distance) }} />
        </div>
        <div className="distbar__axis mono">
          <span>0.0 same</span>
          <span style={{ left: pos(MATCH_THRESHOLD) }}>{MATCH_THRESHOLD.toFixed(2)} limit</span>
          <span>1.0 different</span>
        </div>
        <p className="distbar__value mono">
          Euclidean distance <strong>{best.distance.toFixed(3)}</strong>
        </p>
      </div>

      {ranking.length > 1 && (
        <table className="rank mono">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            {ranking.slice(0, 4).map((r) => (
              <tr key={r.person.id}>
                <td>{r.person.name}</td>
                <td>{r.distance.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row">
        <button type="button" className="btn btn--primary" onClick={onAgain}>
          Verify again
        </button>
        <button type="button" className="btn" onClick={onReset}>
          Done
        </button>
      </div>
    </section>
  );
}
