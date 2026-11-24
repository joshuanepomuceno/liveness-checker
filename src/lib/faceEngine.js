import * as faceapi from '@vladmandic/face-api';

let loadPromise = null;

/** Loads the four small networks once. Weights are served from /models. */
export function loadModels() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const webgl = await faceapi.tf.setBackend('webgl').catch(() => false);
      if (!webgl) await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      const url = `${import.meta.env.BASE_URL}models`;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
        faceapi.nets.faceExpressionNet.loadFromUri(url),
      ]);
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 });

/**
 * Detects every face in the frame with landmarks and expressions.
 * The 128-d descriptor is only computed when asked, since it is the costly step.
 */
export function detectFaces(input, withDescriptor = false) {
  const chain = faceapi.detectAllFaces(input, detectorOptions).withFaceLandmarks().withFaceExpressions();
  return withDescriptor ? chain.withFaceDescriptors() : chain;
}
