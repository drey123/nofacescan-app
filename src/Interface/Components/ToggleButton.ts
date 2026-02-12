
export class ToggleButton {
  parentElement: HTMLDivElement
  value: boolean = false;
  callback: (newValue: boolean) => void;

  constructor(parentID: string, callback: (newValue: boolean) => void) {
    this.callback = callback;
    this.parentElement = (document.getElementById(parentID) ?? (() => {throw new Error("cannot get toggle button parent")})()) as HTMLDivElement;
    this.parentElement.addEventListener("click", event => {
      this.value = !this.value;
      callback(this.value);
      this.updateVisualValue();
    })
    this.updateVisualValue();
  }

  updateVisualValue() {
    this.parentElement.dataset.value = this.value + "";
  }
}