import { GameRuntime } from './runtime';
import { ProjectData } from './types';

declare global {
  interface Window {
    OpenConstructBoot?: (project: ProjectData, canvas: HTMLCanvasElement) => GameRuntime;
  }
}

export function bootStandaloneGame(project: ProjectData, canvas: HTMLCanvasElement): GameRuntime {
  const applyScaling = () => {
    const vw = project.viewportWidth;
    const vh = project.viewportHeight;
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const mode = project.fullscreenScaling || 'letterbox-scale';

    if (mode === 'off') {
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      return;
    }

    let scale = Math.min(ww / vw, wh / vh);
    if (mode === 'letterbox-integer') {
      scale = Math.max(1, Math.floor(scale));
    } else if (mode === 'scale-outer' || mode === 'scale-inner') {
      scale = Math.max(ww / vw, wh / vh);
    }

    canvas.style.width = `${Math.floor(vw * scale)}px`;
    canvas.style.height = `${Math.floor(vh * scale)}px`;
  };

  applyScaling();
  window.addEventListener('resize', applyScaling);

  const runtime = new GameRuntime(project, canvas);
  runtime.start();
  return runtime;
}

if (typeof window !== 'undefined') {
  window.OpenConstructBoot = bootStandaloneGame;
}
