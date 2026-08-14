import * as three from 'three';
import * as ort from 'onnxruntime-web';

const MODEL_URL = `${import.meta.env.BASE_URL}faceverse/faceverse_resnet50_int8.onnx`;
const GEOMETRY_URL = `${import.meta.env.BASE_URL}faceverse/faceverse-lite.bin`;
const WASM_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';

interface GeometryMeta {
  vertexCount: number;
  triangleCount: number;
  identityDims: number;
  expressionDims: number;
  arrays: Record<string, { offset: number; length: number; shape: number[] }>;
}

interface GeometryAsset {
  meta: GeometryMeta;
  mean: Float32Array;
  identity: Float32Array;
  expression: Float32Array;
  triangles: Uint32Array;
}

let readyPromise: Promise<{ session: ort.InferenceSession; geometry: GeometryAsset }> | null = null;

function halfToFloat(value: number): number {
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x3ff;
  if (exponent === 0) return sign * Math.pow(2, -14) * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

function decodeHalf(buffer: ArrayBuffer, offset: number, length: number): Float32Array {
  const view = new DataView(buffer, offset, length);
  const out = new Float32Array(length / 2);
  for (let i = 0; i < out.length; i++) out[i] = halfToFloat(view.getUint16(i * 2, true));
  return out;
}

async function loadGeometry(): Promise<GeometryAsset> {
  const response = await fetch(GEOMETRY_URL);
  if (!response.ok) throw new Error(`Face geometry download failed (${response.status})`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 8));
  if (magic !== 'SCANNYFV') throw new Error('Invalid Scanny FaceVerse geometry asset');
  const headerBytes = view.getUint32(8, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 12, headerBytes))) as GeometryMeta;
  const mean = decodeHalf(buffer, meta.arrays.mean!.offset, meta.arrays.mean!.length);
  const identity = decodeHalf(buffer, meta.arrays.identity!.offset, meta.arrays.identity!.length);
  const expression = decodeHalf(buffer, meta.arrays.expression!.offset, meta.arrays.expression!.length);
  const triBytes = new Uint8Array(buffer, meta.arrays.triangles!.offset, meta.arrays.triangles!.length);
  const triangles = new Uint32Array(triBytes.buffer, triBytes.byteOffset, triBytes.byteLength / 4);
  return { meta, mean, identity, expression, triangles };
}

async function loadRuntime(): Promise<{ session: ort.InferenceSession; geometry: GeometryAsset }> {
  ort.env.wasm.wasmPaths = WASM_URL;
  const geometryPromise = loadGeometry();
  const sessionPromise = ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all'
  });
  const [geometry, session] = await Promise.all([geometryPromise, sessionPromise]);
  return { session, geometry };
}

export function prepareFaceVerseLite(): Promise<void> {
  if (!readyPromise) readyPromise = loadRuntime();
  return readyPromise.then(() => undefined);
}

function makeCrop(image: HTMLImageElement, bbox?: [number, number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const x = bbox?.[0] ?? 0;
  const y = bbox?.[1] ?? 0;
  const w = bbox ? bbox[2] - bbox[0] : image.naturalWidth;
  const h = bbox ? bbox[3] - bbox[1] : image.naturalHeight;
  ctx.drawImage(image, x, y, w, h, 0, 0, 256, 256);
  return canvas;
}

function imageTensor(crop: HTMLCanvasElement): ort.Tensor {
  const ctx = crop.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const pixels = ctx.getImageData(0, 0, 256, 256).data;
  const tensor = new Float32Array(3 * 256 * 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const p = (y * 256 + x) * 4;
      const i = y * 256 + x;
      tensor[i] = pixels[p]! / 255;
      tensor[256 * 256 + i] = pixels[p + 1]! / 255;
      tensor[2 * 256 * 256 + i] = pixels[p + 2]! / 255;
    }
  }
  return new ort.Tensor('float32', tensor, [1, 3, 256, 256]);
}

function buildVertices(asset: GeometryAsset, coeffs: Float32Array): Float32Array {
  const n = asset.meta.vertexCount;
  const idDims = asset.meta.identityDims;
  const expDims = asset.meta.expressionDims;
  const vertices = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const out = v * 3;
    let vx = asset.mean[out] ?? 0;
    let vy = asset.mean[out + 1] ?? 0;
    let vz = asset.mean[out + 2] ?? 0;
    for (let d = 0; d < idDims; d++) {
      const c = coeffs[d] ?? 0;
      const base = v * 3 * idDims + d;
      vx += (asset.identity[base] ?? 0) * c;
      vy += (asset.identity[base + idDims] ?? 0) * c;
      vz += (asset.identity[base + idDims * 2] ?? 0) * c;
    }
    for (let d = 0; d < expDims; d++) {
      const c = coeffs[156 + d] ?? 0;
      const base = v * 3 * expDims + d;
      vx += (asset.expression[base] ?? 0) * c;
      vy += (asset.expression[base + expDims] ?? 0) * c;
      vz += (asset.expression[base + expDims * 2] ?? 0) * c;
    }
    vertices[out] = vx;
    vertices[out + 1] = vy;
    vertices[out + 2] = vz;
  }
  return vertices;
}

function normalizeVertices(vertices: Float32Array): Float32Array {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    minX = Math.min(minX, vertices[i]!); maxX = Math.max(maxX, vertices[i]!);
    minY = Math.min(minY, vertices[i + 1]!); maxY = Math.max(maxY, vertices[i + 1]!);
    minZ = Math.min(minZ, vertices[i + 2]!); maxZ = Math.max(maxZ, vertices[i + 2]!);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const scale = 0.46 / Math.max(maxY - minY, 0.001);
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i] ?? 0;
    const y = vertices[i + 1] ?? 0;
    const z = vertices[i + 2] ?? 0;
    vertices[i] = (x - cx) * scale;
    vertices[i + 1] = (y - cy) * scale - 0.01;
    vertices[i + 2] = (z - cz) * scale + 0.03;
  }
  return vertices;
}

function sampleColors(vertices: Float32Array, crop: HTMLCanvasElement): Float32Array {
  const ctx = crop.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const pixels = ctx.getImageData(0, 0, 256, 256).data;
  const colors = new Float32Array(vertices.length);
  let averageR = 0, averageG = 0, averageB = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    averageR += pixels[i]!; averageG += pixels[i + 1]!; averageB += pixels[i + 2]!;
  }
  const count = pixels.length / 4;
  averageR /= count * 255; averageG /= count * 255; averageB /= count * 255;
  for (let i = 0; i < vertices.length; i += 3) {
    const x = Math.max(0, Math.min(255, Math.round(128 + vertices[i]! * 300)));
    const y = Math.max(0, Math.min(255, Math.round(128 - vertices[i + 1]! * 300)));
    const p = (y * 256 + x) * 4;
    colors[i] = pixels[p] !== undefined ? pixels[p]! / 255 : averageR;
    colors[i + 1] = pixels[p + 1] !== undefined ? pixels[p + 1]! / 255 : averageG;
    colors[i + 2] = pixels[p + 2] !== undefined ? pixels[p + 2]! / 255 : averageB;
  }
  return colors;
}

export interface FaceVerseController {
  mesh: three.Mesh;
  setControls(yaw: number, pitch: number, mouth: number, leftEye: number, rightEye: number): void;
}

export async function createFaceVerseMesh(image: HTMLImageElement, bbox?: [number, number, number, number]): Promise<FaceVerseController> {
  const runtime = await (readyPromise ?? (readyPromise = loadRuntime()));
  const crop = makeCrop(image, bbox);
  const tensor = imageTensor(crop);
  const result = await runtime.session.run({ input: tensor });
  const output = result.output;
  if (!output || !(output.data instanceof Float32Array)) throw new Error('FaceVerse predictor returned no coefficients');
  const baseCoeffs = new Float32Array(output.data);
  const geometry = runtime.geometry;
  const positions = normalizeVertices(buildVertices(geometry, baseCoeffs));
  const colors = sampleColors(positions, crop);
  const positionAttribute = new three.BufferAttribute(positions, 3);
  const colorAttribute = new three.BufferAttribute(colors, 3);
  const index = new three.BufferAttribute(new Uint32Array(geometry.triangles), 1);
  const meshGeometry = new three.BufferGeometry();
  meshGeometry.setAttribute('position', positionAttribute);
  meshGeometry.setAttribute('color', colorAttribute);
  meshGeometry.setIndex(index);
  meshGeometry.computeVertexNormals();
  const material = new three.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, side: three.DoubleSide });
  const mesh = new three.Mesh(meshGeometry, material);
  mesh.position.set(0, 0, 0);

  const update = (yaw: number, pitch: number, mouth: number, leftEye: number, rightEye: number) => {
    const coeffs = new Float32Array(baseCoeffs);
    coeffs[205]! = baseCoeffs[205]! + (mouth - 0.5) * 0.8;
    coeffs[170]! = baseCoeffs[170]! + (leftEye - 0.5) * 0.5;
    coeffs[171]! = baseCoeffs[171]! + (rightEye - 0.5) * 0.5;
    const next = normalizeVertices(buildVertices(geometry, coeffs));
    positionAttribute.array.set(next);
    positionAttribute.needsUpdate = true;
    meshGeometry.computeVertexNormals();
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = 0.5 * yaw;
    mesh.rotation.x = 0.5 * pitch;
  };

  return { mesh, setControls: update };
}
