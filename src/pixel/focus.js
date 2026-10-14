// Keep focus on the GPU: a texture pass replaces a synchronous full-screen
// readback and JS pixel loop. The view retains its CPU path if WebGL fails.
export class FocusFilter {
  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'pixel-canvas focus-pass'
    this.canvas.style.display = 'none'
    const gl = this.gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true })
    if (!gl) return
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ready = false })
    this.canvas.addEventListener('webglcontextrestored', () => this.init())
    this.init()
  }

  init() {
    const gl = this.gl
    const compile = (type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Focus shader failed')
      return shader
    }
    try {
      const vertex = compile(gl.VERTEX_SHADER, `
        attribute vec2 position;
        varying vec2 uv;
        void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
      `)
      const fragment = compile(gl.FRAGMENT_SHADER, `
        precision highp float;
        varying vec2 uv;
        uniform sampler2D scene;
        uniform float amount;
        uniform float flash;
        uniform float fade;
        void main() {
          vec3 c = texture2D(scene, vec2(uv.x, 1.0 - uv.y)).rgb;
          if (!(c.r > 150.0 / 255.0 && c.r > c.g * 1.6 && c.r > c.b * 1.6)) {
            float l = dot(c, vec3(0.3, 0.59, 0.11));
            c = mix(c, l * vec3(0.85, 0.92, 1.15), amount);
          }
          c = clamp(c, 0.0, 1.0);
          c = mix(c, vec3(1.0), flash);
          c = mix(c, vec3(8.0, 6.0, 16.0) / 255.0, fade);
          gl_FragColor = vec4(c, 1.0);
        }
      `)
      const program = gl.createProgram()
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Focus program failed')
      gl.useProgram(program)
      this.amount = gl.getUniformLocation(program, 'amount')
      this.flash = gl.getUniformLocation(program, 'flash')
      this.fade = gl.getUniformLocation(program, 'fade')
      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      this.texture = gl.createTexture()
      this.textureWidth = this.textureHeight = 0
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.ready = true
    } catch { this.ready = false }
  }

  draw(ctx, amount, { present = false, flash = 0, fade = 0 } = {}) {
    if (!this.ready) return false
    const gl = this.gl, source = ctx.canvas
    if (gl.isContextLost()) { this.ready = false; return false }
    if (this.canvas.width !== source.width || this.canvas.height !== source.height) {
      this.canvas.width = source.width
      this.canvas.height = source.height
      gl.viewport(0, 0, source.width, source.height)
    }
    if (this.textureWidth !== source.width || this.textureHeight !== source.height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      this.textureWidth = source.width
      this.textureHeight = source.height
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.uniform1f(this.amount, amount)
    gl.uniform1f(this.flash, flash)
    gl.uniform1f(this.fade, fade)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    if (present) {
      if (!this.canvas.isConnected) source.after(this.canvas)
      this.canvas.style.width = source.style.width
      this.canvas.style.height = source.style.height
      this.canvas.style.filter = source.style.filter
      this.canvas.style.display = 'block'
      source.style.visibility = 'hidden'
      this.source = source
    } else ctx.drawImage(this.canvas, 0, 0)
    return true
  }

  hide() {
    if (!this.source) return
    this.canvas.style.display = 'none'
    this.source.style.visibility = ''
    this.source = null
  }
}
