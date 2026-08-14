# Scanny — LAM Reconstruction Experiment

## Purpose

Isolate the hardest technical question before changing the production Scanny UI:

> Can a constrained, front-facing portrait be converted into an animatable 3D-aware representation that preserves the source person's appearance closely enough for Scanny's existing controls?

This is an experiment only. It does not replace the current image mode.

## Research basis

LAM (Large Avatar Model) reconstructs an animatable Gaussian head from a single image. Its published architecture generates canonical Gaussian attributes from image features queried by FLAME canonical points, then animates them with linear blend skinning and corrective blendshapes. The official project also provides a WebGL renderer for generated LAM assets.

Research links:
- https://github.com/aigc3d/LAM
- https://github.com/aigc3d/LAM_WebRender
- https://arxiv.org/abs/2502.17796

## Experiment scope

Phase 1 deliberately does **not** attempt browser inference of the LAM neural model.

It establishes the contract between Scanny and a future reconstruction backend:

1. Accept a Scanny-ready frontal portrait.
2. Normalize it to the same canonical face frame used by the existing 3D mode.
3. Represent reconstruction output as an animatable Gaussian asset.
4. Render that asset in a browser with the existing WebGL stack.
5. Drive yaw/pitch/expression using a small Scanny motion interface.

The neural reconstruction step is represented by an explicit asset boundary rather than fake client-side reconstruction. This prevents us from pretending a placeholder is a working AI model.

## Scanny-ready input contract

Recommended input:
- one person
- front-facing head
- head upright
- both eyes visible
- neutral or mild expression
- no heavy occlusion
- sufficient resolution
- shoulders reasonably square
- face centered and occupying a useful portion of the frame

Later, Scanny can detect violations and generate an AI-image prompt instead of silently accepting poor inputs.

## Success criteria

A future generated asset should:

- remain recognizably the source person;
- produce plausible side information when yaw changes;
- preserve fine facial appearance better than a flat image warp;
- remain stable during small pitch/yaw changes;
- render interactively in the browser;
- map cleanly onto Scanny's existing controls.

## Failure criteria

Reject the approach if the generated representation:

- looks like a generic avatar rather than the source person;
- collapses or distorts around cheeks/nose/eyes;
- requires excessive server latency for basic interaction;
- cannot be rendered reliably on target browsers/devices;
- requires controls fundamentally incompatible with Scanny.

## Important architectural rule

Do not put LAM/PyTorch/model files into the production browser bundle yet. The reconstruction model is a separate research boundary. The browser should consume a generated avatar asset only after we prove that the representation and renderer are good enough.
