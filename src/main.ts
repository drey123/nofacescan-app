import './style.css';
import './DirectionalPad.css';
import './InteractionMenu.css';
import { initInputs } from './Interface/InteractionMenu';
import { initScaling } from './scaling';
import { initThree } from './three/threeLoader';

function initNavigation() {
  const menuButton = document.getElementById('menu-button') as HTMLButtonElement | null;
  const menu = document.getElementById('app-menu') as HTMLDivElement | null;
  const imageUpload = document.getElementById('image-upload') as HTMLInputElement | null;
  const imageUploadMenuItem = document.getElementById('image-upload-menu-item') as HTMLButtonElement | null;
  const threeModelMenuItem = document.getElementById('three-model-menu-item') as HTMLButtonElement | null;
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  const imagePreview = document.getElementById('image-preview') as HTMLImageElement | null;

  if (!menuButton || !menu || !imageUpload || !imageUploadMenuItem || !threeModelMenuItem || !canvas || !imagePreview) return;

  let imageObjectUrl: string | null = null;

  const setMenuOpen = (open: boolean) => {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  };

  const setSource = (source: '3d' | 'image') => {
    const usingImage = source === 'image';
    canvas.hidden = usingImage;
    imagePreview.hidden = !usingImage;
    threeModelMenuItem.hidden = !usingImage;
    imageUploadMenuItem.hidden = usingImage;
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

  imageUpload.addEventListener('change', () => {
    const file = imageUpload.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = URL.createObjectURL(file);
    imagePreview.src = imageObjectUrl;
    setSource('image');
  });

  imagePreview.addEventListener('error', () => {
    setSource('3d');
  });

  document.addEventListener('click', (event) => {
    if (!menu.hidden && !menu.contains(event.target as Node) && event.target !== menuButton) {
      setMenuOpen(false);
    }
  });

  setSource('3d');
}

initNavigation();
initInputs();
initThree();
initScaling();
