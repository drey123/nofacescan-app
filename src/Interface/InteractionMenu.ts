import { updateModel } from "../three/threeLoader";
import { DirectionalPad } from "./Components/DirectionalPad";
import { Slider } from "./Components/Slider";
import { ToggleButton } from "./Components/ToggleButton";

export let interactionMenu: HTMLDivElement|null = null;
export let slidersEl: HTMLDivElement|null = null;
export let leftEyeSlider: Slider|null = null;
export let rightEyeSlider: Slider|null = null;
export let mouthSlider: Slider|null = null;
export let eyeSliderSplitButton: ToggleButton|null = null;
export let directionalPad: DirectionalPad|null = null;

export function initInputs() {
  interactionMenu = (document.getElementById("interaction-menu") ?? (() => {throw new Error("cannot get interactionMenu")})()) as HTMLDivElement;
  slidersEl = (interactionMenu.querySelector(".sliders") ?? (() => {throw new Error("cannot get sliders el")})()) as HTMLDivElement;
  leftEyeSlider = new Slider("left-eye-slider", value => {
    if (!eyeSliderSplitButton?.value) rightEyeSlider!.setValue(value);
    updateModel()
  })
  rightEyeSlider = new Slider("right-eye-slider", value => {
    if (!eyeSliderSplitButton?.value) leftEyeSlider!.setValue(value);
    updateModel()
  })
  mouthSlider = new Slider("mouth-slider", () => {
    updateModel();
  });
  eyeSliderSplitButton = new ToggleButton("eye-slider-split-button", (newValue) => {
    slidersEl!.dataset.isSplit = newValue + "";
    if (!newValue) {
      const eyeValue = (leftEyeSlider!.value + rightEyeSlider!.value) * 0.5
      leftEyeSlider!.setValue(eyeValue);
      rightEyeSlider!.setValue(eyeValue);
      updateModel();
    }
  });
  directionalPad = new DirectionalPad("directional-pad", () => {
    updateModel();
  })
}