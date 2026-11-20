import { AudioAsset } from './types';

interface ActiveSound {
  tag: string;
  gainNode: GainNode;
  stop: () => void;
}

export class EngineAudio {
  private ctx: AudioContext | null = null;
  private decodedBuffers = new Map<string, AudioBuffer>();
  private tagVolumesDb = new Map<string, number>();
  private activeSounds = new Set<ActiveSound>();
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    for (const s of this.activeSounds) {
      const db = this.tagVolumesDb.get(s.tag) ?? 0;
      s.gainNode.gain.value = muted ? 0 : this.dbToGain(db);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public dbToGain(db: number): number {
    if (db <= -60) return 0;
    return Math.pow(10, db / 20);
  }

  public setTagVolume(tag: string, db: number): void {
    this.tagVolumesDb.set(tag, db);
    const gain = this.muted ? 0 : this.dbToGain(db);
    for (const s of this.activeSounds) {
      if (s.tag === tag) {
        s.gainNode.gain.value = gain;
      }
    }
  }

  public getTagVolume(tag: string): number {
    return this.tagVolumesDb.get(tag) ?? 0;
  }

  public isTagPlaying(tag: string): boolean {
    for (const s of this.activeSounds) {
      if (s.tag === tag) return true;
    }
    return false;
  }

  public stopTag(tag: string): void {
    for (const s of Array.from(this.activeSounds)) {
      if (s.tag === tag) {
        s.stop();
        this.activeSounds.delete(s);
      }
    }
  }

  public stopAll(): void {
    for (const s of Array.from(this.activeSounds)) {
      s.stop();
    }
    this.activeSounds.clear();
  }

  public async preloadAssets(assets: AudioAsset[]): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    for (const asset of assets) {
      if (this.decodedBuffers.has(asset.name)) continue;
      try {
        const res = await fetch(asset.dataUrl);
        const buf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        this.decodedBuffers.set(asset.name, decoded);
      } catch {
        // Ignore invalid audio asset
      }
    }
  }

  public playAsset(name: string, assets: AudioAsset[], loop: boolean, volumeDb: number, tag: string): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const cached = this.decodedBuffers.get(name);
    if (cached) {
      this.playBuffer(ctx, cached, loop, volumeDb, tag);
      return;
    }

    const asset = assets.find((a) => a.name === name);
    if (!asset) return;

    fetch(asset.dataUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        this.decodedBuffers.set(name, decoded);
        this.playBuffer(ctx, decoded, loop, volumeDb, tag);
      })
      .catch(() => {});
  }

  private playBuffer(ctx: AudioContext, buffer: AudioBuffer, loop: boolean, volumeDb: number, tag: string): void {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    const gainNode = ctx.createGain();
    const tagDb = this.tagVolumesDb.get(tag) ?? 0;
    gainNode.gain.value = this.muted ? 0 : this.dbToGain(volumeDb + tagDb);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    const active: ActiveSound = {
      tag,
      gainNode,
      stop: () => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
      },
    };
    this.activeSounds.add(active);
    source.onended = () => {
      this.activeSounds.delete(active);
    };
    source.start();
  }

  public playSynth(preset: string, volumeDb = -4, tag = 'sfx'): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;

    const now = ctx.currentTime;
    const tagDb = this.tagVolumesDb.get(tag) ?? 0;
    const baseGain = Math.min(0.6, Math.max(0.01, this.dbToGain(volumeDb + tagDb) * 0.35));

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(baseGain, now);
    masterGain.connect(ctx.destination);

    const registerOsc = (osc: OscillatorNode, duration: number) => {
      const active: ActiveSound = {
        tag,
        gainNode: masterGain,
        stop: () => {
          try {
            osc.stop();
          } catch {
            // ignore
          }
        },
      };
      this.activeSounds.add(active);
      osc.onended = () => this.activeSounds.delete(active);
      osc.start(now);
      osc.stop(now + duration);
    };

    switch (preset) {
      case 'coin': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(987.77, now); // B5
        osc.frequency.setValueAtTime(1318.51, now + 0.065); // E6
        masterGain.gain.setValueAtTime(baseGain * 0.7, now);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(masterGain);
        registerOsc(osc, 0.29);
        break;
      }
      case 'jump': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(580, now + 0.14);
        masterGain.gain.setValueAtTime(baseGain * 0.65, now);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(masterGain);
        registerOsc(osc, 0.17);
        break;
      }
      case 'hit': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(170, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);
        masterGain.gain.setValueAtTime(baseGain, now);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(masterGain);
        registerOsc(osc, 0.21);
        break;
      }
      case 'explosion': {
        // Noise burst + low sub sweep
        const bufSize = Math.floor(ctx.sampleRate * 0.26);
        const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(850, now);
        filter.frequency.exponentialRampToValueAtTime(110, now + 0.25);
        noise.connect(filter);
        filter.connect(masterGain);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        noise.start(now);
        break;
      }
      case 'laser': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.13);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(masterGain);
        registerOsc(osc, 0.15);
        break;
      }
      case 'powerup': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.055);
          g.gain.setValueAtTime(baseGain * 0.8, now + i * 0.055);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.12);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now + i * 0.055);
          osc.stop(now + i * 0.055 + 0.13);
        });
        break;
      }
      case 'win': {
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'square';
          const t0 = now + i * 0.09;
          osc.frequency.setValueAtTime(freq, t0);
          g.gain.setValueAtTime(baseGain * 0.65, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + 0.27);
        });
        break;
      }
      case 'bounce': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.1);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(masterGain);
        registerOsc(osc, 0.13);
        break;
      }
      case 'click':
      default: {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(masterGain);
        registerOsc(osc, 0.06);
        break;
      }
    }
  }
}
