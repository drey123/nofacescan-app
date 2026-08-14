import * as three from "three";
import { directionalPad, leftEyeSlider, mouthSlider, rightEyeSlider } from "../Interface/InteractionMenu";
import { GLTFLoader } from "three/examples/jsm/Addons.js";

export let scene: three.Scene|null = null;
export let camera: three.PerspectiveCamera|null = null;
export let renderer: three.WebGLRenderer|null = null;
export let canvasHolder: HTMLDivElement|null = null;
export let canvas: HTMLCanvasElement|null = null;
export let cube: three.Mesh|null = null;
export let faceMesh: three.Mesh|null = null;
export let neckBone: three.Bone|null = null;
export let headBone: three.Bone|null = null;
export let leftEyeBone: three.Bone|null = null;
export let rightEyeBone: three.Bone|null = null;

let modelRoot: three.Object3D|null = null;
let imageFace: three.Mesh|null = null;
let imageFaceTexture: three.Texture|null = null;

export function initThree() {
  scene = new three.Scene();
  camera = new three.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, -0.01, 0.5);

  canvasHolder = (document.getElementById("canvas-holder") ?? (() => { throw new Error("cannot get canvas holder"); })()) as HTMLDivElement;
  canvas = (document.getElementById("canvas") ?? (() => { throw new Error("cannot get canvas"); })()) as HTMLCanvasElement;
  renderer = new three.WebGLRenderer({ antialias: true, canvas, alpha: true });
  renderer.setClearColor(0x000000, 0);

  const resizeObserver = new ResizeObserver(() => resizeCanvas(true));
  resizeObserver.observe(canvasHolder);

  loadScene();
  resizeCanvas();
}

export function resizeCanvas(doRender = true) {
  if (camera == null || canvasHolder == null || renderer == null || scene == null) return;
  const width = canvasHolder.clientWidth;
  const height = canvasHolder.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  if (doRender) renderFrame();
}

export function loadScene() {
  if (camera == null || canvasHolder == null || renderer == null || scene == null) {
    throw new Error("cannot load scene without loaded values");
  }

  const light1 = new three.DirectionalLight(0xffffff, 2);
  light1.position.set(2, 2, 3);
  scene.add(light1);
  const light2 = new three.DirectionalLight(0xffffff, 1);
  light2.position.set(-1, 3, 0);
  scene.add(light2);
  const light3 = new three.DirectionalLight(0xffffff, 0.5);
  light3.position.set(-1, 0, 3);
  scene.add(light3);

  cube = new three.Mesh(new three.BoxGeometry(), new three.MeshStandardMaterial({ color: 0xff0000 }));

  const loader = new GLTFLoader();
  const modelUrl = `${import.meta.env.BASE_URL}assets/model.glb`;
  loader.load(modelUrl, (gltf) => {
    modelRoot = gltf.scene;
    scene!.add(gltf.scene);
    gltf.scene.traverse(obj => {
      if ((obj as any).isMesh) {
        const asMesh = obj as three.Mesh;
        if (!asMesh.morphTargetDictionary) return;
        faceMesh = asMesh;
      } else if ((obj as any).isBone) {
        const asBone = obj as three.Bone;
        if (obj.name === "mixamorig_Neck") neckBone = asBone;
        if (obj.name === "mixamorig_Head") headBone = asBone;
        if (obj.name === "mixamorig_LeftEye") leftEyeBone = asBone;
        if (obj.name === "mixamorig_RightEye") rightEyeBone = asBone;
        if (obj.name === "mixamorig_LeftArm") asBone.rotateX(1);
        if (obj.name === "mixamorig_RightArm") asBone.rotateX(1);
      }
    });
    updateModel();
  });
}

export function setImageFace(image: HTMLImageElement) {
  if (!scene || !camera || !renderer || !canvasHolder || !image.complete || image.naturalWidth === 0) return false;

  if (modelRoot) modelRoot.visible = false;
  if (imageFace) scene.remove(imageFace);
  imageFaceTexture?.dispose();

  imageFaceTexture = new three.Texture(image);
  imageFaceTexture.needsUpdate = true;
  imageFaceTexture.colorSpace = three.SRGBColorSpace;

  const aspect = image.naturalWidth / image.naturalHeight;
  const height = 0.46;
  const width = height * aspect;
  const geometry = new three.PlaneGeometry(width, height, 64, 64);
  const positions = geometry.attributes.position as three.BufferAttribute;
  const uvs = geometry.attributes.uv as three.BufferAttribute;

  for (let i = 0; i < positions.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const dome = Math.max(0, 1 - Math.min(1, radius)) ** 2;
    positions.setZ(i, dome * 0.075);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  imageFace = new three.Mesh(geometry, new three.MeshStandardMaterial({
    map: imageFaceTexture,
    transparent: false,
    roughness: 0.92,
    metalness: 0
  }));
  imageFace.position.set(0, -0.01, 0.03);
  scene.add(imageFace);
  updateModel();
  return true;
}

export function clearImageFace() {
  if (!scene) return;
  if (imageFace) {
    scene.remove(imageFace);
    imageFace.geometry.dispose();
    if (imageFace.material instanceof three.Material) imageFace.material.dispose();
    imageFace = null;
  }
  imageFaceTexture?.dispose();
  imageFaceTexture = null;
  if (modelRoot) modelRoot.visible = true;
  renderFrame();
}

function renderFrame() {
  if (camera == null || canvasHolder == null || renderer == null || scene == null) return;
  renderer.render(scene, camera);
}

export function updateModel(doRender = true) {
  if (camera == null || canvasHolder == null || renderer == null || scene == null) return;

  if (faceMesh) {
    const blinkLeftIndex = faceMesh.morphTargetDictionary?.["Blink_Left"];
    if (blinkLeftIndex !== undefined && faceMesh.morphTargetInfluences != null) {
      faceMesh.morphTargetInfluences[blinkLeftIndex] = (rightEyeSlider?.value ?? 0) - 0.5 * Math.max(-1, Math.min(1, 2 * (directionalPad?.pitch ?? 0))) * (1 - (rightEyeSlider?.value ?? 0));
    }
    const blinkRightIndex = faceMesh.morphTargetDictionary?.["Blink_Right"];
    if (blinkRightIndex !== undefined && faceMesh.morphTargetInfluences != null) {
      faceMesh.morphTargetInfluences[blinkRightIndex] = (leftEyeSlider?.value ?? 0) - 0.5 * Math.max(-1, Math.min(1, 2 * (directionalPad?.pitch ?? 0))) * (1 - (leftEyeSlider?.value ?? 0));
    }
    const browRightIndex = faceMesh.morphTargetDictionary?.["BrowsUp_Right"];
    if (browRightIndex !== undefined && faceMesh.morphTargetInfluences != null) {
      faceMesh.morphTargetInfluences[browRightIndex] = Math.max(0, Math.min(1, 2 * (directionalPad?.pitch ?? 0)));
    }
    const browLeftIndex = faceMesh.morphTargetDictionary?.["BrowsUp_Left"];
    if (browLeftIndex !== undefined && faceMesh.morphTargetInfluences != null) {
      faceMesh.morphTargetInfluences[browLeftIndex] = Math.max(0, Math.min(1, 2 * (directionalPad?.pitch ?? 0)));
    }
    const mouthIndex = faceMesh.morphTargetDictionary?.["MouthOpen"];
    if (mouthIndex !== undefined && faceMesh.morphTargetInfluences != null) {
      faceMesh.morphTargetInfluences[mouthIndex] = mouthSlider?.value ?? 0;
    }
  }

  if (headBone) {
    headBone.rotation.order = "YXZ";
    headBone.rotation.x = 0.5 * (directionalPad?.pitch ?? 0);
    headBone.rotation.y = 0.5 * (directionalPad?.yaw ?? 0);
  }
  if (neckBone) {
    neckBone.rotation.order = "YXZ";
    neckBone.rotation.x = 0.5 * (directionalPad?.pitch ?? 0);
    neckBone.rotation.y = 0.5 * (directionalPad?.yaw ?? 0);
  }
  if (leftEyeBone) {
    leftEyeBone.rotation.order = "YXZ";
    leftEyeBone.rotation.x = -0.5 * (directionalPad?.pitch ?? 0);
    leftEyeBone.rotation.y = -0.5 * (directionalPad?.yaw ?? 0);
  }
  if (rightEyeBone) {
    rightEyeBone.rotation.order = "YXZ";
    rightEyeBone.rotation.x = -0.5 * (directionalPad?.pitch ?? 0);
    rightEyeBone.rotation.y = -0.5 * (directionalPad?.yaw ?? 0);
  }

  if (imageFace) {
    imageFace.rotation.order = "YXZ";
    imageFace.rotation.x = 0.5 * (directionalPad?.pitch ?? 0);
    imageFace.rotation.y = 0.5 * (directionalPad?.yaw ?? 0);
    const zoom = 1 + 0.35 * Math.max(-1, Math.min(1, directionalPad?.pitch ?? 0));
    imageFace.scale.setScalar(zoom);
  }

  if (doRender) renderFrame();
}
