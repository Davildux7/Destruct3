/**
 * Parametric 8-bit retro chiptune synthesizer (sfxr/bfxr-inspired).
 * 100% pure TypeScript generating Web Audio buffers and standalone WAV DataURLs.
 */

export interface SfxParams {
  waveform: 'square' | 'sawtooth' | 'sine' | 'noise' | 'triangle';
  baseFreq: number; // Hz (40 - 2000)
  freqSlide: number; // Hz/sec (-1500 to +1500)
  dutyCycle: number; // 0.1 to 0.9 (for square/pulse)
  attackTime: number; // seconds
  sustainTime: number; // seconds
  decayTime: number; // seconds
  vibratoSpeed: number; // Hz (0 - 30)
  vibratoDepth: number; // Hz (0 - 100)
  volume: number; // 0..1
}

export const SFX_PRESETS: Record<string, () => SfxParams> = {
  coin: () => ({
    waveform: 'square',
    baseFreq: 980,
    freqSlide: 600,
    dutyCycle: 0.5,
    attackTime: 0.01,
    sustainTime: 0.08,
    decayTime: 0.18,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    volume: 0.6,
  }),
  laser: () => ({
    waveform: 'sawtooth',
    baseFreq: 880,
    freqSlide: -1200,
    dutyCycle: 0.5,
    attackTime: 0.005,
    sustainTime: 0.05,
    decayTime: 0.15,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    volume: 0.65,
  }),
  explosion: () => ({
    waveform: 'noise',
    baseFreq: 240,
    freqSlide: -200,
    dutyCycle: 0.5,
    attackTime: 0.01,
    sustainTime: 0.12,
    decayTime: 0.45,
    vibratoSpeed: 5,
    vibratoDepth: 30,
    volume: 0.75,
  }),
  jump: () => ({
    waveform: 'square',
    baseFreq: 330,
    freqSlide: 800,
    dutyCycle: 0.35,
    attackTime: 0.01,
    sustainTime: 0.06,
    decayTime: 0.2,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    volume: 0.6,
  }),
  powerup: () => ({
    waveform: 'triangle',
    baseFreq: 440,
    freqSlide: 950,
    dutyCycle: 0.5,
    attackTime: 0.02,
    sustainTime: 0.15,
    decayTime: 0.3,
    vibratoSpeed: 12,
    vibratoDepth: 25,
    volume: 0.65,
  }),
  hit: () => ({
    waveform: 'noise',
    baseFreq: 400,
    freqSlide: -700,
    dutyCycle: 0.5,
    attackTime: 0.005,
    sustainTime: 0.03,
    decayTime: 0.14,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    volume: 0.7,
  }),
  blip: () => ({
    waveform: 'sine',
    baseFreq: 640,
    freqSlide: 0,
    dutyCycle: 0.5,
    attackTime: 0.005,
    sustainTime: 0.04,
    decayTime: 0.08,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    volume: 0.55,
  }),
};

export function renderSfxPcm(params: SfxParams, sampleRate = 44100): Float32Array {
  const totalDuration = Math.max(0.04, params.attackTime + params.sustainTime + params.decayTime);
  const totalSamples = Math.floor(totalDuration * sampleRate);
  const output = new Float32Array(totalSamples);

  let phase = 0;
  let freq = params.baseFreq;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // Frequency slide & vibrato
    freq = Math.max(20, params.baseFreq + params.freqSlide * t);
    if (params.vibratoDepth > 0 && params.vibratoSpeed > 0) {
      freq += Math.sin(t * params.vibratoSpeed * Math.PI * 2) * params.vibratoDepth;
    }

    // Phase increment
    phase = (phase + freq / sampleRate) % 1;

    // Waveform sample
    let s = 0;
    switch (params.waveform) {
      case 'square':
        s = phase < params.dutyCycle ? 1 : -1;
        break;
      case 'sawtooth':
        s = phase * 2 - 1;
        break;
      case 'sine':
        s = Math.sin(phase * Math.PI * 2);
        break;
      case 'triangle':
        s = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
        break;
      case 'noise':
        s = Math.random() * 2 - 1;
        break;
    }

    // ADSR Envelope (Attack, Sustain, Decay)
    let env = 0;
    if (t < params.attackTime) {
      env = params.attackTime > 0 ? t / params.attackTime : 1;
    } else if (t < params.attackTime + params.sustainTime) {
      env = 1;
    } else {
      const decayElapsed = t - (params.attackTime + params.sustainTime);
      env = params.decayTime > 0 ? Math.max(0, 1 - decayElapsed / params.decayTime) : 0;
    }

    output[i] = s * env * params.volume;
  }

  return output;
}

export function generateSfxWavDataUrl(params: SfxParams): string {
  const sampleRate = 44100;
  const pcm = renderSfxPcm(params, sampleRate);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF Chunk Descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // "fmt " Sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" Sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  // Convert array buffer to base64 DataURL
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:audio/wav;base64,${base64}`;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
