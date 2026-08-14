#!/usr/bin/env python3
"""Build a browser-sized FaceVerse geometry asset from the upstream model data.

The browser only needs a small prefix of the identity/expression bases, but it
must still know where those coefficients live in FaceVerse's full 621-value
output vector. Keeping that layout metadata avoids hard-coded offsets in the
browser implementation.
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
HEADER_BYTES = 4096
IDENTITY_LITE_DIMS = 32
EXPRESSION_LITE_DIMS = 64


def download(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        return
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, path)


def main() -> None:
    download(f"{BASE}/faceverse_v4_2.npy", NPY)
    download(f"{BASE}/faceverse_resnet50_int8.onnx", ONNX)

    fvd = np.load(NPY, allow_pickle=True).item()

    full_id_dims = int(fvd["idBase"].shape[1])
    full_exp_dims = int(fvd["exBase"].shape[1])
    full_tex_dims = int(fvd["texBase"].shape[1])
    if IDENTITY_LITE_DIMS > full_id_dims or EXPRESSION_LITE_DIMS > full_exp_dims:
        raise RuntimeError("Lite dimensions exceed upstream FaceVerse dimensions")

    mean = np.asarray(fvd["meanshape"], dtype=np.float16).reshape(-1, 3) / np.float16(100.0)
    identity = (
        np.asarray(fvd["idBase"], dtype=np.float16)
        .reshape(-1, 3, full_id_dims)[:, :, :IDENTITY_LITE_DIMS]
        / np.float16(100.0)
    )
    expression = (
        np.asarray(fvd["exBase"], dtype=np.float16)
        .reshape(-1, 3, full_exp_dims)[:, :, :EXPRESSION_LITE_DIMS]
        / np.float16(100.0)
    )
    triangles = np.asarray(fvd["tri"], dtype=np.uint32)
    ver_inds = np.asarray(fvd["ver_inds"], dtype=np.uint32).reshape(-1)

    meta = {
        "version": 2,
        "vertexCount": int(mean.shape[0]),
        "triangleCount": int(triangles.shape[0]),
        "identityDims": IDENTITY_LITE_DIMS,
        "expressionDims": EXPRESSION_LITE_DIMS,
        "fullIdentityDims": full_id_dims,
        "fullExpressionDims": full_exp_dims,
        "fullTextureDims": full_tex_dims,
        "coefficientCount": full_id_dims + full_exp_dims + full_tex_dims + 37,
        "verInds": [int(x) for x in ver_inds],
        "headerBytes": HEADER_BYTES,
        "arrays": {},
    }

    out_file = OUT / "faceverse-lite.bin"
    with out_file.open("wb") as f:
        f.write(b"SCANNYFV")
        f.write(struct.pack("<I", HEADER_BYTES))
        f.write(b" " * HEADER_BYTES)

        for name, array in (
            ("mean", mean),
            ("identity", identity),
            ("expression", expression),
            ("triangles", triangles),
        ):
            raw = np.ascontiguousarray(array).tobytes()
            offset = f.tell()
            f.write(raw)
            meta["arrays"][name] = {
                "offset": offset,
                "length": len(raw),
                "shape": list(array.shape),
            }

        header = json.dumps(meta, separators=(",", ":")).encode("utf-8")
        if len(header) > HEADER_BYTES:
            raise RuntimeError(f"metadata header is too large: {len(header)} bytes")
        f.seek(12)
        f.write(header)
        f.write(b" " * (HEADER_BYTES - len(header)))

    out_model = OUT / "faceverse_resnet50_int8.onnx"
    if not out_model.exists() or out_model.stat().st_size != ONNX.stat().st_size:
        out_model.write_bytes(ONNX.read_bytes())

    print(json.dumps({
        "vertices": int(mean.shape[0]),
        "triangles": int(triangles.shape[0]),
        "fullIdentityDims": full_id_dims,
        "fullExpressionDims": full_exp_dims,
        "fullTextureDims": full_tex_dims,
        "liteBytes": out_file.stat().st_size,
        "onnxBytes": out_model.stat().st_size,
        "totalBytes": out_file.stat().st_size + out_model.stat().st_size,
    }, indent=2))


if __name__ == "__main__":
    main()
