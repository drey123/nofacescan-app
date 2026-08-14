import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

async function copyMatching(sourceDir, targetDir, extensions) {
  await mkdir(targetDir, { recursive: true });
  for (const name of await readdir(sourceDir)) {
    if (!extensions.some((ext) => name.endsWith(ext))) continue;
    await copyFile(join(sourceDir, name), join(targetDir, name));
  }
}

await copyMatching(
  join(root, 'node_modules/onnxruntime-web/dist'),
  join(dist, 'onnxruntime'),
  ['.wasm', '.mjs'],
);

await copyMatching(
  join(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
  join(dist, 'mediapipe/wasm'),
  ['.wasm', '.js'],
);

console.log('Bundled ONNX Runtime and MediaPipe WASM assets into dist.');
