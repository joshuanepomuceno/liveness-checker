// Enrolled faces live in this browser's localStorage. No server, no database.
import { useCallback, useState } from 'react';

const KEY = 'liveness-checker.registry.v1';

/** Euclidean distance on 128-d face descriptors. Same person is usually under 0.45. */
export const MATCH_THRESHOLD = 0.5;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function useRegistry() {
  const [people, setPeople] = useState(read);
  const [error, setError] = useState('');

  const commit = useCallback((next) => {
    const ok = write(next);
    setError(ok ? '' : 'Could not save to this browser. Storage may be full or blocked.');
    setPeople(next);
    return ok;
  }, []);

  const add = useCallback(
    (person) => {
      const entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        createdAt: new Date().toISOString(),
        ...person,
      };
      return commit([entry, ...read()]) ? entry : null;
    },
    [commit],
  );

  const remove = useCallback((id) => commit(read().filter((p) => p.id !== id)), [commit]);
  const clear = useCallback(() => commit([]), [commit]);

  return { people, add, remove, clear, error };
}

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export function meanDescriptor(descriptors) {
  const out = new Array(128).fill(0);
  descriptors.forEach((d) => d.forEach((v, i) => { out[i] += v / descriptors.length; }));
  return out;
}

/** Ranks enrolled people by their closest stored sample to the probe's mean descriptor. */
export function rankMatches(probeDescriptors, people) {
  if (!probeDescriptors.length) return [];
  const probe = meanDescriptor(probeDescriptors);
  return people
    .map((person) => ({
      person,
      distance: Math.min(...person.descriptors.map((d) => euclidean(probe, d))),
    }))
    .sort((a, b) => a.distance - b.distance);
}

/** 100% at distance 0, 50% at the threshold, 0% at twice the threshold. */
export function similarity(distance) {
  return Math.max(0, Math.min(1, 1 - distance / (MATCH_THRESHOLD * 2)));
}
