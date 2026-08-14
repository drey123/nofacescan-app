import * as three from 'three';
import * as ort from 'onnxruntime-web';

const MODEL_URL = `${import.meta.env.BASE_URL}faceverse/faceverse_resnet50_int8.onnx`;
const GEOMETRY_URL = `${import.meta.env.BASE_URL}faceverse/faceverse-lite.bin`;
const WASM_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';

export type FaceBuildProgress = {
  stage: 'download-model' | 'download-geometry' | 'initialize' | 'inference' | 'mesh';
  loaded?: number;
  total?: number;
};

interface GeometryMeta { vertexCount:number; triangleCount:number; identityDims:number; expressionDims:number; arrays:Record<string,{offset:number;length:number;shape:number[]}>; }
interface GeometryAsset { meta:GeometryMeta; mean:Float32Array; identity:Float32Array; expression:Float32Array; triangles:Uint32Array; }
let readyPromise:Promise<{session:ort.InferenceSession;geometry:GeometryAsset}>|null=null;
let readyController:AbortController|null=null;

function halfToFloat(value:number){const sign=(value&0x8000)?-1:1;const exponent=(value>>>10)&0x1f;const fraction=value&0x3ff;if(exponent===0)return sign*Math.pow(2,-14)*(fraction/1024);if(exponent===31)return fraction?NaN:sign*Infinity;return sign*Math.pow(2,exponent-15)*(1+fraction/1024);}
function decodeHalf(buffer:ArrayBuffer,offset:number,length:number){const view=new DataView(buffer,offset,length);const out=new Float32Array(length/2);for(let i=0;i<out.length;i++)out[i]=halfToFloat(view.getUint16(i*2,true));return out;}

async function fetchBytes(url:string,signal:AbortSignal,onProgress:(loaded:number,total:number)=>void){
  const response=await fetch(url,{signal,cache:'force-cache'}); if(!response.ok)throw new Error(`Download failed (${response.status})`);
  const total=Number(response.headers.get('content-length')||0); if(!response.body){const data=new Uint8Array(await response.arrayBuffer());onProgress(data.byteLength,total||data.byteLength);return data;}
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let loaded=0;
  while(true){const {done,value}=await reader.read();if(done)break;if(value){chunks.push(value);loaded+=value.byteLength;onProgress(loaded,total);}}
  const data=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}return data;
}

async function loadGeometry(signal:AbortSignal,onProgress:(loaded:number,total:number)=>void):Promise<GeometryAsset>{
  const data=await fetchBytes(GEOMETRY_URL,signal,onProgress);const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);const view=new DataView(buffer);const magic=new TextDecoder().decode(new Uint8Array(buffer,0,8));if(magic!=='SCANNYFV')throw new Error('Invalid Scanny FaceVerse geometry asset');
  const headerBytes=view.getUint32(8,true);const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,12,headerBytes))) as GeometryMeta;
  const mean=decodeHalf(buffer,meta.arrays.mean!.offset,meta.arrays.mean!.length);const identity=decodeHalf(buffer,meta.arrays.identity!.offset,meta.arrays.identity!.length);const expression=decodeHalf(buffer,meta.arrays.expression!.offset,meta.arrays.expression!.length);const triBytes=new Uint8Array(buffer,meta.arrays.triangles!.offset,meta.arrays.triangles!.length);const triangles=new Uint32Array(triBytes.buffer,triBytes.byteOffset,triBytes.byteLength/4);return{meta,mean,identity,expression,triangles};
}

async function loadRuntime(signal:AbortSignal,onProgress:(progress:FaceBuildProgress)=>void){
  ort.env.wasm.wasmPaths=WASM_URL;
  onProgress({stage:'download-model',loaded:0,total:0});
  const geometryPromise=loadGeometry(signal,(loaded,total)=>onProgress({stage:'download-geometry',loaded,total}));
  const modelPromise=fetchBytes(MODEL_URL,signal,(loaded,total)=>onProgress({stage:'download-model',loaded,total}));
  const [geometry,model]=await Promise.all([geometryPromise,modelPromise]);
  onProgress({stage:'initialize'});
  const session=await ort.InferenceSession.create(model,{executionProviders:['webgpu','wasm'],graphOptimizationLevel:'all'});
  return{session,geometry};
}

export function prepareFaceVerseLite(onProgress?:(progress:FaceBuildProgress)=>void,signal?:AbortSignal){
  if(!readyPromise){readyController=new AbortController();const combinedSignal=signal??readyController.signal;readyPromise=loadRuntime(combinedSignal,onProgress??(()=>{})).catch(error=>{readyPromise=null;readyController=null;throw error;});}
  return readyPromise.then(()=>undefined);
}
export function cancelFaceVersePreparation(){readyController?.abort();readyController=null;readyPromise=null;}

function makeCrop(image:HTMLImageElement,bbox?:[number,number,number,number]){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D context unavailable');const x=bbox?.[0]??0,y=bbox?.[1]??0,w=bbox?bbox[2]-bbox[0]:image.naturalWidth,h=bbox?bbox[3]-bbox[1]:image.naturalHeight;ctx.drawImage(image,x,y,w,h,0,0,256,256);return canvas;}
function imageTensor(crop:HTMLCanvasElement){const ctx=crop.getContext('2d');if(!ctx)throw new Error('Canvas 2D context unavailable');const pixels=ctx.getImageData(0,0,256,256).data;const tensor=new Float32Array(3*256*256);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const p=(y*256+x)*4,i=y*256+x;tensor[i]=pixels[p]!/255;tensor[256*256+i]=pixels[p+1]!/255;tensor[2*256*256+i]=pixels[p+2]!/255;}return new ort.Tensor('float32',tensor,[1,3,256,256]);}
function buildVertices(asset:GeometryAsset,coeffs:Float32Array){const n=asset.meta.vertexCount,idDims=asset.meta.identityDims,expDims=asset.meta.expressionDims,vertices=new Float32Array(n*3);for(let v=0;v<n;v++){const out=v*3;let vx=asset.mean[out]??0,vy=asset.mean[out+1]??0,vz=asset.mean[out+2]??0;for(let d=0;d<idDims;d++){const c=coeffs[d]??0,base=v*3*idDims+d;vx+=(asset.identity[base]??0)*c;vy+=(asset.identity[base+idDims]??0)*c;vz+=(asset.identity[base+idDims*2]??0)*c;}for(let d=0;d<expDims;d++){const c=coeffs[156+d]??0,base=v*3*expDims+d;vx+=(asset.expression[base]??0)*c;vy+=(asset.expression[base+expDims]??0)*c;vz+=(asset.expression[base+expDims*2]??0)*c;}vertices[out]=vx;vertices[out+1]=vy;vertices[out+2]=vz;}return vertices;}
function normalizeVertices(vertices:Float32Array){let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;for(let i=0;i<vertices.length;i+=3){minX=Math.min(minX,vertices[i]!);maxX=Math.max(maxX,vertices[i]!);minY=Math.min(minY,vertices[i+1]!);maxY=Math.max(maxY,vertices[i+1]!);minZ=Math.min(minZ,vertices[i+2]!);maxZ=Math.max(maxZ,vertices[i+2]!);}const cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2,scale=.46/Math.max(maxY-minY,.001);for(let i=0;i<vertices.length;i+=3){vertices[i]=(vertices[i]! - cx)*scale;vertices[i+1]=(vertices[i+1]!-cy)*scale-.01;vertices[i+2]=(vertices[i+2]!-cz)*scale+.03;}return vertices;}
function sampleColors(vertices:Float32Array,crop:HTMLCanvasElement){const ctx=crop.getContext('2d');if(!ctx)throw new Error('Canvas 2D context unavailable');const pixels=ctx.getImageData(0,0,256,256).data,colors=new Float32Array(vertices.length);let averageR=0,averageG=0,averageB=0;for(let i=0;i<pixels.length;i+=4){averageR+=pixels[i]!;averageG+=pixels[i+1]!;averageB+=pixels[i+2]!;}const count=pixels.length/4;averageR/=count*255;averageG/=count*255;averageB/=count*255;for(let i=0;i<vertices.length;i+=3){const x=Math.max(0,Math.min(255,Math.round(128+vertices[i]! *300))),y=Math.max(0,Math.min(255,Math.round(128-vertices[i+1]! *300))),p=(y*256+x)*4;colors[i]=pixels[p]!==undefined?pixels[p]!/255:averageR;colors[i+1]=pixels[p+1]!==undefined?pixels[p+1]!/255:averageG;colors[i+2]=pixels[p+2]!==undefined?pixels[p+2]!/255:averageB;}return colors;}

export interface FaceVerseController{mesh:three.Mesh;setControls(yaw:number,pitch:number,mouth:number,leftEye:number,rightEye:number):void;}
export async function createFaceVerseMesh(image:HTMLImageElement,bbox?:[number,number,number,number],onProgress?:(progress:FaceBuildProgress)=>void,signal?:AbortSignal):Promise<FaceVerseController>{
  const runtime=await prepareFaceVerseLite(onProgress,signal).then(()=>readyPromise!);
  if(signal?.aborted)throw new DOMException('Reconstruction cancelled','AbortError');
  onProgress?.({stage:'inference'});
  const crop=makeCrop(image,bbox),tensor=imageTensor(crop),result=await runtime.session.run({input:tensor});
  if(signal?.aborted)throw new DOMException('Reconstruction cancelled','AbortError');
  const output=result.output;if(!output||!(output.data instanceof Float32Array))throw new Error('FaceVerse predictor returned no coefficients');
  const baseCoeffs=new Float32Array(output.data),geometry=runtime.geometry;onProgress?.({stage:'mesh'});const positions=normalizeVertices(buildVertices(geometry,baseCoeffs)),colors=sampleColors(positions,crop);const positionAttribute=new three.BufferAttribute(positions,3),colorAttribute=new three.BufferAttribute(colors,3),index=new three.BufferAttribute(new Uint32Array(geometry.triangles),1),meshGeometry=new three.BufferGeometry();meshGeometry.setAttribute('position',positionAttribute);meshGeometry.setAttribute('color',colorAttribute);meshGeometry.setIndex(index);meshGeometry.computeVertexNormals();const material=new three.MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:0,side:three.DoubleSide}),mesh=new three.Mesh(meshGeometry,material);mesh.position.set(0,0,0);
  const update=(yaw:number,pitch:number,mouth:number,leftEye:number,rightEye:number)=>{const coeffs=new Float32Array(baseCoeffs);coeffs[205]=baseCoeffs[205]!+(mouth-.5)*.8;coeffs[170]=baseCoeffs[170]!+(leftEye-.5)*.5;coeffs[171]=baseCoeffs[171]!+(rightEye-.5)*.5;const next=normalizeVertices(buildVertices(geometry,coeffs));positionAttribute.array.set(next);positionAttribute.needsUpdate=true;meshGeometry.computeVertexNormals();mesh.rotation.order='YXZ';mesh.rotation.y=.5*yaw;mesh.rotation.x=.5*pitch;};
  return{mesh,setControls:update};
}
