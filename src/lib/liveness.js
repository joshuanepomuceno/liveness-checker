// Liveness criteria, thresholds and per-frame measurements.
// All geometry works in raw (unmirrored) video pixels.

export const T = {
  sizeMin: 0.2, // face width as a share of frame width
  sizeMax: 0.7,
  centerMax: 0.18, // distance of face centre from frame centre, share of frame
  lumaMin: 60, // mean face luminance, 0-255
  lumaMax: 215,
  sharpMin: 22, // Laplacian variance of the face crop
  motionMax: 0.5, // movement in face widths per second (per second, so low frame rates aren't penalised)
  yawFront: 12, // degrees from the resting pose allowed for a frontal capture
  pitchFront: 15,
  smile: 0.75, // "happy" expression probability
  blinkClose: 0.84, // eye openness (1 = your normal open eyes) that counts as closed
  blinkOpen: 0.92, // ...and that counts as reopened
  poseBaseMax: 25, // most off-axis resting pose accepted (cameras beside or above the screen)
  circleMin: 8, // degrees away from the resting pose before a direction counts
  circleSectors: 8, // directions around the circle
  circleNeed: 6, // directions that must be visited
  livePass: 80, // liveness score needed to pass
};

export const SESSION_MS = 60000;

export const CHALLENGES = {
  blink: { label: 'Blink', hint: 'Close both eyes for a moment, then open them' },
  circle: { label: 'Head circle', hint: 'Slowly move your head in a full circle' },
  smile: { label: 'Smile', hint: 'Give a clear smile' },
};

export const ENROLL_CHALLENGES = ['blink', 'circle'];

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
 * Approximate head pitch from where the nose tip sits between the eyes and the
 * chin. Only meaningful relative to the person's resting value; a larger number
 * means the head tilted further up.
 */
export function headPitch(landmarks) {
  const p = landmarks.positions;
  const eyeY = p.slice(36, 48).reduce((sum, pt) => sum + pt.y, 0) / 12;
  const ratio = (p[30].y - eyeY) / (p[8].y - eyeY || 1);
  return -ratio * 240;
}

let eyeCanvas = null;
let eyeCtx = null;

/**
 * Grey-level contrast around both eyes. An open eye shows white sclera and a dark
 * iris; a closed one is mostly skin, so contrast falls even when the 68 landmark
 * points barely move, which is common for small faces on tablet cameras.
 */
export function eyeContrast(video, landmarks) {
  if (!eyeCanvas) {
    eyeCanvas = document.createElement('canvas');
    eyeCanvas.width = 32;
    eyeCanvas.height = 16;
    eyeCtx = eyeCanvas.getContext('2d', { willReadFrequently: true });
  }
  const p = landmarks.positions;
  let total = 0;
  [p.slice(36, 42), p.slice(42, 48)].forEach((eye) => {
    const xs = eye.map((pt) => pt.x);
    const ys = eye.map((pt) => pt.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const bw = w * 1.3;
    const bh = bw / 2;
    eyeCtx.drawImage(video, cx - bw / 2, cy - bh / 2, bw, bh, 0, 0, 32, 16);
    const { data } = eyeCtx.getImageData(0, 0, 32, 16);
    let sum = 0;
    let sq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += g;
      sq += g * g;
    }
    const mean = sum / n;
    total += Math.sqrt(Math.max(0, sq / n - mean * mean));
  });
  return total / 2;
}

const p80 = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.8)];

/**
 * Blink detector. It learns the person's normal open-eye shape (EAR) and eye
 * contrast from recent frames (80th percentile, so half-closed frames don't drag
 * it down) and fuses them into one "openness" where 1 means normal open eyes.
 * A single frame below T.blinkClose then one above T.blinkOpen is a blink, which
 * keeps working at the low frame rates of tablets.
 */
export function createBlinkTracker() {
  const earHist = [];
  const conHist = [];
  let earBase = 0;
  let conBase = 0;
  let openness = 1;
  let closed = false;
  const ready = () => earHist.length >= 6;
  return {
    update(ear, contrast) {
      if (ready()) {
        const earPart = ear / earBase;
        openness = conBase > 1 ? 0.5 * earPart + 0.5 * (contrast / conBase) : earPart;
      }
      if (!closed && (!ready() || openness >= T.blinkClose)) {
        earHist.push(ear);
        conHist.push(contrast);
        if (earHist.length > 30) {
          earHist.shift();
          conHist.shift();
        }
        earBase = p80(earHist);
        conBase = p80(conHist);
      }
      if (!ready()) return false;
      if (!closed && openness < T.blinkClose) {
        closed = true;
      } else if (closed && openness > T.blinkOpen) {
        closed = false;
        return true;
      }
      return false;
    },
    get ready() {
      return ready();
    },
    get openness() {
      return openness;
    },
    get closed() {
      return closed;
    },
  };
}

/**
 * Head-circle challenge. Takes yaw and pitch relative to the resting pose and
 * marks which of the directions around the circle the head has pointed at.
 * Works on head rotation, not position, so sliding a photo around doesn't count.
 * Directions are in screen space of the mirrored preview: right = +x, down = +y.
 */
export function createCircleTracker() {
  const visited = new Array(T.circleSectors).fill(false);
  return {
    update(yaw, pitch) {
      const x = -yaw; // yaw is positive to the person's left, which is screen left in the mirror
      const y = -pitch;
      if (Math.hypot(x, y) >= T.circleMin) {
        const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
        visited[Math.floor(angle / ((Math.PI * 2) / T.circleSectors)) % T.circleSectors] = true;
      }
      return visited.filter(Boolean).length >= T.circleNeed;
    },
    get visited() {
      return visited.slice();
    },
    get count() {
      return visited.filter(Boolean).length;
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

/**
 * The passive criteria shown in the checklist. `gate` ones must pass for a challenge
 * to count; all of them must pass for the frontal capture.
 */
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
      gate: false,
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
      gate: false,
    },
    {
      key: 'steady',
      label: 'Holding still',
      ok: has && m.motion <= T.motionMax,
      value: has ? `${Math.round(m.motion * 100)}%/s` : '—',
      range: `≤ ${Math.round(T.motionMax * 100)}%/s`,
      gate: false,
    },
  ];
}

/** One plain instruction for the person in front of the camera. */
export function instructionFor({ faceCount, metrics, criteria, stage, challenge, armed, circleCount = 0 }) {
  if (faceCount === 0) return 'Place your face inside the oval';
  if (faceCount > 1) return 'Only one person should be in view';
  const failed = (key) => !criteria.find((c) => c.key === key).ok;
  if (failed('size')) return metrics.size < T.sizeMin ? 'Move a little closer' : 'Move back a little';
  if (failed('light')) return metrics.luma < T.lumaMin ? 'Find more light on your face' : 'Too bright. Avoid direct light behind or on you';
  if (stage === 'capture') {
    if (failed('center')) return 'Center your face in the oval';
    if (failed('sharp')) return 'Image is blurry. Hold still or wipe the lens';
    if (Math.abs(metrics.yaw) > T.yawFront || Math.abs(metrics.pitch) > T.pitchFront) return 'Face the screen like you did at the start';
    if (metrics.closed) return 'Keep your eyes open';
    if (failed('steady')) return 'Hold still for a moment';
    return 'Capturing face samples. Hold still';
  }
  if (!challenge) return '';
  if (!armed) return challenge.key === 'smile' ? 'Relax your face first' : 'Face the screen naturally';
  if (challenge.key === 'circle' && circleCount > 0) return `Keep circling slowly · ${circleCount} of ${T.circleNeed} directions`;
  return challenge.hint;
}
