const status = document.getElementById('reconstruction-status');
const stage = document.getElementById('reconstruction-stage');
const detail = document.getElementById('reconstruction-detail');
const actions = document.getElementById('reconstruction-error-actions');
const retry = document.getElementById('reconstruction-retry') as HTMLButtonElement | null;
const copy = document.getElementById('reconstruction-copy') as HTMLButtonElement | null;
const done = document.getElementById('image-done-button') as HTMLButtonElement | null;
const navbar = document.getElementById('navbar');

if (status && stage && detail && actions && retry && copy && done && navbar) {
  let lastError = '';
  let retrying = false;

  const isFailure = () => stage.textContent?.trim() === 'Reconstruction failed';

  const keepFailureVisible = () => {
    if (!isFailure() || retrying) return;
    lastError = detail.textContent?.trim() || 'The 3D face could not be built.';
    status.hidden = false;
    actions.hidden = false;
    navbar.classList.add('reconstruction-active');
    const menuButton = document.getElementById('menu-button');
    menuButton?.setAttribute('aria-label', 'Dismiss reconstruction error');
  };

  const observer = new MutationObserver(() => {
    if (isFailure()) {
      keepFailureVisible();
    } else if (!retrying) {
      actions.hidden = true;
      navbar.classList.remove('reconstruction-active');
    }
  });

  observer.observe(stage, { childList: true, characterData: true, subtree: true });
  observer.observe(status, { attributes: true, attributeFilter: ['hidden'] });

  retry.addEventListener('click', () => {
    retrying = true;
    actions.hidden = true;
    status.hidden = true;
    navbar.classList.remove('reconstruction-active');
    done.click();
    window.setTimeout(() => { retrying = false; }, 0);
  });

  copy.addEventListener('click', async () => {
    const text = `Scanny reconstruction failed\n${lastError}`;
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
    copy.dataset.copied = 'true';
    window.setTimeout(() => { delete copy.dataset.copied; }, 1200);
  });
}
