import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHALLENGES,
  SESSION_MS,
  T,
  createBlinkTracker,
  evaluateCriteria,
  eyeAspectRatio,
  faceThumbnail,
  frameStill,
  headYaw,
  instructionFor,
  regionStats,
} from './liveness';

const IDLE = {
  phase: 'idle', // idle | loading | running | passed | failed | error
  stage: 'challenge', // challenge | capture
  criteria: evaluateCriteria(0, null),
  challenges: [],
  score: 0,
  parts: { criteria: 0, challenges: 0, capture: 0 },
  metrics: null,
  message: '',
  error: '',
  remaining: SESSION_MS,
  samples: 0,
  samplesNeeded: 0,
  descriptors: [],
  thumbnail: null,
  still: null,
};

function describeCameraError(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No camera was found. Connect a camera and try again.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.';
  if (!navigator.mediaDevices) return 'This browser cannot use the camera here. Open the site over https or on localhost.';
  return `Could not start the face scan: ${err && err.message ? err.message : 'unknown error'}.`;
}

function drawOverlay(canvas, video, faces, ok) {
  if (!canvas) return;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const style = getComputedStyle(canvas);
  const color = (ok ? style.getPropertyValue('--cam-ok') : style.getPropertyValue('--cam-warn')).trim() || '#fff';
  const unit = w / 640;
  faces.forEach((f) => {
    const { x, y, width, height } = f.detection.box;
    const len = width * 0.18;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * unit;
    ctx.lineCap = 'round';
    ctx.beginPath();
    [
      [x, y + len, x, y, x + len, y],
      [x + width - len, y, x + width, y, x + width, y + len],
      [x + width, y + height - len, x + width, y + height, x + width - len, y + height],
      [x + len, y + height, x, y + height, x, y + height - len],
    ].forEach(([ax, ay, bx, by, cx, cy]) => {
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.fillStyle = color;
    const p = f.landmarks.positions;
    [...p.slice(36, 48), p[30], p[0], p[16]].forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.8 * unit, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function clearOverlay(canvas) {
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Runs one liveness session against the webcam: passive quality criteria,
 * then each active challenge in order, then captures face descriptors.
 */
export function useLivenessSession({ videoRef, overlayRef, samplesNeeded = 5 }) {
  const [state, setState] = useState(IDLE);
  const run = useRef(null);

  const stop = useCallback(() => {
    const r = run.current;
    if (!r) return;
    r.active = false;
    if (r.stream) r.stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    clearOverlay(overlayRef.current);
    run.current = null;
  }, [videoRef, overlayRef]);

  useEffect(() => stop, [stop]);

  const reset = useCallback(() => {
    stop();
    setState(IDLE);
  }, [stop]);

  const start = useCallback(
    async (challengeKeys) => {
      stop();
      const r = { active: true, stream: null };
      run.current = r;
      const list = challengeKeys.map((key) => ({ key, ...CHALLENGES[key], done: false }));
      const view = (idx, stage) => list.map((c, i) => ({ ...c, active: stage === 'challenge' && i === idx }));

      setState({ ...IDLE, phase: 'loading', samplesNeeded, challenges: view(0, 'challenge'), message: 'Loading face models' });

      const video = videoRef.current;
      try {
        // Loaded on demand so the page paints before TensorFlow arrives.
        const engine = await import('./faceEngine');
        r.engine = engine;
        await engine.loadModels();
        if (!r.active) return;
        setState((s) => ({ ...s, message: 'Waiting for camera permission' }));
        r.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!r.active) {
          r.stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = r.stream;
        await video.play();
      } catch (err) {
        if (!r.active) return;
        stop();
        setState({ ...IDLE, phase: 'error', error: describeCameraError(err) });
        return;
      }

      const blink = createBlinkTracker();
      const descriptors = [];
      const startedAt = performance.now();
      let idx = 0;
      let stage = 'challenge';
      let armed = false;
      let lastCenter = null;
      let motion = 0;
      let thumbnail = null;

      const finish = (patch) => {
        stop();
        setState((s) => ({ ...s, ...patch }));
      };

      const tick = async () => {
        if (!r.active) return;
        if (video.readyState < 2 || !video.videoWidth) {
          requestAnimationFrame(tick);
          return;
        }
        let faces = [];
        try {
          faces = await r.engine.detectFaces(video, stage === 'capture');
        } catch (err) {
          console.error(err);
        }
        if (!r.active) return;

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const face = faces.slice().sort((a, b) => b.detection.box.area - a.detection.box.area)[0];
        let metrics = null;
        if (face) {
          const box = face.detection.box;
          const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          if (lastCenter) motion = motion * 0.6 + 0.4 * (Math.hypot(center.x - lastCenter.x, center.y - lastCenter.y) / box.width);
          lastCenter = center;
          metrics = {
            size: box.width / vw,
            offset: Math.hypot(center.x / vw - 0.5, center.y / vh - 0.5),
            ...regionStats(video, box),
            ear: eyeAspectRatio(face.landmarks),
            yaw: headYaw(face.landmarks),
            happy: face.expressions.happy,
            confidence: face.detection.score,
            motion,
          };
        } else {
          lastCenter = null;
        }

        const criteria = evaluateCriteria(faces.length, metrics);
        const gateOk = criteria.every((c) => !c.gate || c.ok);
        const allOk = criteria.every((c) => c.ok);
        const blinked = metrics ? blink(metrics.ear) : false;

        if (stage === 'challenge' && metrics && gateOk) {
          const neutral = Math.abs(metrics.yaw) < T.yawFront && metrics.happy < 0.5;
          if (!armed && neutral) armed = true;
          if (armed) {
            const key = list[idx].key;
            const hit =
              (key === 'blink' && blinked) ||
              (key === 'turnLeft' && metrics.yaw > T.yawTurn) ||
              (key === 'turnRight' && metrics.yaw < -T.yawTurn) ||
              (key === 'smile' && metrics.happy > T.smile);
            if (hit) {
              list[idx].done = true;
              idx += 1;
              armed = false;
              if (idx >= list.length) stage = 'capture';
            }
          }
        } else if (stage === 'capture' && metrics && allOk && Math.abs(metrics.yaw) < T.yawFront && face.descriptor) {
          descriptors.push(Array.from(face.descriptor));
          if (descriptors.length === Math.ceil(samplesNeeded / 2)) thumbnail = faceThumbnail(video, face.detection.box);
        }

        drawOverlay(overlayRef.current, video, faces, faces.length === 1 && gateOk);

        const passive = criteria.filter((c) => c.ok).length / criteria.length;
        const doneCount = list.filter((c) => c.done).length;
        const parts = {
          criteria: passive * 40,
          challenges: (doneCount / list.length) * 50,
          capture: (Math.min(descriptors.length, samplesNeeded) / samplesNeeded) * 10,
        };
        const score = Math.round(parts.criteria + parts.challenges + parts.capture);
        const elapsed = performance.now() - startedAt;

        const frame = {
          phase: 'running',
          stage,
          criteria,
          challenges: view(idx, stage),
          score,
          parts,
          metrics,
          remaining: Math.max(0, SESSION_MS - elapsed),
          samples: descriptors.length,
          message: instructionFor({ faceCount: faces.length, metrics, criteria, stage, challenge: list[idx], armed }),
        };

        if (descriptors.length >= samplesNeeded) {
          const still = frameStill(video);
          finish({ ...frame, phase: 'passed', score: 100, parts: { criteria: 40, challenges: 50, capture: 10 }, message: 'Liveness confirmed', descriptors: descriptors.slice(), thumbnail, still });
          return;
        }
        if (elapsed > SESSION_MS) {
          const pending = list.find((c) => !c.done);
          finish({
            ...frame,
            phase: 'failed',
            message: pending
              ? `Time ran out before "${pending.label}" was detected.`
              : 'Time ran out before a clear frontal capture.',
          });
          return;
        }
        setState((s) => ({ ...s, ...frame }));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [stop, videoRef, overlayRef, samplesNeeded],
  );

  return { state, start, reset, stop };
}
