import './style.css';
import './DirectionalPad.css';
import './InteractionMenu.css';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { initInputs } from './Interface/InteractionMenu';
import { initScaling } from './scaling';
import { clearImageFace, initThree, setImageFace } from './three/threeLoader';
import type { FaceBuildProgress } from './faceverse/FaceVerseLite';

type ImageTransform = { x: number; y: number; scale: number };
type FaceSource = '3d' | 'image';
type EditorSnapshot = { source: FaceSource; transform: ImageTransform };
type FaceBox = [number, number, number, number];

type DragState = {
  pointerId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
};

const FACE_DETECTOR_MODEL = `${import.meta.env.BASE_URL}mediapipe/models/face_detector.tflite`;
const FACE_DETECTOR_WASM = `${import.meta.env.BASE_URL}mediapipe/wasm`;
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
  const imageDoneButton = document.getElementById('image-done-button') as HTMLButtonElement | null;
  const imageEditorFrame = document.getElementById('image-editor-frame') as HTMLDivElement | null;
  const imageEditorHint = document.getElementById('image-editor-hint') as HTMLDivElement | null;
  const reconstructionStatus = document.getElementById('reconstruction-status') as HTMLDivElement | null;
  const reconstructionStage = document.getElementById('reconstruction-stage') as HTMLDivElement | null;
  const reconstructionDetail = document.getElementById('reconstruction-detail') as HTMLDivElement | null;
  const reconstructionProgress = document.getElementById('reconstruction-progress-bar') as HTMLDivElement | null;
  const reconstructionMetric = document.getElementById('reconstruction-metric') as HTMLDivElement | null;
  const reconstructionActions = document.getElementById('reconstruction-error-actions') as HTMLDivElement | null;
  const reconstructionRetry = document.getElementById('reconstruction-retry') as HTMLButtonElement | null;
  const reconstructionCopy = document.getElementById('reconstruction-copy') as HTMLButtonElement | null;

  if (
    !navbar || !menuButton || !menu || !imageUpload || !imageUploadMenuItem ||
    !threeModelMenuItem || !adjustImageMenuItem || !canvas || !imageBackground ||
    !imagePreview || !imageEditor || !interactionMenu || !imageZoom ||
    !imageDoneButton || !imageEditorFrame || !imageEditorHint ||
    !reconstructionStatus || !reconstructionStage || !reconstructionDetail ||
    !reconstructionProgress || !reconstructionMetric || !reconstructionActions ||
    !reconstructionRetry || !reconstructionCopy
  ) return;

  let imageObjectUrl: string | null = null;
  let activeSource: FaceSource = '3d';
  let imageRendered = false;
  let transform: ImageTransform = { x: 0, y: 0, scale: 1 };
  let dragStart: DragState | null = null;
  let editorSnapshot: EditorSnapshot | null = null;
  let editorResetTransform: ImageTransform = { x: 0, y: 0, scale: 1 };
  let detectedFaceBox: FaceBox | null = null;
  let reconstructionController: AbortController | null = null;
  let reconstructionStartedAt = 0;
  let downloadModel = { loaded: 0, total: 0 };
  let downloadGeometry = { loaded: 0, total: 0 };
  let lastReconstructionError = '';

  const copyTransform = (value: ImageTransform): ImageTransform => ({ ...value });
  const setMenuOpen = (open: boolean) => {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  };

  const updateModeUI = () => {
    const usingImage = activeSource === 'image';
    const showRenderedImage = usingImage && imageRendered;

    canvas.style.visibility = showRenderedImage || !usingImage ? 'visible' : 'hidden';
    imageBackground.hidden = !usingImage || imageRendered;
    imagePreview.hidden = !usingImage || imageRendered;
    imageUploadMenuItem.hidden = usingImage;
    threeModelMenuItem.hidden = !usingImage;
    adjustImageMenuItem.hidden = !usingImage || !imageRendered || !imageEditor.hidden || !reconstructionStatus.hidden;
  };

  const setSource = (source: FaceSource) => {
    activeSource = source;
    if (source === '3d') {
      imageRendered = false;
      clearImageFace();
    }
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
        detectedFaceBox = null;
        imageEditorHint.textContent = 'No face detected — position it manually';
        return;
      }

      const detection = [...detections].sort(
        (a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0),
      )[0];
      const box = detection?.boundingBox;
      if (!box) {
        detectedFaceBox = null;
        imageEditorHint.textContent = 'Face location unavailable — position it manually';
        return;
      }

      detectedFaceBox = [box.originX, box.originY, box.originX + box.width, box.originY + box.height];

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
      detectedFaceBox = null;
      imageEditorHint.textContent = 'Auto-fit unavailable — position it manually';
    }
  };

  const formatBytes = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  const updateReconstructionProgress = (progress: FaceBuildProgress) => {
    const elapsed = Math.max((performance.now() - reconstructionStartedAt) / 1000, 0.1);

    if (progress.stage === 'download-model') {
      downloadModel = {
        loaded: progress.loaded ?? downloadModel.loaded,
        total: progress.total ?? downloadModel.total,
      };
    }
    if (progress.stage === 'download-geometry') {
      downloadGeometry = {
        loaded: progress.loaded ?? downloadGeometry.loaded,
        total: progress.total ?? downloadGeometry.total,
      };
    }

    const loaded = downloadModel.loaded + downloadGeometry.loaded;
    const total = downloadModel.total + downloadGeometry.total;

    if (progress.stage === 'download-model' || progress.stage === 'download-geometry') {
      reconstructionStage.textContent = 'Downloading 3D reconstruction';
      reconstructionDetail.textContent = progress.stage === 'download-model' ? 'Reconstruction model' : '3D face geometry';
      reconstructionMetric.textContent = total > 0
        ? `${formatBytes(loaded)} / ${formatBytes(total)} · ${(loaded / elapsed / 1024 / 1024).toFixed(1)} MB/s`
        : `${formatBytes(loaded)} downloaded`;
      reconstructionProgress.style.width = total > 0 ? `${Math.min(100, loaded / total * 100)}%` : '28%';
      return;
    }

    if (progress.stage === 'initialize') {
      reconstructionStage.textContent = 'Initializing 3D engine';
      reconstructionDetail.textContent = 'Preparing the browser inference runtime';
      reconstructionMetric.textContent = 'Almost ready';
      reconstructionProgress.style.width = '76%';
      return;
    }

    if (progress.stage === 'inference') {
      reconstructionStage.textContent = 'Reconstructing your face';
      reconstructionDetail.textContent = 'Fitting identity and facial geometry';
      reconstructionMetric.textContent = 'Running locally on this device';
      reconstructionProgress.style.width = '88%';
      return;
    }

    reconstructionStage.textContent = 'Building 3D model';
    reconstructionDetail.textContent = 'Creating the mesh and preparing controls';
    reconstructionMetric.textContent = 'Finalizing';
    reconstructionProgress.style.width = '96%';
  };

  const showReconstruction = () => {
    reconstructionStartedAt = performance.now();
    downloadModel = { loaded: 0, total: 0 };
    downloadGeometry = { loaded: 0, total: 0 };
    lastReconstructionError = '';
    reconstructionActions.hidden = true;
    reconstructionProgress.style.width = '0%';
    reconstructionStage.textContent = 'Preparing 3D face';
    reconstructionDetail.textContent = 'Starting reconstruction…';
    reconstructionMetric.textContent = 'First run may take longer';
    reconstructionStatus.hidden = false;
    navbar.classList.add('reconstruction-active');
    menuButton.setAttribute('aria-label', 'Cancel reconstruction');
    menuButton.setAttribute('aria-expanded', 'false');
    interactionMenu.hidden = true;
    imageEditor.hidden = true;
  };

  const finishReconstruction = () => {
    reconstructionActions.hidden = true;
    reconstructionStatus.hidden = true;
    navbar.classList.remove('reconstruction-active');
    menuButton.setAttribute('aria-label', 'Open menu');
    interactionMenu.hidden = false;
  };

  const cancelReconstruction = () => {
    reconstructionController?.abort();
    reconstructionController = null;
    reconstructionActions.hidden = true;
    reconstructionStatus.hidden = true;
    navbar.classList.remove('reconstruction-active');
    imageRendered = false;
    imageEditor.hidden = false;
    interactionMenu.hidden = true;
    imageEditorHint.textContent = 'Reconstruction cancelled — adjust and try again';
    menuButton.setAttribute('aria-label', 'Cancel image adjustment');
    imageDoneButton.disabled = false;
  };

  const copyError = async () => {
    const text = `Scanny reconstruction failed\n${lastReconstructionError}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.focus();
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    reconstructionCopy.dataset.copied = 'true';
    window.setTimeout(() => delete reconstructionCopy.dataset.copied, 1200);
  };

  const startReconstruction = async () => {
    if (imageDoneButton.disabled || reconstructionController) return;

    imageDoneButton.disabled = true;
    showReconstruction();

    const controller = new AbortController();
    reconstructionController = controller;

    try {
      const built = await setImageFace(
        imagePreview,
        detectedFaceBox ?? undefined,
        updateReconstructionProgress,
        controller.signal,
      );
      if (!built) throw new Error('The 3D renderer is not ready');

      imageRendered = true;
      reconstructionProgress.style.width = '100%';
      reconstructionStage.textContent = '3D face ready';
      reconstructionDetail.textContent = 'Your face is now a real interactive mesh';
      reconstructionMetric.textContent = 'Ready';
      await new Promise(resolve => setTimeout(resolve, 350));
      if (!controller.signal.aborted) {
        finishReconstruction();
        updateModeUI();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;

      console.error(error);
      lastReconstructionError = error instanceof Error ? error.message : 'The 3D face could not be built';
      reconstructionStage.textContent = 'Reconstruction failed';
      reconstructionDetail.textContent = lastReconstructionError;
      reconstructionMetric.textContent = 'Try again';
      reconstructionProgress.style.width = '0%';
      reconstructionActions.hidden = false;
      reconstructionStatus.hidden = false;
      navbar.classList.add('reconstruction-active');
      menuButton.setAttribute('aria-label', 'Cancel reconstruction');
      imageEditor.hidden = true;
      interactionMenu.hidden = true;
    } finally {
      if (reconstructionController === controller) {
        reconstructionController = null;
        imageDoneButton.disabled = false;
      }
    }
  };

  menuButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!imageEditor.hidden && reconstructionStatus.hidden) {
      cancelEditor();
      return;
    }
    if (!reconstructionStatus.hidden) {
      cancelReconstruction();
      return;
    }
    setMenuOpen(menu.hidden);
  });

  menu.addEventListener('click', event => event.stopPropagation());

  imageUploadMenuItem.addEventListener('click', event => {
    event.preventDefault();
    setMenuOpen(false);
    imageUpload.click();
  });

  threeModelMenuItem.addEventListener('click', event => {
    event.preventDefault();
    setSource('3d');
    setMenuOpen(false);
  });

  adjustImageMenuItem.addEventListener('click', event => {
    event.preventDefault();
    setEditorOpen(true);
  });

  imageUpload.addEventListener('change', () => {
    const file = imageUpload.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const previousState: EditorSnapshot = {
      source: activeSource,
      transform: copyTransform(transform),
    };

    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = URL.createObjectURL(file);
    imagePreview.src = imageObjectUrl;
    imageBackground.src = imageObjectUrl;
    transform = { x: 0, y: 0, scale: 1 };
    detectedFaceBox = null;
    imageRendered = false;
    setSource('image');
    imageEditorHint.textContent = 'Finding face…';

    requestAnimationFrame(() => {
      setEditorOpen(true, previousState);
      void autoFitToFace();
    });
  });

  imagePreview.addEventListener('error', cancelEditor);
  imageZoom.addEventListener('input', () => {
    transform.scale = Number(imageZoom.value);
    applyImageTransform();
  });

  imageDoneButton.addEventListener('click', event => {
    event.preventDefault();
    void startReconstruction();
  });

  reconstructionRetry.addEventListener('click', event => {
    event.preventDefault();
    if (imageDoneButton.disabled) return;
    void startReconstruction();
  });

  reconstructionCopy.addEventListener('click', event => {
    event.preventDefault();
    void copyError();
  });

  imageEditorFrame.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    imageEditorFrame.setPointerCapture(event.pointerId);
    dragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: transform.x,
      startY: transform.y,
    };
  });

  imageEditorFrame.addEventListener('pointermove', event => {
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

  document.addEventListener('click', event => {
    if (!menu.hidden && !menu.contains(event.target as Node) && event.target !== menuButton) {
      setMenuOpen(false);
    }
  });

  setSource('3d');
  resetImageTransform();
}

initNavigation();
initInputs();
initScaling();
initThree();
