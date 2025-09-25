# Minecraft Recipe Explorer (Static Site)

A lightweight, local-only website to browse crafting recipes for your modded Minecraft world. Load your recipe JSON files and search any item to view its recipe and recursively expand ingredient recipes.

Features
- Load multiple recipe folders or files (drag-and-drop or folder picker)
- Supports shaped/shapeless crafting and basic processing (smelting, blasting, smoking, stonecutting, smithing)
- Shows all matching recipes for an item; expand ingredient trees up to a chosen depth
- Runs fully in the browser (no server, no data leaves your machine)

Quick Start
1) Open `index.html` in your browser (Chrome recommended)
2) Click “Choose recipes folder” and select a `recipes/` directory, or drag-and-drop JSON files/folders into the drop zone
3) Type an item id (e.g., `minecraft:stick` or `modid:gear`) and click “Show Recipe”
4) Adjust recursion depth to expand ingredient recipes

Where to get recipes
- Datapacks: `data/<namespace>/recipes/*.json` inside the datapack
- Mods (Forge/Fabric): in each mod JAR, under `data/<modid>/recipes/*.json` (extract with any zip tool)
- Worlds/Servers: modpacks often ship recipes across multiple mods; gather all `recipes/` folders into one and load them together

Notes & Limitations
- Icons/textures are not shown; items are displayed by id (e.g., `minecraft:planks`).
- Mod-specific recipe types beyond vanilla-like crafting/processing may not render. These can be added if you provide sample JSONs.
- Some ingredients allow multiple options (tags or lists); the grid shows these as `item1 / item2 / #tag` per slot. Recursive expansion only follows single-item options to avoid ambiguity.

Deploying
This is a static site. You can host it anywhere (GitHub Pages, a simple HTTP server, or just open the file locally). If you want, we can add a minimal GitHub Pages setup.

License
Choose your preferred license for this folder (MIT/Apache-2.0) if you plan to publish.
