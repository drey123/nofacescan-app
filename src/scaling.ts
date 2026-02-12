function updateScaling() {
  const vh = window.innerHeight * 0.01;
  const vw = window.innerWidth * 0.01;
  document.documentElement.style.setProperty('--fixed-vh', `${vh}px`);
  document.documentElement.style.setProperty('--fixed-vw', `${vw}px`);
  document.documentElement.style.setProperty('--fixed-vd', `${Math.hypot(vw, vh)}px`);
}


export function initScaling() {
  window.addEventListener("resize", () => {
    updateScaling();
  });
  updateScaling();
}
