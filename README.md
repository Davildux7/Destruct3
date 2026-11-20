 <div align="center">

# 🎮 Destruct

**2D Game Engine & Visual IDE in the Browser (100% Client-Side)**

*Create complete 2D games with Event Sheets, Tilemaps, Physics, Shaders, 8-bit Audio, Construct 3 (.c3p) Import, and Single-File HTML Export — no backend required.*

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Client Side](https://img.shields.io/badge/100%25_Client--Side-Static_Ready-10B981?style=flat-square)

</div>

---

## ✨ Overview

**Destruct** is a complete 2D game engine inspired by Construct 3's **Layouts + Event Sheets + Behaviors** architecture. Both the IDE and runtime run entirely in the browser: no server, no `eval()` or `new Function()`, with automatic saving via `localStorage`, standalone `.html` file export, and direct Construct 3 project import.

---

## 🚀 Key Features

### 🧠 Engine & Event System (`src/engine/`)

- **Decoupled 60 FPS Runtime:** Canvas 2D + WebGL post-processing pipeline (`PostProcessPipeline`), independent of the React UI.
- **Real Picking System (SOL):** Instance selection propagated through conditions, sub-events, **AND / OR** blocks, **Else**, **Invert**, and **Trigger once while true**.
- **Safe Expression Parser:** Custom tokenizer and recursive AST (zero `eval`), supporting global variables, instance variables, object/behavior expressions (`Obj.X`, `Obj.Platform.VectorY`), ternary operators, and mathematical functions (`random`, `choose`, `distance`, `angle`, `clamp`, `lerp`).
- **Advanced Event Sheets:** Support for enableable/disableable **Groups**, **Includes**, loops (`Repeat`, `For each`), asynchronous actions with `Wait` while preserving picking, and triggers (`On start of layout`, `On collision`, `On timer`, `On tween finished`, etc.).

### 🧩 Plugins & Controls

| Category | Available Plugins |
| :--- | :--- |
| **Visuals & Maps** | `Sprite` (multiple animations, FPS, looping, ping-pong, origin, collision polygons), `TiledBackground`, `Tilemap`, `Text` (with BBCode `[b]`, `[i]`, `[color=]`), `Particles` |
| **Interface (GUI)** | `Button`, `Slider`, `ProgressBar` |
| **Input & System** | `System`, `Keyboard`, `Mouse`, `Touch`, `Gamepad`, `VirtualJoystick` (analog controls + on-screen A/B buttons) |
| **Audio & Data** | `Audio` (Web Audio API with tag-based and dB volume control), `LocalStorage` (asynchronous with triggers), `Dictionary` |

### ⚙️ 21 Integrated Behaviors

- **Movement & Physics:** `Platform` (with double jump, jump sustain, and `JumpThru`), `EightDirection`, `Bullet`, `Physics` (rigid bodies, impulses, forces, friction, restitution, and distance joints), `Pathfinding` (configurable A* grid pathfinding around `Solid` objects), `Rotate`, `Sine`.
- **Combat & Interaction:** `Turret` (with predictive aiming), `LineOfSight` (range and vision cone against `Solid` objects), `DragDrop`, `Pin`, `Tween` (1 or 2 properties and value tweening with easing functions, looping, and ping-pong).
- **Attributes & Utilities:** `Solid`, `JumpThru`, `Fade`, `Flash`, `Timer`, `ScrollTo` (with screen shake), `BoundTo`, `DestroyOutside`, `Wrap`.

### 🛠️ Built-in IDE Tools (`src/editor/`)

- **Layout View:** Visual editing with zoom/pan, snapping, layers with `parallaxX/Y`, opacity, locking, visibility, and Z-order.
- **Tilemap Painter:** Direct canvas painting, erasing, and `Solid` collision configuration by tile index.
- **Sprite Editor:** Integrated pixel-art editor with multiple animations, frames, FPS, flipping, and origin point controls.
- **SFX Studio (8-bit):** Procedural Web Audio synthesizer (`coin`, `jump`, `hit`, `explosion`, `laser`, `powerup`, `win`, `click`, `bounce`) with `.wav` asset generation as DataURLs.
- **Live Preview Debugger:** Pause, frame-by-frame stepping (*Step*), live inspection of global variables, instances/UIDs, and real-time shader toggles (**Bloom**, **CRT Scanlines**, **Vignette**, **Chromatic Aberration**).

### 📦 Import & Export

- **Import from Construct 3 (`Import C3` / `Load`):** Fully browser-based import of **`.c3p`** files, **`.c3proj`** manifests, or **unpacked project folders**, converting objects, animations, tilemaps (including RLE compression), families, behaviors, global variables, audio, and event sheets, with a compatibility report.
- **Single-File HTML Export (`Export HTML`):** Packages the entire project and runtime into a single `.html` file, ready to play offline or host on any static website.
- **Save / Load JSON:** Complete project serialization into `.destruct.json` files.

---

## 🏗️ Project Architecture

```text
src/
├── engine/                 # Pure TypeScript 2D runtime (no React/UI)
│   ├── runtime.ts          # Main loop, SOL picking, triggers, rendering
│   ├── behaviors.ts        # Logic for the 21 behaviors
│   ├── physics.ts          # 2D rigid body and joint simulation
│   ├── collision.ts        # AABB, polygons (SAT), and tilemaps
│   ├── tilemap.ts          # Tileset generator and grid collisions
│   ├── expressionParser.ts # Safe tokenizer & AST (zero eval)
│   ├── audio.ts & sfxSynth.ts # Web Audio API + 8-bit synthesizer
│   ├── shaders.ts          # WebGL post-processing (CRT, Bloom, Vignette...)
│   ├── catalog.ts          # Plugin, behavior, condition, and action schemas
│   ├── c3Importer.ts       # Direct Construct 3 importer (.c3p/.c3proj)
│   ├── exporter.ts         # Standalone single-file HTML generator
│   └── demoProject.ts      # Demo sandbox + blank project
│
└── editor/                 # React + Tailwind CSS IDE interface
    ├── LayoutView.tsx      # Visual editor for layouts, layers, and instances
    ├── EventSheetView.tsx  # Structured editor for events, groups, and sub-events
    ├── ProjectSidebar.tsx  # Project tree, layers, and object types
    ├── PropertiesBar.tsx   # Property, variable, and behavior inspector
    ├── PreviewModal.tsx    # Preview window + Live Debugger + Shaders
    ├── TilemapPainter.tsx  # Floating tilemap painting palette
    ├── SpriteEditorModal.tsx
    ├── SfxStudioModal.tsx
    ├── ImportC3Modal.tsx
    └── EventWizardModal.tsx
```

---

## 💻 Running Locally

### Requirements

- **Node.js** 18+ (or a version compatible with Vite 8)

### Installation & Execution

```bash
# 1. Install dependencies
npm install

# 2. Start the development server (port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

### Other Commands

```bash
# Check TypeScript types
npm run lint

# Generate a static production build (dist/ folder)
npm run build

# Preview the production build locally
npm run preview
```

---

## 🌐 Static Deployment

Since **Destruct** is 100% client-side, simply run `npm run build` and deploy the `dist/` folder to any static hosting provider (**Netlify**, **Vercel**, **GitHub Pages**, **Cloudflare Pages**).

---

<div align="center">

Made for creating 2D games directly in your browser ⚡

</div>
