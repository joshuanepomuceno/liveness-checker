# Liveness Checker

A lightweight face recognition site with a live liveness meter. Built with React and Vite. Everything runs in the browser and there is no database: enrolled faces are stored in the browser's `localStorage`.

## Modules

- **Add face** (`#enroll`): enter a name, pass the liveness check, and save 6 face samples (128-d descriptors and a thumbnail) to the registry. Warns you if the face already matches someone enrolled.
- **Verify** (`#verify`): pass a liveness check with **2 random challenges**, then compare the live face against everyone in the registry. Shows the verdict, the Euclidean distance against the 0.50 limit, and the closest candidates.
- **Registry** (`#registry`): view and remove enrolled people.

## Liveness criteria

The meter scores 0–100 and passes at **80**:

| Part | Points | What is checked |
| --- | --- | --- |
| Passive criteria | 40 | One face in view · face width 20–70% of frame · centre within 18% · mean face luminance 60–215 · Laplacian sharpness ≥ 22 · movement ≤ 3.5% of face width per frame |
| Active challenges | 50 | Blink (eye aspect ratio drops below 72% of the open-eye baseline, then recovers) · turn left / right (estimated yaw ≥ 18°) · smile (expression ≥ 0.75). You must face the camera before each challenge counts. |
| Frontal capture | 10 | Samples taken only while every criterion passes and yaw is within 10° |

A session times out after 45 seconds. All thresholds live in `src/lib/liveness.js` (`T`) and the match limit in `src/lib/registry.js` (`MATCH_THRESHOLD`).

## Run it

```bash
npm install      # also copies model weights into public/models
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

The camera needs `https` or `localhost`.

## Stack

- React 18 + Vite 6
- [`@vladmandic/face-api`](https://github.com/vladmandic/face-api) (TensorFlow.js) with the Tiny Face Detector, 68-point landmarks, expression and recognition models. Weights (~7 MB) are served from `public/models`. The engine is loaded only when a scan starts.

## Limitations

This is a heuristic, client-side liveness check. Blinking and head turns stop printed photos and still images, but a determined attacker with a replayed video or a 3D mask could still pass. For production, move matching to a server, store descriptors encrypted, and add a trained anti-spoofing model.

## Project layout

```
src/
  lib/faceEngine.js          model loading + detection
  lib/liveness.js            thresholds, EAR, yaw, image quality, instructions
  lib/useLivenessSession.js  camera loop: criteria → challenges → capture
  lib/registry.js            localStorage registry + matching
  components/                CameraStage, LivenessMeter, Checklists
  pages/                     EnrollPage, VerifyPage, RegistryPage
```
