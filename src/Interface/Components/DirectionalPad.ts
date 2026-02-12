
export class DirectionalPad {
  parentEl: HTMLDivElement;
  verticalLineEl: HTMLDivElement;
  horizontalLineEl: HTMLDivElement;
  currentPress: {
    touchID: number|null;
    initialMouseX: number;
    initialMouseY: number;
    initialYaw: number;
    initialPitch: number;
  } | null = null;

  yaw: number = 0;
  pitch: number = 0;
  sensitivity = 0.75 * Math.PI / 2;
  maxRotation = 0.75 * Math.PI / 2;

  callback: (yaw: number, pitch: number) => void;

  constructor(parentID: string, callback: (yaw: number, pitch: number) => void) {
    this.callback = callback;
    this.parentEl = (document.getElementById(parentID) ?? (() => {throw new Error("cannot get directional pad parent")})()) as HTMLDivElement;
    this.verticalLineEl = (this.parentEl.querySelector(".vertical-line") ?? (() => {throw new Error("cannot get vertical line")})()) as HTMLDivElement;
    this.horizontalLineEl = (this.parentEl.querySelector(".horizontal-line") ?? (() => {throw new Error("cannot get horizontal line")})()) as HTMLDivElement;

    const getRelativeEventPos = (x: number, y: number, element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return {
        x: ((x - rect.left) / rect.width - 0.5) * 2,
        y: ((y - rect.top) / rect.height - 0.5) * 2
      }
    }

    this.parentEl.addEventListener("mousedown", event => {
      event.stopPropagation();
      event.preventDefault();
      const pos = getRelativeEventPos(event.clientX, event.clientY, this.parentEl);
      this.currentPress = {
        initialMouseX: pos.x,
        initialMouseY: pos.y,
        initialYaw: this.yaw,
        initialPitch: this.pitch, 
        touchID: null,
      };
    })
    this.parentEl.addEventListener("touchstart", event => {
      event.stopPropagation();
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (touch == null) return;
      const pos = getRelativeEventPos(touch.clientX, touch.clientY, this.parentEl);
      this.currentPress = {
        initialMouseX: pos.x,
        initialMouseY: pos.y,
        initialYaw: this.yaw,
        initialPitch: this.pitch, 
        touchID: touch.identifier,
      };
    })
    window.addEventListener("mouseleave", event => { this.currentPress = null; })
    window.addEventListener("mouseup", event => { this.currentPress = null; });
    window.addEventListener("touchend", event => {
      const touch = event.changedTouches[0];
      if (touch == null) return;
      if (this.currentPress == null) return;
      if (this.currentPress.touchID != touch.identifier) return;
      this.currentPress = null;
    });
    window.addEventListener("touchcancel", event => {
      const touch = event.changedTouches[0];
      if (touch == null) return;
      if (this.currentPress == null) return;
      if (this.currentPress.touchID != touch.identifier) return;
      this.currentPress = null;
    });
    window.addEventListener("mousemove", event => {
      if (this.currentPress == null) return;
      event.stopPropagation();
      event.preventDefault();
      const pos = getRelativeEventPos(event.clientX, event.clientY, this.parentEl);
      this.yaw = (pos.x - this.currentPress.initialMouseX) * this.sensitivity + this.currentPress.initialYaw;
      this.pitch = (pos.y - this.currentPress.initialMouseY) * this.sensitivity + this.currentPress.initialPitch;
      const length = Math.hypot(this.yaw, this.pitch) / this.maxRotation;
      if (length > 1) {
        this.yaw /= length;
        this.pitch /= length;
      }
      this.callback(this.yaw, this.pitch);
      this.updateVisualState();
    })
    window.addEventListener("touchmove", event => {
      const touch = event.changedTouches[0];
      if (touch == null) return;
      if (this.currentPress == null) return;
      if (this.currentPress.touchID != touch.identifier) return;
      event.stopPropagation();
      event.preventDefault();
      const pos = getRelativeEventPos(touch.clientX, touch.clientY, this.parentEl);
      this.yaw = (pos.x - this.currentPress.initialMouseX) * this.sensitivity + this.currentPress.initialYaw;
      this.pitch = (pos.y - this.currentPress.initialMouseY) * this.sensitivity + this.currentPress.initialPitch;
      const length = Math.hypot(this.yaw, this.pitch) / this.maxRotation;
      if (length > 1) {
        this.yaw /= length;
        this.pitch /= length;
      }
      this.callback(this.yaw, this.pitch);
      this.updateVisualState();
    });

    this.updateVisualState();
  }

  updateVisualState() {
    this.parentEl.style.setProperty("--x-value", this.yaw.toString());
    this.parentEl.style.setProperty("--y-value", this.pitch.toString());
    this.verticalLineEl.dataset.direction = (this.yaw > 0 ? 1 : -1).toString(); // + 0 gets rid of -0;
    this.horizontalLineEl.dataset.direction = (this.pitch > 0 ? 1 : -1).toString(); // + 0 gets rid of -0;
    this.verticalLineEl.style.setProperty("--width", Math.abs(Math.sin(this.yaw)).toString());
    this.horizontalLineEl.style.setProperty("--height", Math.abs(Math.sin(this.pitch)).toString());
    this.horizontalLineEl.style.setProperty("--angle", (this.yaw * this.pitch / Math.PI / 0.5).toString() + "rad");
  }

  setValue(newX: number, newY: number) {
    this.yaw = newX;
    this.pitch = newY;
    const length = Math.hypot(this.yaw, this.pitch);
    if (length > 1) {
      this.yaw /= length;
      this.pitch /= length;
    }
    this.updateVisualState();
  }
}