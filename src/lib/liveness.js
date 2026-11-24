// Liveness criteria, thresholds and per-frame measurements.
// All geometry works in raw (unmirrored) video pixels.

export const T = {
  sizeMin: 0.2, // face width as a share of frame width
  sizeMax: 0.7,
  centerMax: 0.18, // distance of face centre from frame centre, share of frame
  lumaMin: 60, // mean face luminance, 0-255
  lumaMax: 215,
  sharpMin: 22, // Laplacian variance of the face crop
  motionMax: 0.035, // per-frame movement as a share of face width
  yawTurn: 18, // degrees needed for a head-turn challenge
  yawFront: 10, // degrees allowed for a frontal pose
  smile: 0.75, // "happy" expression probability
  blinkClose: 0.8, // EAR below this share of the open-eye baseline counts as closed
  blinkOpen: 0.9, // ...and back above this share counts as reopened
  yawBaseMax: 25, // most off-axis resting pose accepted (side-mounted tablet cameras)
  livePass: 80, // liveness score needed to pass
};

export const SESSION_MS = 45000;

export const CHALLENGES = {
  blink: { label: 'Blink', hint: 'Close both eyes for a moment, then open them' },
  turnLeft: { label: 'Turn left', hint: 'Turn your head to your left' },
  turnRight: { label: 'Turn right', hint: 'Turn your head to your right' },
  smile: { label: 'Smile', hint: 'Give a clear smile' },
};

export const ENROLL_CHALLENGES = ['blink', 'turnLeft', 'turnRight'];

/** Two random challenges, in random order, so a recorded video can't anticipate them. */
export function randomChallenges(count = 2) {
  const keys = Object.keys(CHALLENGES);
  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys.slice(0, count);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function eyeRatio(p) {
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
}

/** Eye aspect ratio (Soukupová & Čech), averaged over both eyes. ~0.3 open, <0.2 closed. */
export function eyeAspectRatio(landmarks) {
  const p = landmarks.positions;
  return (eyeRatio(p.slice(36, 42)) + eyeRatio(p.slice(42, 48))) / 2;
}

/**
 * Approximate head yaw in degrees from where the nose tip sits between the jaw edges.
 * Positive means the person turned to their own left.
 */
export function headYaw(landmarks) {
  const p = landmarks.positions;
  const left = p[0];
  const right = p[16];
  const nose = p[30];
  const ratio = (nose.x - left.x) / (right.x - left.x || 1);
  return (ratio - 0.5) * 100;
}

/**
 * Learns the person's open-eye EAR from recent frames (80th percentile, so a
 * half-closed frame doesn't drag it down) and reports true on the frame a blink
 * completes. Relative thresholds work for small or hooded eyes, and a single
 * closed frame is enough, which matters at the low frame rates of tablets.
 */
export function createBlinkTracker() {
  const history = [];
  let baseline = 0;
  let closed = false;
  return {
    update(ear) {
      if (!closed) {
        history.push(ear);
        if (history.length > 30) history.shift();
        const sorted = [...history].sort((a, b) => a - b);
        baseline = sorted[Math.floor(sorted.length * 0.8)];
      }
      if (history.length < 6) return false;
      if (!closed && ear < baseline * T.blinkClose) {
        closed = true;
      } else if (closed && ear > baseline * T.blinkOpen) {
        closed = false;
        return true;
      }
      return false;
    },
    get baseline() {
      return history.length < 6 ? 0 : baseline;
    },
    get closed() {
      return closed;
    },
  };
}

/** Median of a small array. */
export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const SAMPLE = 96;
let statCanvas = null;
let statCtx = null;

function clampBox(box, vw, vh) {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  return {
    x,
    y,
    width: Math.max(1, Math.min(vw - x, box.width)),
    height: Math.max(1, Math.min(vh - y, box.height)),
  };
}

/** Mean luminance and Laplacian variance (focus) of the face region. */
export function regionStats(video, box) {
  if (!statCanvas) {
    statCanvas = document.createElement('canvas');
    statCanvas.width = SAMPLE;
    statCanvas.height = SAMPLE;
    statCtx = statCanvas.getContext('2d', { willReadFrequently: true });
  }
  const b = clampBox(box, video.videoWidth, video.videoHeight);
  statCtx.drawImage(video, b.x, b.y, b.width, b.height, 0, 0, SAMPLE, SAMPLE);
  const { data } = statCtx.getImageData(0, 0, SAMPLE, SAMPLE);
  const gray = new Float32Array(SAMPLE * SAMPLE);
  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = g;
    sum += g;
  }
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < SAMPLE - 1; y += 1) {
    for (let x = 1; x < SAMPLE - 1; x += 1) {
      const i = y * SAMPLE + x;
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - SAMPLE] - gray[i + SAMPLE];
      lapSum += v;
      lapSq += v * v;
      n += 1;
    }
  }
  const mean = lapSum / n;
  return { luma: sum / gray.length, sharpness: lapSq / n - mean * mean };
}

/** Square JPEG crop of the face with some margin, for the registry thumbnail. */
export function faceThumbnail(video, box, size = 192) {
  const pad = box.width * 0.35;
  const side = box.width + pad * 2;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size, 0);
  ctx.scale(-1, 1); // store as the person saw themselves
  ctx.drawImage(video, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Mirrored still of the whole frame, shown after the camera stops. */
export function frameStill(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}

const pct = (v) => `${Math.round(v * 100)}%`;

/** The passive criteria shown in the checklist. `gate` ones must pass before challenges count. */
export function evaluateCriteria(faceCount, m) {
  const has = Boolean(m);
  return [
    {
      key: 'face',
      label: 'One face in view',
      ok: faceCount === 1,
      value: faceCount === 1 ? '1 face' : `${faceCount} faces`,
      range: 'exactly 1',
      gate: true,
    },
    {
      key: 'size',
      label: 'Distance to camera',
      ok: has && m.size >= T.sizeMin && m.size <= T.sizeMax,
      value: has ? `${pct(m.size)} of frame` : '—',
      range: `${pct(T.sizeMin)}–${pct(T.sizeMax)}`,
      gate: true,
    },
    {
      key: 'center',
      label: 'Centered',
      ok: has && m.offset <= T.centerMax,
      value: has ? `${pct(m.offset)} off` : '—',
      range: `≤ ${pct(T.centerMax)}`,
      gate: true,
    },
    {
      key: 'light',
      label: 'Lighting',
      ok: has && m.luma >= T.lumaMin && m.luma <= T.lumaMax,
      value: has ? `${Math.round(m.luma)} luma` : '—',
      range: `${T.lumaMin}–${T.lumaMax}`,
      gate: true,
    },
    {
      key: 'sharp',
      label: 'Sharpness',
      ok: has && m.sharpness >= T.sharpMin,
      value: has ? `${Math.round(m.sharpness)} var` : '—',
      range: `≥ ${T.sharpMin}`,
      gate: true,
    },
    {
      key: 'steady',
      label: 'Holding still',
      ok: has && m.motion <= T.motionMax,
      value: has ? `${(m.motion * 100).toFixed(1)}%/frame` : '—',
      range: `≤ ${(T.motionMax * 100).toFixed(1)}%`,
      gate: false,
    },
  ];
}

/** One plain instruction for the person in front of the camera. */
export function instructionFor({ faceCount, metrics, criteria, stage, challenge, armed }) {
  if (faceCount === 0) return 'Place your face inside the oval';
  if (faceCount > 1) return 'Only one person should be in view';
  const failed = (key) => !criteria.find((c) => c.key === key).ok;
  if (failed('size')) return metrics.size < T.sizeMin ? 'Move a little closer' : 'Move back a little';
  if (failed('center')) return 'Center your face in the oval';
  if (failed('light')) return metrics.luma < T.lumaMin ? 'Find more light on your face' : 'Too bright. Avoid direct light behind or on you';
  if (failed('sharp')) return 'Image is blurry. Hold still or wipe the lens';
  if (stage === 'capture') {
    if (Math.abs(metrics.yaw) > T.yawFront) return 'Face the screen naturally';
    if (failed('steady')) return 'Hold still while we capture';
    return 'Capturing face samples. Hold still';
  }
  if (challenge && !armed) return challenge.key === 'smile' ? 'Relax your face first' : 'Face the screen naturally';
  return challenge ? challenge.hint : '';
}
