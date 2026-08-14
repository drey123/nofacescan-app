import './style.css';
import './DirectionalPad.css';
import './InteractionMenu.css';
import { initInputs } from './Interface/InteractionMenu';
import { initScaling } from './scaling';
import { initThree } from './three/threeLoader';

type ImageTransform = { x: number; y: number; scale: number };

function initNavigation() {
  const menuButton = document.getElementById('menu-button') as HTMLButtonElement | null;
  const menu = document.getElementById('app-menu') as HTMLDivElement | null;
  const imageUpload = document.getElementById('image-upload') as HTMLInputElement | null;
  const imageUploadMenuItem = document.getElementById('image-upload-menu-item') as HTMLButtonElement | null;
  const threeModelMenuItem = document.getElementById('three-model-menu-item') as HTMLButtonElement | null;
  const adjustImageMenuItem = document.getElementById('adjust-image-menu-item') as HTMLButtonElement | null;
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  const imagePreview = document.getElementById('image-preview') as HTMLImageElement | null;
  const imageEditor = document.getElementById('image-editor') as HTMLDivElement | null;
  const imageZoom = document.getElementById('image-zoom') as HTMLInputElement | null;
  const imageResetButton = document.getElementById('image-reset-button') as HTMLButtonElement | null;
  const imageDoneButton = document.getElementById('image-done-button') as HTMLButtonElement | null;
  const imageEditorFrame = document.getElementById('image-editor-frame') as HTMLDivElement | null;

  if (!menuButton || !menu || !imageUpload || !imageUploadMenuItem || !threeModelMenuItem || !adjustImageMenuItem || !canvas || !imagePreview || !imageEditor || !imageZoom || !imageResetButton || !imageDoneButton || !imageEditorFrame) return;

  let imageObjectUrl: string | null = null;
  let transform: ImageTransform = { x: 0, y: 0, scale: 1 };
  let dragStart: { pointerId: number; x: number; y: number; startX: number; startY: number } | null = null;

  const setMenuOpen = (open: boolean) => {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  };

  const applyImageTransform = () => {
    imagePreview.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
    imageZoom.value = String(transform.scale);
  };

  const resetImageTransform = () => {
    transform = { x: 0, y: 0, scale: 1 };
    applyImageTransform();
  };

  const setSource = (source: '3d' | 'image') => {
    const usingImage = source === 'image';
    canvas.hidden = usingImage;
    imagePreview.hidden = !usingImage;
    threeModelMenuItem.hidden = !usingImage;
    adjustImageMenuItem.hidden = !usingImage;
    imageUploadMenuItem.hidden = usingImage;
  };

  const setEditorOpen = (open: boolean) => {
    imageEditor.hidden = !open;
    if (open) {
      setMenuOpen(false);
      applyImageTransform();
    }
  };

  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenuOpen(menu.hidden);
  });

  imageUploadMenuItem.addEventListener('click', () => {
    setMenuOpen(false);
    imageUpload.click();
  });

  threeModelMenuItem.addEventListener('click', () => {
    setSource('3d');
    setMenuOpen(false);
  });

  adjustImageMenuItem.addEventListener('click', () => setEditorOpen(true));

  imageUpload.addEventListener('change', () => {
    const file = imageUpload.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = URL.createObjectURL(file);
    imagePreview.src = imageObjectUrl;
    resetImageTransform();
    setSource('image');
    requestAnimationFrame(() => setEditorOpen(true));
  });

  imagePreview.addEventListener('error', () => {
    setEditorOpen(false);
    setSource('3d');
  });

  imageZoom.addEventListener('input', () => {
    transform.scale = Number(imageZoom.value);
    applyImageTransform();
  });

  imageResetButton.addEventListener('click', resetImageTransform);
  imageDoneButton.addEventListener('click', () => setEditorOpen(false));

  imageEditorFrame.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    imageEditorFrame.setPointerCapture(event.pointerId);
    dragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: transform.x, startY: transform.y };
  });

  imageEditorFrame.addEventListener('pointermove', (event) => {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
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
initScaling();
