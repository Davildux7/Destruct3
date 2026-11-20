import runtimeBundleCode from 'virtual:openconstruct-runtime';
import { ProjectData } from './types';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSingleHtmlExport(project: ProjectData): string {
  const safeJson = JSON.stringify(project).replace(/<\/script/gi, '<\\/script');
  const title = escapeHtml(project.name || 'Destruct Game');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #0b0d12;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      touch-action: none;
      user-select: none;
    }
    canvas {
      display: block;
      image-rendering: ${project.pixelRounding ? 'pixelated' : 'auto'};
      box-shadow: 0 20px 60px rgba(0,0,0,0.65);
    }
  </style>
</head>
<body>
  <canvas id="game-canvas" tabindex="0"></canvas>
  <script id="project-data" type="application/json">${safeJson}</script>
  <script>${runtimeBundleCode}</script>
  <script>
    (function() {
      var dataEl = document.getElementById('project-data');
      var canvas = document.getElementById('game-canvas');
      var project = JSON.parse(dataEl.textContent || '{}');
      canvas.focus();
      if (window.OpenConstructBoot) {
        window.OpenConstructBoot(project, canvas);
      }
    })();
  </script>
</body>
</html>`;
}
