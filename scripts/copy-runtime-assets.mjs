import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises';
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

async function patchJs(dir) {
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      await patchJs(path);
      continue;
    }
    if (!/\.(js|mjs)$/.test(name.name)) continue;
    let text = await readFile(path, 'utf8');
    const before = text;
    text = text.replace(
      /['"]https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.23\.2\/dist\/['"]/g,
      "new URL('../onnxruntime/', import.meta.url).href",
    );
    text = text.replace(
      /['"]https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@0\.10\.35\/wasm['"]/g,
      "new URL('../mediapipe/wasm/', import.meta.url).href",
    );
    if (text !== before) await writeFile(path, text);
  }
}

await patchJs(dist);
console.log('Bundled ONNX Runtime + MediaPipe WASM assets and rewired the production bundle to use them locally.');
