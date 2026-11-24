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
| Active challenges | 50 | Blink (eye aspect ratio drops below 80% of your learned open-eye level, then recovers to 90%) · turn left / right (≥ 18° from your resting pose) · smile (expression ≥ 0.75). Turns start from your resting pose and smiles from a relaxed face. |
| Frontal capture | 10 | Samples taken only while every criterion passes, eyes are open and the head is within 10° of the resting pose |

The resting pose is learned from the first good frames (up to 25° off-axis), so a camera mounted beside the screen, as on most tablets, doesn't count as a turned head. During the blink challenge an eye-openness bar shows the live reading against the blink line, and the readouts include the detection frame rate (FPS).

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
