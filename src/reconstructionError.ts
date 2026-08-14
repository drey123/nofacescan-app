const status = document.getElementById('reconstruction-status');
const stage = document.getElementById('reconstruction-stage');
const detail = document.getElementById('reconstruction-detail');
const doneButton = document.getElementById('image-done-button') as HTMLButtonElement | null;

if (status && stage && detail && doneButton) {
  let lastError = '';
  let actions: HTMLDivElement | null = null;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    }
  };

  const showActions = () => {
    if (actions) return;
    actions = document.createElement('div');
    actions.className = 'reconstruction-error-actions';

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'reconstruction-error-button reconstruction-error-retry';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => {
      actions?.remove();
      actions = null;
      status.hidden = true;
      doneButton.click();
    });

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'reconstruction-error-button reconstruction-error-copy';
    copy.textContent = 'Copy error';
    copy.addEventListener('click', async () => {
      const ok = await copyText(lastError);
      copy.textContent = ok ? 'Copied' : 'Copy failed';
      window.setTimeout(() => { copy.textContent = 'Copy error'; }, 1400);
    });

    actions.append(retry, copy);
    const card = status.querySelector('.reconstruction-card');
    card?.appendChild(actions);
  };

  const observer = new MutationObserver(() => {
    if (stage.textContent !== 'Reconstruction failed') return;
    lastError = detail.textContent?.trim() || 'Reconstruction failed';
    showActions();
    status.hidden = false;
  });

  observer.observe(stage, { childList: true, characterData: true, subtree: true });
}
