import { useMemo, useRef, useState } from 'react';
import CameraStage from '../components/CameraStage';
import LivenessMeter from '../components/LivenessMeter';
import { ChallengeSteps, CriteriaList } from '../components/Checklists';
import { CHALLENGES, ENROLL_CHALLENGES } from '../lib/liveness';
import { MATCH_THRESHOLD, rankMatches } from '../lib/registry';
import { useLivenessSession } from '../lib/useLivenessSession';

const SAMPLES = 5;

export default function EnrollPage({ registry, navigate }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const { state, start, reset } = useLivenessSession({ videoRef, overlayRef, samplesNeeded: SAMPLES });
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(null);

  const trimmed = name.trim();
  const busy = state.phase === 'loading' || state.phase === 'running';
  const nameError = trimmed.length > 0 && trimmed.length < 2 ? 'Use at least 2 characters.' : '';

  const duplicate = useMemo(() => {
    if (state.phase !== 'passed') return null;
    const best = rankMatches(state.descriptors, registry.people)[0];
    return best && best.distance < MATCH_THRESHOLD ? best : null;
  }, [state.phase, state.descriptors, registry.people]);

  const begin = (e) => {
    e.preventDefault();
    if (trimmed.length < 2 || busy) return;
    setSaved(null);
    start(ENROLL_CHALLENGES);
  };

  const save = () => {
    const entry = registry.add({ name: trimmed, descriptors: state.descriptors, thumbnail: state.thumbnail });
    if (entry) {
      setSaved(entry);
      reset();
      setName('');
    }
  };

  return (
    <div className="workspace">
      <div className="workspace__main">
        <CameraStage
          videoRef={videoRef}
          overlayRef={overlayRef}
          state={state}
          idleTitle="Add a face to the registry"
          idleText="Enter a name, then start the scan. You will blink and move your head in a circle so we know it is a live person."
        />
        <LivenessMeter score={state.score} parts={state.parts} phase={state.phase} />
      </div>

      <aside className="workspace__side">
        <header className="side-head">
          <p className="eyebrow">Module 01 · Enrollment</p>
          <h2>Add face</h2>
        </header>

        {saved && (
          <div className="notice notice--ok" role="status">
            <img src={saved.thumbnail} alt="" className="notice__thumb" />
            <div>
              <p className="notice__title">{saved.name} was added</p>
              <p className="notice__text">{saved.descriptors.length} face samples saved in this browser.</p>
              <div className="row">
                <button type="button" className="btn btn--primary" onClick={() => navigate('verify')}>
                  Verify now
                </button>
                <button type="button" className="btn" onClick={() => setSaved(null)}>
                  Add another
                </button>
              </div>
            </div>
          </div>
        )}

        {state.phase === 'passed' ? (
          <section className="result">
            <div className="result__head">
              <img src={state.thumbnail} alt={`Captured face for ${trimmed}`} className="result__thumb" />
              <div>
                <p className="eyebrow">Ready to save</p>
                <p className="result__name">{trimmed}</p>
                <p className="result__meta mono">{state.descriptors.length} samples · 128-d descriptors</p>
              </div>
            </div>
            {duplicate && (
              <p className="notice notice--warn" role="alert">
                This face already looks like <strong>{duplicate.person.name}</strong> (distance{' '}
                <span className="mono">{duplicate.distance.toFixed(3)}</span>). Save only if this is a different person.
              </p>
            )}
            <div className="row">
              <button type="button" className="btn btn--primary" onClick={save}>
                {duplicate ? 'Save anyway' : 'Save to registry'}
              </button>
              <button type="button" className="btn" onClick={reset}>
                Retake
              </button>
            </div>
            {registry.error && <p className="field__error">{registry.error}</p>}
          </section>
        ) : (
          <form className="enroll-form" onSubmit={begin} noValidate>
            <label className="field" htmlFor="enroll-name">
              <span className="field__label">Full name</span>
              <input
                id="enroll-name"
                className="field__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maria Santos"
                autoComplete="off"
                maxLength={60}
                disabled={busy}
                aria-invalid={Boolean(nameError)}
              />
              {nameError && <span className="field__error">{nameError}</span>}
            </label>
            <div className="row">
              {busy ? (
                <button type="button" className="btn" onClick={reset}>
                  Cancel scan
                </button>
              ) : (
                <button type="submit" className="btn btn--primary" disabled={trimmed.length < 2}>
                  {state.phase === 'failed' || state.phase === 'error' ? 'Try again' : 'Start face scan'}
                </button>
              )}
            </div>
          </form>
        )}

        <ChallengeSteps
          challenges={state.challenges.length ? state.challenges : ENROLL_CHALLENGES.map((key) => ({ key, ...CHALLENGES[key] }))}
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

