#!/usr/bin/env python3
"""Build a browser-sized FaceVerse geometry asset from the upstream model data.

We intentionally keep only the first PCA components needed for the experiment:
- 32 identity coefficients
- 64 expression coefficients (keeps mouth/eye controls available)
- mean shape
- triangle topology

The heavy ResNet50 INT8 predictor is copied separately. Nothing is committed to
Git; CI downloads the upstream MIT-licensed release asset and places only the
runtime files in dist/public.
"""
from pathlib import Path
import json
import struct
import urllib.request
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "faceverse"
CACHE = ROOT / ".cache" / "faceverse"
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

VERSION = "v4.1.0"
BASE = f"https://github.com/Mrkomiljon/faceverse-onnx/releases/download/{VERSION}"
NPY = CACHE / "faceverse_v4_2.npy"
ONNX = CACHE / "faceverse_resnet50_int8.onnx"


def download(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        return
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, path)


def write_array(f, array: np.ndarray) -> tuple[int, int]:
    raw = np.ascontiguousarray(array).tobytes()
    offset = f.tell()
    f.write(raw)
    return offset, len(raw)


def main() -> None:
    download(f"{BASE}/faceverse_v4_2.npy", NPY)
    download(f"{BASE}/faceverse_resnet50_int8.onnx", ONNX)

    fvd = np.load(NPY, allow_pickle=True).item()
    mean = np.asarray(fvd["meanshape"], dtype=np.float16).reshape(-1, 3) / np.float16(100.0)
    identity = np.asarray(fvd["idBase"], dtype=np.float16).reshape(-1, 3, fvd["idBase"].shape[1])[:, :, :32] / np.float16(100.0)
    expression = np.asarray(fvd["exBase"], dtype=np.float16).reshape(-1, 3, fvd["exBase"].shape[1])[:, :, :64] / np.float16(100.0)
    triangles = np.asarray(fvd["tri"], dtype=np.uint32)

    meta = {
        "version": 1,
        "vertexCount": int(mean.shape[0]),
        "triangleCount": int(triangles.shape[0]),
        "identityDims": 32,
        "expressionDims": 64,
        "meanDtype": "f16",
        "basisDtype": "f16",
        "triDtype": "u32",
        "arrays": {}
    }

    out_file = OUT / "faceverse-lite.bin"
    with out_file.open("wb") as f:
        f.write(b"SCANNYFV")
        f.write(struct.pack("<I", 0))
        meta_offset = f.tell()
        f.write(b" " * 4)

        for name, array in (("mean", mean), ("identity", identity), ("expression", expression), ("triangles", triangles)):
            offset, length = write_array(f, array)
            meta["arrays"][name] = {"offset": offset, "length": length, "shape": list(array.shape)}

        header = json.dumps(meta, separators=(",", ":")).encode("utf-8")
        header_start = meta_offset + 4
        f.seek(meta_offset)
        f.write(struct.pack("<I", len(header)))
        f.seek(meta_offset + 4)
        f.write(header)

    out_model = OUT / "faceverse_resnet50_int8.onnx"
    if not out_model.exists() or out_model.stat().st_size != ONNX.stat().st_size:
        out_model.write_bytes(ONNX.read_bytes())

    print(json.dumps({
        "vertices": int(mean.shape[0]),
        "triangles": int(triangles.shape[0]),
        "liteBytes": out_file.stat().st_size,
        "onnxBytes": out_model.stat().st_size,
        "totalBytes": out_file.stat().st_size + out_model.stat().st_size,
    }, indent=2))


if __name__ == "__main__":
    main()
