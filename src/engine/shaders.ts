import { PostProcessSettings } from './types';

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y; // Flip Y for canvas texture
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_time;

uniform int u_bloom;
uniform float u_bloomIntensity;

uniform int u_crt;
uniform float u_crtCurvature;

uniform int u_vignette;
uniform float u_vignetteStrength;

uniform int u_chromatic;
uniform float u_chromaticOffset;

uniform int u_pixelate;

vec2 curveUV(vec2 uv, float curve) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(curve, curve);
  uv = uv + uv * offset * offset;
  uv = uv * 0.5 + 0.5;
  return uv;
}

void main() {
  vec2 uv = v_uv;

  // 1. Pixelate (mosaic)
  if (u_pixelate > 1) {
    float px = float(u_pixelate);
    vec2 pSize = px / u_resolution;
    uv = floor(uv / pSize) * pSize;
  }

  // 2. CRT Curvature
  if (u_crt == 1 && u_crtCurvature > 0.001) {
    float k = 8.0 - u_crtCurvature * 4.0;
    uv = curveUV(uv, k);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  // 3. Chromatic Aberration
  vec4 color;
  if (u_chromatic == 1 && u_chromaticOffset > 0.0) {
    vec2 shift = (u_chromaticOffset / u_resolution);
    float r = texture(u_image, uv + shift).r;
    float g = texture(u_image, uv).g;
    float b = texture(u_image, uv - shift).b;
    float a = texture(u_image, uv).a;
    color = vec4(r, g, b, a);
  } else {
    color = texture(u_image, uv);
  }

  // 4. Bloom (glow on bright areas)
  if (u_bloom == 1 && u_bloomIntensity > 0.0) {
    vec4 sum = vec4(0.0);
    float stepX = 1.8 / u_resolution.x;
    float stepY = 1.8 / u_resolution.y;
    sum += texture(u_image, uv + vec2(-stepX, -stepY));
    sum += texture(u_image, uv + vec2(0.0, -stepY));
    sum += texture(u_image, uv + vec2(stepX, -stepY));
    sum += texture(u_image, uv + vec2(-stepX, 0.0));
    sum += texture(u_image, uv);
    sum += texture(u_image, uv + vec2(stepX, 0.0));
    sum += texture(u_image, uv + vec2(-stepX, stepY));
    sum += texture(u_image, uv + vec2(0.0, stepY));
    sum += texture(u_image, uv + vec2(stepX, stepY));
    vec4 avg = sum / 9.0;
    float brightness = dot(avg.rgb, vec3(0.2126, 0.7152, 0.0722));
    if (brightness > 0.55) {
      color += (avg * (brightness - 0.55) * 2.2) * u_bloomIntensity;
    }
  }

  // 5. CRT Scanlines
  if (u_crt == 1) {
    float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.12;
    color.rgb -= scanline;
  }

  // 6. Vignette
  if (u_vignette == 1 && u_vignetteStrength > 0.0) {
    float dist = distance(uv, vec2(0.5, 0.5));
    float vig = smoothstep(0.8, 0.25, dist * (0.8 + u_vignetteStrength));
    color.rgb *= vig;
  }

  fragColor = color;
}
`;

export class PostProcessPipeline {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private canvas: HTMLCanvasElement;
  private glCanvas: HTMLCanvasElement;

  constructor(sourceCanvas: HTMLCanvasElement) {
    this.canvas = sourceCanvas;
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.width = sourceCanvas.width;
    this.glCanvas.height = sourceCanvas.height;

    const gl = this.glCanvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return;
    this.gl = gl;
    this.initShaders();
  }

  private initShaders(): void {
    const gl = this.gl;
    if (!gl) return;

    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('WebGL link error:', gl.getProgramInfoLog(prog));
      return;
    }
    this.program = prog;

    // Fullscreen quad [-1, -1] to [1, 1]
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;

    // Source texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.texture = tex;
  }

  private compileShader(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('Shader compile failed:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  public render(targetCtx: CanvasRenderingContext2D, settings?: PostProcessSettings, time = 0): boolean {
    const gl = this.gl;
    if (!gl || !this.program || !this.texture || !this.vao || !settings?.enabled) {
      return false; // Fall back to direct canvas2D
    }

    if (this.glCanvas.width !== this.canvas.width || this.glCanvas.height !== this.canvas.height) {
      this.glCanvas.width = this.canvas.width;
      this.glCanvas.height = this.canvas.height;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Upload 2D canvas to WebGL texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);

    // Uniforms
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_time'), time);

    gl.uniform1i(gl.getUniformLocation(this.program, 'u_bloom'), settings.bloom ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_bloomIntensity'), settings.bloomIntensity ?? 1);

    gl.uniform1i(gl.getUniformLocation(this.program, 'u_crt'), settings.crtScanlines ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_crtCurvature'), settings.crtCurvature ?? 0.3);

    gl.uniform1i(gl.getUniformLocation(this.program, 'u_vignette'), settings.vignette ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_vignetteStrength'), settings.vignetteStrength ?? 0.5);

    gl.uniform1i(gl.getUniformLocation(this.program, 'u_chromatic'), settings.chromaticAberration ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_chromaticOffset'), settings.chromaticOffset ?? 2.5);

    gl.uniform1i(gl.getUniformLocation(this.program, 'u_pixelate'), settings.pixelate > 1 ? settings.pixelate : 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Blit processed WebGL image back onto destination context
    targetCtx.drawImage(this.glCanvas, 0, 0);
    return true;
  }
}
