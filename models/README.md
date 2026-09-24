# 3D models

LiveAcquarium supports local **GLB/GLTF** assets through `config.json`.

## Directory

Put model files in:

```text
models/
├── fish/
├── crustaceans/
└── environment/
```

Then set an entity's `model.path`, for example:

```json
"model": {
  "path": "models/fish/shark.glb",
  "position": [0, 0, 0],
  "rotation": [0, 3.14159, 0],
  "scale": [1, 1, 1],
  "animation": "Swim"
}
```

If `path` is `null` or the file cannot be loaded, the procedural `fallback_model` is used automatically.

Animated GLB files are supported. If `animation` is `null`, the first animation clip is played.

## Recommended free sources

- **Poly Pizza / Quaternius** — useful for low-poly aquatic creatures. The Animated Fish Bundle includes sharks, fish and whales in GLB and is CC0.
- **Poly Pizza / Kenney** — individual fish models are available in GLTF and are CC0.
- **Sketchfab** — very large selection, but the license must be checked for every individual model. Prefer CC0 or CC-BY when the terms are compatible with the project.

Always keep the asset's license information with the project. For CC-BY assets, add the required creator attribution to the repository.

## Adding an asset

1. Download the GLB/GLTF from a source whose license permits your use.
2. Test the model in a GLTF/GLB viewer.
3. Keep the model reasonably low-poly and optimize large textures.
4. Copy the file into `models/`.
5. Set `model.path` in `config.json`.
6. Commit the binary model file together with the configuration change.

Do not commit an asset merely because a website labels it "free": verify its actual license first.
