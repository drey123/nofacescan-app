import { updateModel } from "../three/threeLoader";

export type ImageFaceState = {
  sourceUrl: string;
  mouth: number;
  leftEye: number;
  rightEye: number;
  pitch: number;
  yaw: number;
};

let state: ImageFaceState | null = null;

export function isImageFaceActive(): boolean {
  return state !== null;
}

export function loadImageFace(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (state?.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
      state = {
        sourceUrl,
        mouth: 0,
        leftEye: 0.5,
        rightEye: 0.5,
        pitch: 0,
        yaw: 0,
      };
      resolve();
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("The selected image could not be loaded."));
    };
    image.src = sourceUrl;
  });
}

export function clearImageFace(): void {
  if (state?.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state = null;
}

export function getImageFaceState(): ImageFaceState | null {
  return state;
}

export function setImageFaceControls(values: Partial<Omit<ImageFaceState, "sourceUrl">>): void {
  if (!state) return;
  state = { ...state, ...values };
  // Keep the same control update path as the 3D implementation.
  updateModel();
}
