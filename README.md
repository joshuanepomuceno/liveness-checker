# Liveness Checker

A lightweight face recognition site with a live liveness meter. Built with React and Vite. Everything runs in the browser and there is no database: enrolled faces are stored in the browser's `localStorage`.

## Modules

- **Add face** (`#enroll`): enter a name, pass the liveness check (blink, then a head circle), and save 5 face samples (128-d descriptors and a thumbnail) to the registry. Warns you if the face already matches someone enrolled.
- **Verify** (`#verify`): pass a liveness check with **2 random challenges** (from blink, head circle and smile), then compare the live face against everyone in the registry. Shows the verdict, the Euclidean distance against the 0.50 limit, and the closest candidates.
- **Registry** (`#registry`): view and remove enrolled people.

## Liveness criteria

The meter scores 0–100 and passes at **80**:

| Part | Points | What is checked |
| --- | --- | --- |
| Passive criteria | 40 | One face in view · face width 20–70% of frame · centre within 18% · mean face luminance 60–215 · Laplacian sharpness ≥ 22 · movement ≤ 0.5 face widths per second |
| Active challenges | 50 | **Blink**: eye openness drops below 84% of your own open eyes and recovers above 92%. Openness combines eye shape (EAR) and eye-area contrast, and a clear drop in either alone counts, so glasses don't hide blinks. After 8 s on the blink step, a button offers a smile (or head circle) instead · **Head circle**: your head's yaw and pitch point in at least 6 of 8 directions, each at least 8° from your resting pose · **Smile**: expression ≥ 0.75 |
| Frontal capture | 10 | Samples taken only while every criterion passes, eyes are open and the head is within 12° yaw and 15° pitch of the resting pose |

Only face count, distance and lighting must pass for a challenge to count. Centring, sharpness and stillness are required for the frontal capture.

The resting pose is learned from the first good frames (yaw up to 25° off-axis), so a camera beside or above the screen, as on most tablets, doesn't count as a turned head. The head circle tracks rotation, not position, so sliding a photo around doesn't pass it. During the blink step an eye-openness bar shows the live reading against the blink line, and during the circle a ring lights up each direction as you reach it. The readouts show eye openness, yaw, pitch and the detection frame rate (FPS).

A session times out after 60 seconds. All thresholds live in `src/lib/liveness.js` (`T`) and the match limit in `src/lib/registry.js` (`MATCH_THRESHOLD`).

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
