import { useState } from 'react';

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function RegistryPage({ registry, navigate }) {
  const [confirmId, setConfirmId] = useState(null);
  const { people } = registry;

  return (
    <div className="registry">
      <header className="registry__head">
        <div>
          <p className="eyebrow">Stored on this device</p>
          <h2>Registry</h2>
          <p className="hint">
            {people.length} {people.length === 1 ? 'person' : 'people'} enrolled. Data stays in this browser's local storage.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => navigate('enroll')}>
            Add face
          </button>
          {people.length > 0 &&
            (confirmId === 'all' ? (
              <>
                <button type="button" className="btn btn--danger" onClick={() => { registry.clear(); setConfirmId(null); }}>
                  Delete all {people.length}
                </button>
                <button type="button" className="btn" onClick={() => setConfirmId(null)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmId('all')}>
                Clear registry
              </button>
            ))}
        </div>
      </header>

      {people.length === 0 ? (
        <div className="registry__empty">
          <p className="stage__empty-title">No faces yet</p>
          <p className="hint">Enroll someone with the Add face module. Their samples will appear here.</p>
        </div>
      ) : (
        <ul className="people">
          {people.map((p) => (
            <li key={p.id} className="person">
              <img src={p.thumbnail} alt={p.name} className="person__thumb" />
              <div className="person__body">
                <p className="person__name">{p.name}</p>
                <p className="person__meta mono">{p.descriptors.length} samples</p>
                <p className="person__meta">{dateFmt.format(new Date(p.createdAt))}</p>
              </div>
              <div className="person__actions">
                {confirmId === p.id ? (
                  <>
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => { registry.remove(p.id); setConfirmId(null); }}>
                      Delete
                    </button>
                    <button type="button" className="btn btn--sm" onClick={() => setConfirmId(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirmId(p.id)}>
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
