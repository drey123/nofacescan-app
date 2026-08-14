import { mkdir, readdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const faceDetectorModelUrl = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

async function copyMatching(sourceDir, targetDir, names) {
  await mkdir(targetDir, { recursive: true });
  const allowed = new Set(names);
  for (const name of await readdir(sourceDir)) {
    if (!allowed.has(name)) continue;
    await copyFile(join(sourceDir, name), join(targetDir, name));
  }
}

await copyMatching(
  join(root, 'node_modules/onnxruntime-web/dist'),
  join(dist, 'onnxruntime'),
  [
    'ort-wasm-simd.wasm',
    'ort-wasm-simd.mjs',
    'ort-wasm.wasm',
    'ort-wasm.mjs',
  ],
);

await copyMatching(
  join(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
  join(dist, 'mediapipe/wasm'),
  ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'],
);

const detectorDir = join(dist, 'mediapipe/models');
await mkdir(detectorDir, { recursive: true });
const detectorResponse = await fetch(faceDetectorModelUrl);
if (!detectorResponse.ok) {
  throw new Error(`Face detector model download failed (${detectorResponse.status})`);
}
await writeFile(detectorDir + '/face_detector.tflite', Buffer.from(await detectorResponse.arrayBuffer()));

console.log('Bundled the exact ONNX WASM runtime, MediaPipe WASM runtime, and face detector model into the Pages artifact.');
