import { useEffect, useRef } from "react"

/**
 * The hero's background: a raymarched tunnel of glowing folds, ported from a
 * shader by Xor (fragcoord.xyz; credited in the home page footer), drawn on a
 * WebGL2 canvas behind the hero copy.
 *
 * Colors are not in the shader. The hero sets them as CSS custom properties
 * (landing.css: --hero-ground, --hero-ink-1..3, --hero-glow), drawn from the
 * site's palette (Percent Blue and Signal Orange), and they're read here at
 * mount; the shader only blends them by depth.
 *
 * It plays on its own (the one exception to the Pointer-Gated Motion Rule,
 * see DESIGN.md): u_time is seconds since playback started. The clock only
 * runs while the hero is on screen and the tab is visible, so it never burns
 * GPU unseen. prefers-reduced-motion holds the first frame. No WebGL2: the
 * canvas stays hidden and the hero is plain ground.
 */

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;      // seconds since playback started
uniform vec3 u_ground;      // page background the glow sits on
uniform vec3 u_ink[3];      // palette, blended by depth
uniform float u_glow;       // overall strength (0..1)
out vec4 fragColor;

// depth -> palette: a smooth loop through the three inks
vec3 ink(float z) {
  float t = fract(z * 0.048);
  float k = t * 3.0;
  vec3 a = k < 1.0 ? u_ink[0] : k < 2.0 ? u_ink[1] : u_ink[2];
  vec3 b = k < 1.0 ? u_ink[1] : k < 2.0 ? u_ink[2] : u_ink[0];
  return mix(a, b, smoothstep(0.0, 1.0, fract(k)));
}

void main() {
  vec3 acc = vec3(0.0);
  vec3 p;
  float d = 0.0, z = 0.0;
  // the original's normalize(gl_FragCoord.rgb*2. - vec3(u_resolution,1.).xyy)
  vec3 dir = normalize(gl_FragCoord.xyz * 2.0 - vec3(u_resolution, 1.0).xyy);
  for (float i = 0.0; i < 100.0; i++) {
    p = z * dir;
    p.z -= u_time - z * 0.6;
    d = abs(0.03 * z - 0.3);
    p = cos(p);
    d = max(d, length(max(p, p.yzx)) - d);
    z += d;
    // the original's (cos(z*.3 + phase) + 2) weighting, with the hue lifted
    // out into the palette: brightness 1..3 by depth, color from ink()
    acc += ink(z) * (2.0 + cos(z * 0.3)) / d / z;
  }
  vec3 glow = tanh(acc * acc / 900.0) * u_glow;
  fragColor = vec4(u_ground + glow * (1.0 - u_ground), 1.0);
}`

// render at a fraction of CSS pixels: the glow is soft, and 100 steps per
// pixel at full device resolution would be a waste
const SCALE = 0.5

// any CSS color (the palette is oklch) -> sRGB 0..1: paint one pixel on a 2D
// canvas and read it back, so the browser does the conversion and gamut clip
function parseColor(v: string): [number, number, number] {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (!ctx) return [0, 0, 0]
  ctx.canvas.width = ctx.canvas.height = 1
  ctx.fillStyle = v.trim() || "#000"
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

export function HeroShader({ host }: { host: React.RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const hostEl = host.current
    if (!canvas || !hostEl) return
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader")
      return sh
    }
    let prog: WebGLProgram
    try {
      prog = gl.createProgram()!
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link")
    } catch (e) {
      console.warn("hero shader:", e)
      return
    }
    gl.useProgram(prog)

    // one full-screen triangle pair
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, "a_pos")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, "u_resolution")
    const uTime = gl.getUniformLocation(prog, "u_time")

    // colors from the hero's custom properties (landing.css)
    const css = getComputedStyle(hostEl)
    const col = (name: string) => parseColor(css.getPropertyValue(name))
    gl.uniform3fv(gl.getUniformLocation(prog, "u_ground"), col("--hero-ground"))
    gl.uniform3fv(gl.getUniformLocation(prog, "u_ink"), [...col("--hero-ink-1"), ...col("--hero-ink-2"), ...col("--hero-ink-3")])
    gl.uniform1f(gl.getUniformLocation(prog, "u_glow"), parseFloat(css.getPropertyValue("--hero-glow")) || 0.6)

    let t = 0 // playback seconds
    const draw = () => {
      gl.uniform1f(uTime, t)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    // u_resolution belongs to this program, so the first call always sets it,
    // even when the canvas already has the right size (a remount - React's dev
    // double-mount - reuses the sized canvas but brings a fresh program)
    const resize = (force = false) => {
      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE))
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE))
      if (!force && canvas.width === w && canvas.height === h) return
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
      draw()
    }
    resize(true)
    canvas.classList.add("ready")
    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas)

    // playback clock: advances by real frame time while playing; pausing
    // (off screen, hidden tab) stops it, so resuming picks up where it left off
    const still = window.matchMedia("(prefers-reduced-motion: reduce)")
    let raf = 0, last = 0, onScreen = true
    const tick = (now: number) => {
      t += Math.min(0.1, (now - last) / 1000) // clamp: no jump after a stall
      last = now
      draw()
      raf = requestAnimationFrame(tick)
    }
    const update = () => {
      const play = onScreen && !document.hidden && !still.matches
      if (play && !raf) { last = performance.now(); raf = requestAnimationFrame(tick) }
      else if (!play && raf) { cancelAnimationFrame(raf); raf = 0 }
    }
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; update() })
    io.observe(hostEl)
    document.addEventListener("visibilitychange", update)
    still.addEventListener("change", update)
    update()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener("visibilitychange", update)
      still.removeEventListener("change", update)
      // free what this mount made; the context itself stays with the canvas
      // (a remount, e.g. React's dev double-mount, gets the same one back)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [host])

  return <canvas ref={canvasRef} className="hero-shader" aria-hidden="true" />
}
