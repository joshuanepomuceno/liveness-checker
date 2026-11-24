import { useCallback, useEffect, useState } from 'react';
import EnrollPage from './pages/EnrollPage';
import VerifyPage from './pages/VerifyPage';
import RegistryPage from './pages/RegistryPage';
import { useRegistry } from './lib/registry';

const ROUTES = ['enroll', 'verify', 'registry'];
const currentRoute = () => {
  const h = window.location.hash.replace('#', '');
  return ROUTES.includes(h) ? h : 'enroll';
};

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const registry = useRegistry();

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r) => {
    window.location.hash = r;
  }, []);

  const tabs = [
    { key: 'enroll', label: 'Add face' },
    { key: 'verify', label: 'Verify' },
    { key: 'registry', label: 'Registry', count: registry.people.length },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <a className="brand" href="#enroll" aria-label="Liveness Checker home">
            <svg viewBox="0 0 32 32" className="brand__mark" aria-hidden="true">
              <ellipse cx="16" cy="16" rx="9" ry="12" />
              <path d="M3 9V4h5M24 4h5v5M29 23v5h-5M8 28H3v-5" />
            </svg>
            <span>Liveness Checker</span>
          </a>
          <nav className="tabs" aria-label="Modules">
            {tabs.map((t) => (
              <a key={t.key} href={`#${t.key}`} className="tab" aria-current={route === t.key ? 'page' : undefined}>
                {t.label}
                {t.count !== undefined && <span className="tab__count mono">{t.count}</span>}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="content">
        {route === 'enroll' && <EnrollPage key="enroll" registry={registry} navigate={navigate} />}
        {route === 'verify' && <VerifyPage key="verify" registry={registry} navigate={navigate} />}
        {route === 'registry' && <RegistryPage registry={registry} navigate={navigate} />}
      </main>

      <footer className="footer">
        <p>Runs entirely on this device. Video never leaves the browser and no database is used.</p>
      </footer>
    </div>
  );
}
