
export class Slider {
  parentEl: HTMLDivElement;
  inputEl: HTMLInputElement;
  callback: (value: number) => void;
  value: number = 0;

  constructor (parentID: string, callback: (value: number) => void) {
    this.callback = callback;
    this.parentEl = (document.getElementById(parentID) ?? (() => {throw new Error("cannot get slider parent")})()) as HTMLDivElement;
    this.inputEl = (this.parentEl.querySelector("input") ?? (() => {throw new Error("cannot get slider input")})()) as HTMLInputElement;
    this.inputEl.addEventListener("input", event => {
      this.value = parseFloat(this.inputEl.value);
      this.parentEl.style.setProperty("--value", this.value.toString());
      this.callback(this.value);
    })
    this.updateVisualState();
  }

  updateVisualState() {
    this.parentEl.style.setProperty("--value", this.value.toString());
    this.inputEl.value = this.value.toString();
  }
  setValue(newValue: number) {
    this.value = newValue;
    this.updateVisualState();
  }
}