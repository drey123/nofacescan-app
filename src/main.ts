import './style.css';
import './DirectionalPad.css';
import './InteractionMenu.css';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { initInputs } from './Interface/InteractionMenu';
import { initScaling } from './scaling';
import { initThree } from './three/threeLoader';

type ImageTransform = { x: number; y: number; scale: number };
type FaceSource = '3d' | 'image';
type EditorSnapshot = { source: FaceSource; transform: ImageTransform };

const FACE_DETECTOR_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const FACE_DETECTOR_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

let faceDetectorPromise: Promise<FaceDetector> | null = null;

async function getFaceDetector() {
  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(FACE_DETECTOR_WASM);
      return FaceDetector.createFromModelPath(vision, FACE_DETECTOR_MODEL);
    })();
  }
  return faceDetectorPromise;
}

function initNavigation() {
  const navbar = document.getElementById('navbar') as HTMLDivElement | null;
  const menuButton = document.getElementById('menu-button') as HTMLButtonElement | null;
  const menu = document.getElementById('app-menu') as HTMLDivElement | null;
  const imageUpload = document.getElementById('image-upload') as HTMLInputElement | null;
  const imageUploadMenuItem = document.getElementById('image-upload-menu-item') as HTMLButtonElement | null;
  const threeModelMenuItem = document.getElementById('three-model-menu-item') as HTMLButtonElement | null;
  const adjustImageMenuItem = document.getElementById('adjust-image-menu-item') as HTMLButtonElement | null;
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  const imageBackground = document.getElementById('image-background') as HTMLImageElement | null;
  const imagePreview = document.getElementById('image-preview') as HTMLImageElement | null;
  const imageEditor = document.getElementById('image-editor') as HTMLDivElement | null;
  const interactionMenu = document.getElementById('interaction-menu') as HTMLDivElement | null;
  const imageZoom = document.getElementById('image-zoom') as HTMLInputElement | null;
  const imageResetButton = document.getElementById('image-reset-button') as HTMLButtonElement | null;
  const imageDoneButton = document.getElementById('image-done-button') as HTMLButtonElement | null;
  const imageEditorFrame = document.getElementById('image-editor-frame') as HTMLDivElement | null;
  const imageEditorHint = document.getElementById('image-editor-hint') as HTMLDivElement | null;

  if (!navbar || !menuButton || !menu || !imageUpload || !imageUploadMenuItem || !threeModelMenuItem || !adjustImageMenuItem || !canvas || !imageBackground || !imagePreview || !imageEditor || !interactionMenu || !imageZoom || !imageResetButton || !imageDoneButton || !imageEditorFrame || !imageEditorHint) return;

  let imageObjectUrl: string | null = null;
  let activeSource: FaceSource = '3d';
  let transform: ImageTransform = { x: 0, y: 0, scale: 1 };
  let dragStart: { pointerId: number; x: number; y: number; startX: number; startY: number } | null = null;
  let editorSnapshot: EditorSnapshot | null = null;
  let editorResetTransform: ImageTransform = { x: 0, y: 0, scale: 1 };

  const setMenuOpen = (open: boolean) => {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  };

  const copyTransform = (value: ImageTransform): ImageTransform => ({ ...value });

  const updateModeUI = () => {
    const usingImage = activeSource === 'image';
    canvas.style.visibility = usingImage ? 'hidden' : 'visible';
    imageBackground.hidden = !usingImage;
    imagePreview.hidden = !usingImage;
    imageUploadMenuItem.hidden = usingImage;
    threeModelMenuItem.hidden = !usingImage;
    adjustImageMenuItem.hidden = !usingImage;
  };

  const setSource = (source: FaceSource) => {
    activeSource = source;
    updateModeUI();
  };

  const applyImageTransform = () => {
    imagePreview.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
    imageZoom.value = String(transform.scale);
  };

  const resetImageTransform = () => {
    transform = copyTransform(editorResetTransform);
    applyImageTransform();
  };

  const setEditorOpen = (open: boolean, snapshot?: EditorSnapshot) => {
    if (open) {
      editorSnapshot = snapshot ?? { source: activeSource, transform: copyTransform(transform) };
      editorResetTransform = copyTransform(transform);
      setMenuOpen(false);
      interactionMenu.hidden = true;
      interactionMenu.setAttribute('aria-hidden', 'true');
      navbar.classList.add('editor-active');
      menuButton.setAttribute('aria-label', 'Cancel image adjustment');
      menuButton.setAttribute('aria-expanded', 'false');
      imageEditor.hidden = false;
      applyImageTransform();
      return;
    }

    imageEditor.hidden = true;
    interactionMenu.hidden = false;
    interactionMenu.removeAttribute('aria-hidden');
    navbar.classList.remove('editor-active');
    menuButton.setAttribute('aria-label', 'Open menu');
    menuButton.setAttribute('aria-expanded', 'false');
    editorSnapshot = null;
    dragStart = null;
  };

  const cancelEditor = () => {
    if (!editorSnapshot) {
      setEditorOpen(false);
      return;
    }
    transform = copyTransform(editorSnapshot.transform);
    setSource(editorSnapshot.source);
    applyImageTransform();
    setEditorOpen(false);
  };

  const autoFitToFace = async () => {
    try {
      await imagePreview.decode();
      const detector = await getFaceDetector();
      const detections = detector.detect(imagePreview).detections;
      if (!detections.length) {
        imageEditorHint.textContent = 'No face detected — position it manually';
        return;
      }
      const detection = [...detections].sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))[0];
      if (!detection) {
        imageEditorHint.textContent = 'No face detected — position it manually';
        return;
      }
      const box = detection.boundingBox;
      if (!box) {
        imageEditorHint.textContent = 'Face location unavailable — position it manually';
        return;
      }
      const width = imagePreview.clientWidth;
      const height = imagePreview.clientHeight;
      const naturalWidth = imagePreview.naturalWidth;
      const naturalHeight = imagePreview.naturalHeight;
      const coverScale = Math.max(width / naturalWidth, height / naturalHeight);
      const renderedWidth = naturalWidth * coverScale;
      const renderedHeight = naturalHeight * coverScale;
      const baseLeft = (width - renderedWidth) / 2;
      const baseTop = (height - renderedHeight) / 2;
      const faceX = baseLeft + (box.originX + box.width / 2) * coverScale;
      const faceY = baseTop + (box.originY + box.height / 2) * coverScale;
      const faceHeight = box.height * coverScale;
      const targetFaceHeight = Math.min(height * 0.38, width * 0.68);
      const targetX = width / 2;
      const targetY = height * 0.40;
      const scale = Math.min(2.5, Math.max(0.65, targetFaceHeight / faceHeight));
      transform.scale = scale;
      transform.x = targetX - (width / 2 + (faceX - width / 2) * scale);
      transform.y = targetY - (height / 2 + (faceY - height / 2) * scale);
      editorResetTransform = copyTransform(transform);
      applyImageTransform();
      imageEditorHint.textContent = 'Face fitted — drag or zoom to fine-tune';
    } catch {
      imageEditorHint.textContent = 'Auto-fit unavailable — position it manually';
    }
  };

  menuButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!imageEditor.hidden) {
      cancelEditor();
      return;
    }
    setMenuOpen(menu.hidden);
  });

  menu.addEventListener('click', (event) => event.stopPropagation());

  imageUploadMenuItem.addEventListener('click', (event) => {
    event.preventDefault();
    setMenuOpen(false);
    imageUpload.click();
  });

  threeModelMenuItem.addEventListener('click', (event) => {
    event.preventDefault();
    setSource('3d');
    setMenuOpen(false);
  });

  adjustImageMenuItem.addEventListener('click', (event) => {
    event.preventDefault();
    setEditorOpen(true);
  });

  imageUpload.addEventListener('change', () => {
    const file = imageUpload.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const previousState: EditorSnapshot = { source: activeSource, transform: copyTransform(transform) };
    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = URL.createObjectURL(file);
    imagePreview.src = imageObjectUrl;
    imageBackground.src = imageObjectUrl;
    transform = { x: 0, y: 0, scale: 1 };
    setSource('image');
    imageEditorHint.textContent = 'Finding face…';
    requestAnimationFrame(() => {
      setEditorOpen(true, previousState);
      void autoFitToFace();
    });
  });

  imagePreview.addEventListener('error', () => {
    cancelEditor();
  });

  imageZoom.addEventListener('input', () => {
    transform.scale = Number(imageZoom.value);
    applyImageTransform();
  });

  imageResetButton.addEventListener('click', (event) => {
    event.preventDefault();
    resetImageTransform();
  });

  imageDoneButton.addEventListener('click', (event) => {
    event.preventDefault();
    setEditorOpen(false);
  });

  imageEditorFrame.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    imageEditorFrame.setPointerCapture(event.pointerId);
    dragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: transform.x, startY: transform.y };
  });

  imageEditorFrame.addEventListener('pointermove', (event) => {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    event.preventDefault();
    transform.x = dragStart.startX + event.clientX - dragStart.x;
    transform.y = dragStart.startY + event.clientY - dragStart.y;
    applyImageTransform();
  });

  const endDrag = (event: PointerEvent) => {
    if (dragStart?.pointerId === event.pointerId) dragStart = null;
  };
  imageEditorFrame.addEventListener('pointerup', endDrag);
  imageEditorFrame.addEventListener('pointercancel', endDrag);

  document.addEventListener('click', (event) => {
    if (!menu.hidden && !menu.contains(event.target as Node) && event.target !== menuButton) setMenuOpen(false);
  });

  setSource('3d');
  resetImageTransform();
}

initNavigation();
initInputs();
initThree();