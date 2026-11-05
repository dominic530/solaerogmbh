/*! SOLAERO 3D viewer engine – dependency-free WebGL (1.0 compatible), ~12 KB.
 *  window.SOLAERO3D.Viewer(canvas, opts) -> { load(key), setBackground(r,g,b), destroy(), resize(), reset() }
 *  Models are read from window.SOLAERO3D.models[key] (base64, see tools/pack_model.py).
 *  Works on every browser/OS with WebGL (iOS Safari, Android Chrome, desktop); no external libraries, no network after the model file. */
(function () {
  'use strict';
  var NS = (window.SOLAERO3D = window.SOLAERO3D || { models: {} });
  if (NS.Viewer) return;

  /* ---------- tiny mat4 helpers (column-major) ---------- */
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function persp(fovy, asp, n, f) { var t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; }
  function lookAt(e, c, u) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    var xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx, xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  }
  function diag(x, y, z) { return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]); }
  function srgb2lin(v) { return Math.pow(v, 2.2); }

  /* ---------- shaders: procedural studio environment (soft boxes) -> polished metal / acetate / glass without any texture ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;uniform mat4 uMVP;uniform mat4 uM;uniform float uMir;varying vec3 vN;varying vec3 vW;' +
    'void main(){vec4 w=uM*vec4(aP,1.0);vW=w.xyz;vN=vec3(aN.x*uMir,aN.y,aN.z);gl_Position=uMVP*vec4(aP,1.0);}';
  var FS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    'varying vec3 vN;varying vec3 vW;uniform vec3 uCam;uniform vec4 uCol;uniform float uMet;uniform float uRou;uniform float uBlend;' +
    'float box(vec3 d,vec3 c,float w){return exp(-(1.0-clamp(dot(d,c),-1.0,1.0))/w);}' +
    'vec3 env(vec3 d,float r){float w=0.02+r*r*0.55;' +
    ' float h=d.y*0.5+0.5; vec3 c=mix(vec3(0.10,0.105,0.12),vec3(0.80,0.82,0.86),smoothstep(0.0,0.9,h));' +
    ' c+=vec3(1.00,0.97,0.93)*3.2*box(d,normalize(vec3(-0.45,0.85,0.45)),w);' +       // key soft box (top-left)
    ' c+=vec3(0.90,0.95,1.00)*1.8*box(d,normalize(vec3(0.80,0.25,0.55)),w*1.4);' +     // fill (right)
    ' c+=vec3(1.00,1.00,1.00)*2.2*box(d,normalize(vec3(0.0,0.35,-1.0)),w*1.2);' +      // rim (behind)
    ' c+=vec3(0.95,0.96,1.00)*0.9*box(d,normalize(vec3(-0.9,-0.1,0.2)),w*2.0);' +      // side bounce
    ' c*=0.9+0.25*smoothstep(0.55,0.0,abs(d.y));return c;}' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uCam-vW);if(!gl_FrontFacing)N=-N;' +
    ' float nv=max(dot(N,V),0.0);vec3 R=reflect(-V,N);' +
    ' vec3 alb=uCol.rgb;vec3 f0=mix(vec3(0.04),alb,uMet);' +
    ' vec3 F=f0+(max(vec3(1.0-uRou),f0)-f0)*pow(1.0-nv,5.0);' +
    ' vec3 spec=F*env(R,uRou);' +
    ' vec3 dif=alb*(1.0-uMet)*(env(N,1.0)*0.55+vec3(0.06));' +
    ' vec3 c=dif*(1.0-F)+spec;' +
    ' c=c*(2.51*c+0.03)/(c*(2.43*c+0.59)+0.14);c=pow(clamp(c,0.0,1.0),vec3(1.0/2.2));' +
    ' float a=uCol.a;if(uBlend>0.5){a=a+(1.0-a)*clamp(max(F.r,max(F.g,F.b))*1.4,0.0,1.0);}' +
    ' gl_FragColor=vec4(c,a);}';

  function compile(gl, type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }

  /* ---------- model decode ---------- */
  function decode(b64) {
    var bin = atob(b64), n = bin.length, u8 = new Uint8Array(n); for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    var dv = new DataView(u8.buffer), hl = dv.getUint32(0, true);
    var hb = u8.subarray(4, 4 + hl), head = JSON.parse((typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(hb) : decodeURIComponent(escape(String.fromCharCode.apply(null, hb)))).replace(/[\0\s]+$/, ''));
    var off = 4 + hl, p4 = function (x) { return (x + 3) & ~3; };
    head.parts.forEach(function (p) {
      var nv = p.nv, ni = p.ni;
      p.pos = new Int16Array(u8.buffer.slice(off, off + nv * 6)); off += p4(nv * 6);
      p.nrm = new Int8Array(u8.buffer.slice(off, off + nv * 3)); off += p4(nv * 3);
      p.idx = new Uint16Array(u8.buffer.slice(off, off + ni * 2)); off += p4(ni * 2);
    });
    return head;
  }

  function Viewer(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }) ||
             canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
    if (!gl) { var e = new Error('nowebgl'); e.code = 'nowebgl'; throw e; }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aP'); gl.bindAttribLocation(prog, 1, 'aN'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    var U = {}; ['uMVP', 'uM', 'uMir', 'uCam', 'uCol', 'uMet', 'uRou', 'uBlend'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);

    var bg = opts.background || [0.96, 0.96, 0.97];
    var model = null, parts = [], half = 1;
    var cam = { yaw: 0.55, pitch: 0.16, dist: 3.4, tYaw: 0.55, tPitch: 0.16, tDist: 3.4, vYaw: 0, vPitch: 0 };
    var MIN_D = 1.0, MAX_D = 9, FIT = 5.0, auto = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var raf = 0, last = 0, alive = true, dirty = true, interacted = false;
    var ptrs = {}, pinch0 = 0, dist0 = 0;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      dirty = true;
    }

    function fit() { var a = canvas.clientWidth / Math.max(1, canvas.clientHeight), t = Math.tan(0.21), th = Math.min(t * a, t * 1.6); FIT = Math.max(3.4, 1.3 / th); MAX_D = FIT * 1.9; if (!interacted) { cam.tDist = cam.dist = FIT; } dirty = true; }
    function load(key) {
      var data = NS.models[key]; if (!data) throw new Error('model missing: ' + key);
      model = decode(data); half = model.half;
      parts.forEach(function (p) { gl.deleteBuffer(p.bp); gl.deleteBuffer(p.bn); gl.deleteBuffer(p.bi); });
      parts = model.parts.map(function (p) {
        var m = model.mats[p.mat], bp = gl.createBuffer(), bn = gl.createBuffer(), bi = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, p.pos, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, p.nrm, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.idx, gl.STATIC_DRAW);
        // part centre (for sorting transparent parts)
        var cx = 0, cy = 0, cz = 0, n = p.nv; for (var i = 0; i < n; i += Math.max(1, (n / 200) | 0)) { cx += p.pos[i * 3]; cy += p.pos[i * 3 + 1]; cz += p.pos[i * 3 + 2]; } var s = Math.ceil(n / Math.max(1, (n / 200) | 0));
        return { bp: bp, bn: bn, bi: bi, ni: p.ni, mirror: p.mirror, blend: m.blend, col: [srgb2lin(m.c[0]), srgb2lin(m.c[1]), srgb2lin(m.c[2]), m.c[3]], met: m.m, rou: Math.max(m.blend ? 0.22 : 0.04, m.r), c: [cx / s / 32767, cy / s / 32767, cz / s / 32767] };
      });
      fit(); dirty = true; start();
    }

    function draw(part, M, MVP, mir, cull) {
      gl.uniformMatrix4fv(U.uM, false, M); gl.uniformMatrix4fv(U.uMVP, false, MVP); gl.uniform1f(U.uMir, mir);
      gl.frontFace(mir < 0 ? gl.CW : gl.CCW);
      gl.cullFace(cull);
      gl.drawElements(gl.TRIANGLES, part.ni, gl.UNSIGNED_SHORT, 0);
    }

    function render() {
      resize();
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!parts.length) return;
      var cp = Math.cos(cam.pitch), eye = [Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, Math.cos(cam.yaw) * cp * cam.dist];
      var view = lookAt(eye, [0, 0, 0], [0, 1, 0]), proj = persp(0.42, canvas.width / canvas.height, 0.1, 40), VP = mul(proj, view);
      var scale = 1;  // model space is [-1,1]^3 * half -> normalised to unit size
      var M = diag(scale, scale, scale), Mm = diag(-scale, scale, scale);
      // normalised coordinates: positions are int16/32767 in [-1,1]; the longest side spans 2 units.
      var MVP = mul(VP, M), MVPm = mul(VP, Mm);
      gl.uniform3f(U.uCam, eye[0], eye[1], eye[2]);
      gl.depthMask(true); gl.disable(gl.BLEND);
      var op = [], bl = [];
      parts.forEach(function (p) { (p.blend ? bl : op).push(p); });
      function bindAndDraw(p, back) {
        gl.bindBuffer(gl.ARRAY_BUFFER, p.bp); gl.vertexAttribPointer(0, 3, gl.SHORT, true, 6, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.bn); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 3, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.bi);
        gl.uniform4fv(U.uCol, p.col); gl.uniform1f(U.uMet, p.met); gl.uniform1f(U.uRou, p.rou); gl.uniform1f(U.uBlend, p.blend ? 1 : 0);
        var cull = back ? gl.FRONT : gl.BACK;
        draw(p, M, MVP, 1, cull);
        if (p.mirror) draw(p, Mm, MVPm, -1, cull);
      }
      op.forEach(function (p) { bindAndDraw(p, false); });
      if (bl.length) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        // far-to-near by part centre (mirrored twins share a centre mirrored in x – use the nearer one for the pair)
        bl.sort(function (a, b) { return Math.hypot(b.c[0] - eye[0], b.c[1] - eye[1], b.c[2] - eye[2]) - Math.hypot(a.c[0] - eye[0], a.c[1] - eye[1], a.c[2] - eye[2]); });
        bl.forEach(function (p) { bindAndDraw(p, true); });   // back faces first
        bl.forEach(function (p) { bindAndDraw(p, false); });  // then front faces
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      gl.frontFace(gl.CCW);
    }

    function frame(t) {
      raf = 0; if (!alive) return;
      var dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      var moving = false;
      if (auto && !interacted) { cam.tYaw += dt * 0.35; moving = true; }
      if (Math.abs(cam.vYaw) > 1e-4 || Math.abs(cam.vPitch) > 1e-4) { cam.tYaw += cam.vYaw; cam.tPitch += cam.vPitch; cam.vYaw *= 0.92; cam.vPitch *= 0.92; moving = true; }
      cam.tPitch = Math.max(-1.35, Math.min(1.35, cam.tPitch)); cam.tDist = Math.max(MIN_D, Math.min(MAX_D, cam.tDist));
      var k = 1 - Math.pow(0.0008, dt * 1.0 + 1e-4);
      var dy = cam.tYaw - cam.yaw, dp = cam.tPitch - cam.pitch, dd = cam.tDist - cam.dist;
      if (Math.abs(dy) > 1e-4 || Math.abs(dp) > 1e-4 || Math.abs(dd) > 1e-4) { cam.yaw += dy * k; cam.pitch += dp * k; cam.dist += dd * k; moving = true; }
      if (moving || dirty) { render(); dirty = false; }
      if (moving || dirty) raf = requestAnimationFrame(frame); else last = 0;
    }
    function start() { if (!raf && alive) raf = requestAnimationFrame(frame); }

    /* ---------- input: drag = orbit, wheel / pinch = zoom, double click = reset ---------- */
    function down(e) { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; interacted = true; cam.vYaw = cam.vPitch = 0;
      var ids = Object.keys(ptrs); if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = cam.tDist; } canvas.classList.add('is-drag'); }
    function move(e) {
      var p = ptrs[e.pointerId]; if (!p) return; var ids = Object.keys(ptrs);
      if (ids.length >= 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; p.x = e.clientX; p.y = e.clientY; var d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) cam.tDist = dist0 * pinch0 / Math.max(1, d); }
      else { var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; var s = 3.2 / Math.max(300, canvas.clientHeight);
        cam.tYaw -= dx * s; cam.tPitch += dy * s; cam.vYaw = -dx * s * 0.35; cam.vPitch = dy * s * 0.35; }
      start();
    }
    function up(e) { delete ptrs[e.pointerId]; pinch0 = 0; if (!Object.keys(ptrs).length) canvas.classList.remove('is-drag'); start(); }
    function wheel(e) { e.preventDefault(); interacted = true; var f = Math.exp((e.deltaY * (e.ctrlKey ? 0.012 : 0.0016))); cam.tDist *= f; start(); }
    function dbl() { cam.tYaw = 0.55; cam.tPitch = 0.16; cam.tDist = FIT; interacted = true; start(); }
    function key(e) { var s = 0.12; if (e.key === 'ArrowLeft') cam.tYaw -= s; else if (e.key === 'ArrowRight') cam.tYaw += s; else if (e.key === 'ArrowUp') cam.tPitch += s; else if (e.key === 'ArrowDown') cam.tPitch -= s; else if (e.key === '+' || e.key === '=') cam.tDist *= 0.88; else if (e.key === '-') cam.tDist *= 1.12; else return; e.preventDefault(); interacted = true; start(); }
    canvas.style.touchAction = 'none'; canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('dblclick', dbl); canvas.addEventListener('keydown', key);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
    canvas.addEventListener('webglcontextrestored', function () { if (model) { var k = model.key; try { load(k); } catch (_) {} } });
    var onRs = function () { fit(); start(); }; var ro = window.ResizeObserver ? new ResizeObserver(onRs) : null; if (ro) ro.observe(canvas); else window.addEventListener('resize', onRs);

    return {
      load: load, resize: function () { dirty = true; start(); },
      setBackground: function (r, g, b) { bg = [r, g, b]; dirty = true; start(); },
      reset: dbl,
      setView: function (yaw, pitch, dist, instant) { interacted = true; cam.tYaw = yaw; cam.tPitch = pitch; cam.tDist = dist; if (instant) { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; } start(); },
      destroy: function () { alive = false; if (raf) cancelAnimationFrame(raf); parts.forEach(function (p) { gl.deleteBuffer(p.bp); gl.deleteBuffer(p.bn); gl.deleteBuffer(p.bi); }); if (ro) ro.disconnect(); var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
    };
  }
  NS.Viewer = Viewer;
})();
