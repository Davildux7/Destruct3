<div align="center">

# 🎮 Destruct

**Game Engine 2D & IDE Visual no Navegador (100% Client-Side)**

*Crie jogos 2D completos com Event Sheets, Tilemaps, Física, Shaders, Áudio 8-bit, Importação de Construct 3 (`.c3p`) e Exportação para HTML Único — sem backend.*

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Client Side](https://img.shields.io/badge/100%25_Client--Side-Static_Ready-10B981?style=flat-square)

</div>

---

## ✨ Visão Geral

O **Destruct** é uma game engine 2D completa inspirada na arquitetura de **Layouts + Event Sheets + Behaviors** do Construct 3. Toda a IDE e o runtime rodam inteiramente no navegador: sem servidor, sem `eval()` ou `new Function()`, com auto-save em `localStorage`, exportação para arquivo `.html` standalone e importação direta de projetos do Construct 3.

---

## 🚀 Principais Recursos

### 🧠 Motor & Sistema de Eventos (`src/engine/`)
- **Runtime 60 FPS desacoplado:** Canvas 2D + pipeline de pós-processamento WebGL (`PostProcessPipeline`) independente da UI React.
- **Sistema real de Picking (SOL):** Seleção de instâncias propagada por condições, sub-eventos, blocos **AND / OR**, **Else**, **Invert** e **Trigger once while true**.
- **Parser seguro de Expressões:** Tokenizador e AST recursiva próprios (zero `eval`), com suporte a variáveis globais, variáveis de instância, expressões de objetos/behaviors (`Obj.X`, `Obj.Platform.VectorY`), operadores ternários e funções matemáticas (`random`, `choose`, `distance`, `angle`, `clamp`, `lerp`).
- **Event Sheets avançadas:** Suporte a **Groups** ativáveis/desativáveis, **Includes**, loops (`Repeat`, `For each`), ações assíncronas com `Wait` preservando picking e triggers (`On start of layout`, `On collision`, `On timer`, `On tween finished`, etc.).

### 🧩 Plugins & Controles
| Categoria | Plugins Disponíveis |
| :--- | :--- |
| **Visuais & Mapa** | `Sprite` (múltiplas animações, FPS, loop, ping-pong, origin, polígonos de colisão), `TiledBackground`, `Tilemap`, `Text` (com BBCode `[b]`, `[i]`, `[color=]`), `Particles` |
| **Interface (GUI)** | `Button`, `Slider`, `ProgressBar` |
| **Entrada & Sistema** | `System`, `Keyboard`, `Mouse`, `Touch`, `Gamepad`, `VirtualJoystick` (analógico + botões A/B na tela) |
| **Áudio & Dados** | `Audio` (Web Audio API com controle por tag e dB), `LocalStorage` (assíncrono com triggers), `Dictionary` |

### ⚙️ 21 Behaviors Integrados
- **Movimento & Física:** `Platform` (com double jump, jump sustain e `JumpThru`), `EightDirection`, `Bullet`, `Physics` (corpo rígido, impulso, força, atrito, restituição e distance joints), `Pathfinding` (grid A* configurável desviando de `Solid`), `Rotate`, `Sine`.
- **Combate & Interação:** `Turret` (com mira preditiva), `LineOfSight` (alcance e cone de visão contra `Solid`), `DragDrop`, `Pin`, `Tween` (1 ou 2 propriedades e value tween com easings, loop e ping-pong).
- **Atributos & Utilidades:** `Solid`, `JumpThru`, `Fade`, `Flash`, `Timer`, `ScrollTo` (com screen shake), `BoundTo`, `DestroyOutside`, `Wrap`.

### 🛠️ Ferramentas Integradas na IDE (`src/editor/`)
- **Layout View:** Edição visual com zoom/pan, snapping, camadas com `parallaxX/Y`, opacidade, lock, visibilidade e Z-order.
- **Tilemap Painter:** Pintura direta no canvas, borracha e configuração de colisão `Solid` por índice de tile.
- **Sprite Editor:** Editor pixel-art integrado com múltiplas animações, frames, FPS, espelhamento e ponto de origem.
- **SFX Studio (8-bit):** Sintetizador procedural Web Audio (`coin`, `jump`, `hit`, `explosion`, `laser`, `powerup`, `win`, `click`, `bounce`) com geração de assets `.wav` em DataURL.
- **Live Debugger no Preview:** Pause, avanço frame a frame (*Step*), inspeção ao vivo de variáveis globais, instâncias/UIDs e toggles em tempo real de shaders (**Bloom**, **CRT Scanlines**, **Vignette**, **Chromatic Aberration**).

### 📦 Importação & Exportação
- **Importar do Construct 3 (`Import C3` / `Load`):** Importação direta 100% no navegador de arquivos **`.c3p`**, manifestos **`.c3proj`** ou **pastas descompactadas**, convertendo objetos, animações, tilemaps (incluindo compressão RLE), famílias, behaviors, variáveis globais, áudios e event sheets com relatório de compatibilidade.
- **Exportar HTML Único (`Export HTML`):** Empacota todo o projeto + runtime em um único arquivo `.html` pronto para jogar offline ou hospedar em qualquer site estático.
- **Salvar / Carregar JSON:** Serialização completa do projeto em `.destruct.json`.

---

## 🏗️ Arquitetura do Projeto

```text
src/
├── engine/                 # Runtime 2D puro em TypeScript (sem React/UI)
│   ├── runtime.ts          # Loop principal, SOL picking, triggers, renderização
│   ├── behaviors.ts        # Lógica dos 21 behaviors
│   ├── physics.ts          # Simulação de corpo rígido 2D e joints
│   ├── collision.ts        # AABB, polígonos (SAT) e tilemaps
│   ├── tilemap.ts          # Gerador de tileset e colisões de grid
│   ├── expressionParser.ts # Tokenizer & AST segura (zero eval)
│   ├── audio.ts & sfxSynth.ts # Web Audio API + sintetizador 8-bit
│   ├── shaders.ts          # Pós-processamento WebGL (CRT, Bloom, Vignette...)
│   ├── catalog.ts          # Esquemas de plugins, behaviors, condições e ações
│   ├── c3Importer.ts       # Importador direto de Construct 3 (.c3p/.c3proj)
│   ├── exporter.ts         # Gerador de HTML único standalone
│   └── demoProject.ts      # Sandbox de demonstração + projeto em branco
│
└── editor/                 # Interface da IDE em React + Tailwind CSS
    ├── LayoutView.tsx      # Editor visual de layouts, layers e instâncias
    ├── EventSheetView.tsx  # Editor estruturado de eventos, grupos e sub-eventos
    ├── ProjectSidebar.tsx  # Árvore do projeto, layers e object types
    ├── PropertiesBar.tsx   # Inspetor de propriedades, variáveis e behaviors
    ├── PreviewModal.tsx    # Janela de Preview + Live Debugger + Shaders
    ├── TilemapPainter.tsx  # Paleta flutuante de pintura de tilemaps
    ├── SpriteEditorModal.tsx
    ├── SfxStudioModal.tsx
    ├── ImportC3Modal.tsx
    └── EventWizardModal.tsx
```

---

## 💻 Como Rodar Localmente

### Pré-requisitos
- **Node.js** 18+ (ou compatível com Vite 8)

### Instalação e Execução

```bash
# 1. Instale as dependências
npm install

# 2. Inicie o servidor de desenvolvimento (porta 3000)
npm run dev
```

Acesse `http://localhost:3000` no navegador.

### Outros Comandos

```bash
# Verificar tipos TypeScript
npm run lint

# Gerar build estático de produção (pasta dist/)
npm run build

# Visualizar build de produção localmente
npm run preview
```

---

## 🌐 Deploy Estático

Como o **Destruct** é 100% client-side, basta rodar `npm run build` e publicar a pasta `dist/` em qualquer provedor estático (**Netlify**, **Vercel**, **GitHub Pages**, **Cloudflare Pages**).

---

<div align="center">
  Feito para criar jogos 2D direto no navegador ⚡
</div>
