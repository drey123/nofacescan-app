# Reconstruction error UX

## Intent
Keep reconstruction failures visible and actionable without disturbing the existing Scanny visual design.

## Required behavior
- A reconstruction error stays visible until the user explicitly dismisses it or retries.
- The error card includes a compact `Copy error` action.
- Copy uses the Clipboard API when available and falls back gracefully.
- Retry is a real action that starts a fresh reconstruction/runtime initialization rather than merely clearing the message.
- The error card must not auto-dismiss on a timer.
- The existing image, controls, and original GLB remain intact after failure/cancel.

## Runtime loading
Anything required for deterministic startup should be bundled/self-hosted where practical, especially ONNX Runtime WASM binaries. This avoids an extra third-party CDN dependency and makes failures easier to diagnose. Bundling does not automatically make a payload smaller or faster: it can increase the initial JS download. The right target is lazy-loading the reconstruction runtime only after `Done`, with compression and caching enabled by Pages/CDN.

## Speed experiment order
1. Lazy-load reconstruction code after `Done`.
2. Self-host/pin WASM assets.
3. Measure actual WASM/WebGPU initialization time on iOS and Android.
4. Use WebGPU when available and a clean WASM fallback.
5. Compress/cache model assets; do not duplicate them in the main JS bundle.
6. Reduce geometry/model size only after correctness is established.
