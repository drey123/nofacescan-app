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

  if (!menuButton || !menu || !imageUpload || !imageUploadMenuItem) return;

  const setMenuOpen = (open: boolean) => {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  };

  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenuOpen(menu.hidden);
  });

  imageUploadMenuItem.addEventListener('click', () => {
    setMenuOpen(false);
    imageUpload.click();
  });

  document.addEventListener('click', (event) => {
    if (!menu.hidden && !menu.contains(event.target as Node) && event.target !== menuButton) {
      setMenuOpen(false);
    }
  });
}

initNavigation();
initInputs();
initThree();
initScaling();
