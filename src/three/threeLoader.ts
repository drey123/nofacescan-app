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

export function initThree() {
  scene = new three.Scene();
  camera = new three.PerspectiveCamera(
    60, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    1000
  );
  camera.position.set(0, -0.01, 0.5);

  canvasHolder = (document.getElementById("canvas-holder") ?? (() => {throw new Error("cannot get canvas holder")})()) as HTMLDivElement;
  canvas = (document.getElementById("canvas") ?? (() => {throw new Error("cannot get canvas")})()) as HTMLCanvasElement;
  renderer = new three.WebGLRenderer({
    antialias: true,
    canvas: canvas,
    alpha: true
  });
  renderer.setClearColor(0x000000, 0);

  const resizeObserver = new ResizeObserver(() => resizeCanvas(true));
  resizeObserver.observe(canvasHolder);

  
  loadScene();

  resizeCanvas(); // renders
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
  if (camera == null || canvasHolder == null || renderer == null || scene == null) throw new Error("cannot load scene without loaded values");
  
  //scene.background = new three.Color(0xaaaaaa);
  //scene.backgroundIntensity = 0;

  const light1 = new three.DirectionalLight(0xffffff, 2);
  light1.position.set(2, 2, 3);
  scene.add(light1);
  const light2 = new three.DirectionalLight(0xffffff, 1);
  light2.position.set(-1, 3, 0);
  scene.add(light2);
  const light3 = new three.DirectionalLight(0xffffff, 0.5);
  light3.position.set(-1, 0, 3);
  scene.add(light3);

  cube = new three.Mesh(
    new three.BoxGeometry(),
    new three.MeshStandardMaterial({ color: 0xff0000 })
  );
  //scene.add(cube);

  const loader = new GLTFLoader();
  loader.load("/assets/model.glb", (gltf) => {
    scene!.add(gltf.scene);
    gltf.scene.traverse(obj => {
      if ((obj as any).isMesh) {
        const asMesh = obj as three.Mesh;
        if (!asMesh.morphTargetDictionary) return;
        faceMesh = asMesh;
      } else if ((obj as any).isBone) {
        const asBone = obj as three.Bone;
        if (obj.name == "mixamorig_Neck") neckBone = asBone;
        if (obj.name == "mixamorig_Head") headBone = asBone;
        if (obj.name == "mixamorig_LeftEye") leftEyeBone = asBone;
        if (obj.name == "mixamorig_RightEye") rightEyeBone = asBone;
        if (obj.name == "mixamorig_RightEye") rightEyeBone = asBone;
        if (obj.name == "mixamorig_RightEye") rightEyeBone = asBone;
        if (obj.name == "mixamorig_LeftArm") asBone.rotateX(1);
        if (obj.name == "mixamorig_RightArm") asBone.rotateX(1);
        console.log(obj);
      }
    });
    updateModel();
  });
};

function renderFrame() {
  if (camera == null || canvasHolder == null || renderer == null || scene == null) return;

  const quat = new three.Quaternion();
  const euler = new three.Euler(directionalPad?.pitch ?? 0, directionalPad?.yaw ?? 0, 0, "YXZ");
  faceMesh?.quaternion.copy(quat);
  renderer.render(scene, camera);
}

export function updateModel(doRender = true) {
  if (camera == null || canvasHolder == null || renderer == null || scene == null) return;
  
  if (faceMesh) {
    const blinkLeftIndex = faceMesh.morphTargetDictionary?.["Blink_Left"];
    if (blinkLeftIndex !== undefined && faceMesh.morphTargetInfluences != null) faceMesh.morphTargetInfluences[blinkLeftIndex] = (rightEyeSlider?.value ?? 0) - 0.5 * Math.max(-1, Math.min(1, 2 * (directionalPad?.pitch ?? 0))) * (1 - (rightEyeSlider?.value ?? 0));
    const blinkRightIndex = faceMesh.morphTargetDictionary?.["Blink_Right"];
    if (blinkRightIndex !== undefined && faceMesh.morphTargetInfluences != null) faceMesh.morphTargetInfluences[blinkRightIndex] = (leftEyeSlider?.value ?? 0) - 0.5 * Math.max(-1, Math.min(1, 2 * (directionalPad?.pitch ?? 0))) * (1 - (leftEyeSlider?.value ?? 0));
    const browRightIndex = faceMesh.morphTargetDictionary?.["BrowsUp_Right"];
    if (browRightIndex !== undefined && faceMesh.morphTargetInfluences != null) faceMesh.morphTargetInfluences[browRightIndex] = Math.max(0, Math.min(1, 2 * (directionalPad?.pitch ?? 0)));
    const browLeftIndex = faceMesh.morphTargetDictionary?.["BrowsUp_Left"];
    if (browLeftIndex !== undefined && faceMesh.morphTargetInfluences != null) faceMesh.morphTargetInfluences[browLeftIndex] = Math.max(0, Math.min(1, 2 * (directionalPad?.pitch ?? 0)));
    const mouthIndex = faceMesh.morphTargetDictionary?.["MouthOpen"];
    if (mouthIndex !== undefined && faceMesh.morphTargetInfluences != null) faceMesh.morphTargetInfluences[mouthIndex] = mouthSlider?.value ?? 0;
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
  if (doRender) renderFrame();
};