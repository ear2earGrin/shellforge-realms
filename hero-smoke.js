/*
 * Hero smoke — interactive WebGL fluid simulation for the Shellforge hero.
 * Inspired by Pavel Dobryakov's WebGL-Fluid-Simulation (MIT).
 *
 * Activates only on desktop (>=1024px) and when the user hasn't requested
 * reduced motion. Bails out silently on unsupported GPUs.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('hero-smoke-canvas');
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 1024) return;

    const config = {
        SIM_RESOLUTION: 128,
        DYE_RESOLUTION: 512,
        DENSITY_DISSIPATION: 0.985,
        VELOCITY_DISSIPATION: 0.985,
        PRESSURE: 0.8,
        PRESSURE_ITERATIONS: 20,
        CURL: 28,
        SPLAT_RADIUS: 0.22,
        SPLAT_FORCE: 5500,
        AMBIENT_INTERVAL_MS: 1400,
    };

    const ctxOpts = { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
    let gl = canvas.getContext('webgl2', ctxOpts);
    const isWebGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', ctxOpts) || canvas.getContext('experimental-webgl', ctxOpts);
    if (!gl) return;

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }
    const halfFloatType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
    if (!halfFloatType) return;

    const formatRGBA = getSupportedFormat(gl.RGBA16F || gl.RGBA, gl.RGBA, halfFloatType);
    const formatRG = getSupportedFormat(gl.RG16F || gl.RGBA, gl.RG || gl.RGBA, halfFloatType);
    const formatR = getSupportedFormat(gl.R16F || gl.RGBA, gl.RED || gl.RGBA, halfFloatType);
    if (!formatRGBA) return;

    function getSupportedFormat(internalFormat, format, type) {
        if (!isWebGL2) return { internalFormat: gl.RGBA, format: gl.RGBA };
        if (!supportRenderTextureFormat(internalFormat, format, type)) {
            if (internalFormat === gl.R16F) return getSupportedFormat(gl.RG16F, gl.RG, type);
            if (internalFormat === gl.RG16F) return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
            return null;
        }
        return { internalFormat, format };
    }
    function supportRenderTextureFormat(internalFormat, format, type) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        return status === gl.FRAMEBUFFER_COMPLETE;
    }

    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('shader compile error:', gl.getShaderInfoLog(s));
        }
        return s;
    }
    function program(vsrc, fsrc) {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vsrc));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsrc));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error('link error:', gl.getProgramInfoLog(p));
        const uniforms = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
            const name = gl.getActiveUniform(p, i).name;
            uniforms[name] = gl.getUniformLocation(p, name);
        }
        return { program: p, uniforms, bind() { gl.useProgram(p); } };
    }

    const baseVS = `
        precision highp float;
        attribute vec2 aPos;
        varying vec2 vUv, vL, vR, vT, vB;
        uniform vec2 texel;
        void main() {
            vUv = aPos * 0.5 + 0.5;
            vL = vUv - vec2(texel.x, 0.0);
            vR = vUv + vec2(texel.x, 0.0);
            vT = vUv + vec2(0.0, texel.y);
            vB = vUv - vec2(0.0, texel.y);
            gl_Position = vec4(aPos, 0.0, 1.0);
        }`;
    const copyFS = `precision mediump float; varying vec2 vUv; uniform sampler2D uTex; void main(){ gl_FragColor = texture2D(uTex, vUv); }`;
    const clearFS = `precision mediump float; varying vec2 vUv; uniform sampler2D uTex; uniform float value; void main(){ gl_FragColor = value * texture2D(uTex, vUv); }`;
    const splatFS = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTarget;
        uniform float aspectRatio;
        uniform vec3 color;
        uniform vec2 point;
        uniform float radius;
        void main() {
            vec2 p = vUv - point;
            p.x *= aspectRatio;
            vec3 splat = exp(-dot(p, p) / radius) * color;
            vec3 base = texture2D(uTarget, vUv).xyz;
            gl_FragColor = vec4(base + splat, 1.0);
        }`;
    const advectionFS = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform float dt;
        uniform float dissipation;
        void main() {
            vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
            gl_FragColor = dissipation * texture2D(uSource, coord);
            gl_FragColor.a = 1.0;
        }`;
    const divergenceFS = `
        precision mediump float;
        varying vec2 vUv, vL, vR, vT, vB;
        uniform sampler2D uVelocity;
        void main() {
            float L = texture2D(uVelocity, vL).x;
            float R = texture2D(uVelocity, vR).x;
            float T = texture2D(uVelocity, vT).y;
            float B = texture2D(uVelocity, vB).y;
            vec2 C = texture2D(uVelocity, vUv).xy;
            if (vL.x < 0.0) L = -C.x;
            if (vR.x > 1.0) R = -C.x;
            if (vT.y > 1.0) T = -C.y;
            if (vB.y < 0.0) B = -C.y;
            gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
        }`;
    const curlFS = `
        precision mediump float;
        varying vec2 vL, vR, vT, vB;
        uniform sampler2D uVelocity;
        void main() {
            float L = texture2D(uVelocity, vL).y;
            float R = texture2D(uVelocity, vR).y;
            float T = texture2D(uVelocity, vT).x;
            float B = texture2D(uVelocity, vB).x;
            gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
        }`;
    const vorticityFS = `
        precision highp float;
        varying vec2 vUv, vL, vR, vT, vB;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curl;
        uniform float dt;
        void main() {
            float L = texture2D(uCurl, vL).x;
            float R = texture2D(uCurl, vR).x;
            float T = texture2D(uCurl, vT).x;
            float B = texture2D(uCurl, vB).x;
            float C = texture2D(uCurl, vUv).x;
            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force /= length(force) + 0.0001;
            force *= curl * C;
            force.y *= -1.0;
            vec2 vel = texture2D(uVelocity, vUv).xy + force * dt;
            vel = clamp(vel, -1000.0, 1000.0);
            gl_FragColor = vec4(vel, 0.0, 1.0);
        }`;
    const pressureFS = `
        precision mediump float;
        varying vec2 vUv, vL, vR, vT, vB;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;
        void main() {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            float div = texture2D(uDivergence, vUv).x;
            gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
        }`;
    const gradientSubtractFS = `
        precision mediump float;
        varying vec2 vUv, vL, vR, vT, vB;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;
        void main() {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            vec2 vel = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
            gl_FragColor = vec4(vel, 0.0, 1.0);
        }`;
    const displayFS = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        void main() {
            vec3 c = texture2D(uTex, vUv).rgb;
            float a = clamp(max(c.r, max(c.g, c.b)) * 1.1, 0.0, 1.0);
            gl_FragColor = vec4(c, a);
        }`;

    const copyProg = program(baseVS, copyFS);
    const clearProg = program(baseVS, clearFS);
    const splatProg = program(baseVS, splatFS);
    const advProg = program(baseVS, advectionFS);
    const divProg = program(baseVS, divergenceFS);
    const curlProg = program(baseVS, curlFS);
    const vortProg = program(baseVS, vorticityFS);
    const pressProg = program(baseVS, pressureFS);
    const gradProg = program(baseVS, gradientSubtractFS);
    const dispProg = program(baseVS, displayFS);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    [copyProg, clearProg, splatProg, advProg, divProg, curlProg, vortProg, pressProg, gradProg, dispProg].forEach(p => {
        gl.bindAttribLocation(p.program, 0, 'aPos');
    });

    function createFBO(w, h, internalFormat, format, type, param) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return { tex, fbo, width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
    }
    function createDoubleFBO(w, h, internalFormat, format, type, param) {
        let a = createFBO(w, h, internalFormat, format, type, param);
        let b = createFBO(w, h, internalFormat, format, type, param);
        return {
            width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
            get read() { return a; }, set read(v) { a = v; },
            get write() { return b; }, set write(v) { b = v; },
            swap() { const t = a; a = b; b = t; }
        };
    }

    let dye, velocity, divergence, curlFBO, pressure;
    function initFBOs() {
        const simRes = getRes(config.SIM_RESOLUTION);
        const dyeRes = getRes(config.DYE_RESOLUTION);
        const filter = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
        gl.disable(gl.BLEND);
        dye = createDoubleFBO(dyeRes.w, dyeRes.h, formatRGBA.internalFormat, formatRGBA.format, halfFloatType, filter);
        velocity = createDoubleFBO(simRes.w, simRes.h, (formatRG || formatRGBA).internalFormat, (formatRG || formatRGBA).format, halfFloatType, filter);
        divergence = createFBO(simRes.w, simRes.h, (formatR || formatRGBA).internalFormat, (formatR || formatRGBA).format, halfFloatType, gl.NEAREST);
        curlFBO = createFBO(simRes.w, simRes.h, (formatR || formatRGBA).internalFormat, (formatR || formatRGBA).format, halfFloatType, gl.NEAREST);
        pressure = createDoubleFBO(simRes.w, simRes.h, (formatR || formatRGBA).internalFormat, (formatR || formatRGBA).format, halfFloatType, gl.NEAREST);
    }
    function getRes(res) {
        const ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
        const min = Math.round(res);
        const max = Math.round(res * (ar > 1 ? ar : 1 / ar));
        return ar > 1 ? { w: max, h: min } : { w: min, h: max };
    }

    function blit(target) {
        if (target) { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
        else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = Math.floor(canvas.clientWidth * dpr);
        const h = Math.floor(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            initFBOs();
        }
    }

    const pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false, color: [0, 0, 0] };
    function smokeColor() {
        // Cool desaturated tones — soft blue / teal / off-white. Stays out of the red-green palette.
        const h = 0.55 + (Math.random() - 0.5) * 0.12;
        const s = 0.18 + Math.random() * 0.18;
        const v = 0.85 + Math.random() * 0.15;
        return hsvToRgb(h, s, v).map(c => c * 0.18);
    }
    function hsvToRgb(h, s, v) {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: return [v, t, p];
            case 1: return [q, v, p];
            case 2: return [p, v, t];
            case 3: return [p, q, v];
            case 4: return [t, p, v];
            case 5: return [v, p, q];
        }
    }

    function splat(x, y, dx, dy, color) {
        splatProg.bind();
        gl.uniform1i(splatProg.uniforms.uTarget, velocity.read.attach(0));
        gl.uniform1f(splatProg.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(splatProg.uniforms.point, x, y);
        gl.uniform3f(splatProg.uniforms.color, dx, dy, 0);
        gl.uniform1f(splatProg.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100));
        blit(velocity.write); velocity.swap();
        gl.uniform1i(splatProg.uniforms.uTarget, dye.read.attach(0));
        gl.uniform3f(splatProg.uniforms.color, color[0], color[1], color[2]);
        blit(dye.write); dye.swap();
    }
    function correctRadius(r) {
        const ar = canvas.width / canvas.height;
        return ar > 1 ? r * ar : r;
    }

    function step(dt) {
        gl.disable(gl.BLEND);
        // curl
        curlProg.bind();
        gl.uniform2f(curlProg.uniforms.texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0));
        blit(curlFBO);
        // vorticity
        vortProg.bind();
        gl.uniform2f(vortProg.uniforms.texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(vortProg.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(vortProg.uniforms.uCurl, curlFBO.attach(1));
        gl.uniform1f(vortProg.uniforms.curl, config.CURL);
        gl.uniform1f(vortProg.uniforms.dt, dt);
        blit(velocity.write); velocity.swap();
        // divergence
        divProg.bind();
        gl.uniform2f(divProg.uniforms.texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(divProg.uniforms.uVelocity, velocity.read.attach(0));
        blit(divergence);
        // clear pressure (dampen)
        clearProg.bind();
        gl.uniform1i(clearProg.uniforms.uTex, pressure.read.attach(0));
        gl.uniform1f(clearProg.uniforms.value, config.PRESSURE);
        blit(pressure.write); pressure.swap();
        // pressure iterations
        pressProg.bind();
        gl.uniform2f(pressProg.uniforms.texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(pressProg.uniforms.uDivergence, divergence.attach(0));
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(pressProg.uniforms.uPressure, pressure.read.attach(1));
            blit(pressure.write); pressure.swap();
        }
        // subtract gradient
        gradProg.bind();
        gl.uniform2f(gradProg.uniforms.texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(gradProg.uniforms.uPressure, pressure.read.attach(0));
        gl.uniform1i(gradProg.uniforms.uVelocity, velocity.read.attach(1));
        blit(velocity.write); velocity.swap();
        // advect velocity
        advProg.bind();
        gl.uniform2f(advProg.uniforms.texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform2f(advProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        const velId = velocity.read.attach(0);
        gl.uniform1i(advProg.uniforms.uVelocity, velId);
        gl.uniform1i(advProg.uniforms.uSource, velId);
        gl.uniform1f(advProg.uniforms.dt, dt);
        gl.uniform1f(advProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
        blit(velocity.write); velocity.swap();
        // advect dye
        gl.uniform2f(advProg.uniforms.texelSize, dye.texelSizeX, dye.texelSizeY);
        gl.uniform1i(advProg.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(advProg.uniforms.uSource, dye.read.attach(1));
        gl.uniform1f(advProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
        blit(dye.write); dye.swap();
    }

    function render() {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        dispProg.bind();
        gl.uniform1i(dispProg.uniforms.uTex, dye.read.attach(0));
        blit(null);
    }

    let lastT = performance.now();
    function frame() {
        resize();
        const now = performance.now();
        const dt = Math.min((now - lastT) / 1000, 1 / 30);
        lastT = now;
        if (pointer.moved) {
            pointer.moved = false;
            splat(pointer.x, pointer.y, pointer.dx * config.SPLAT_FORCE, pointer.dy * config.SPLAT_FORCE, pointer.color);
        }
        step(dt);
        render();
        requestAnimationFrame(frame);
    }

    // Ambient splats — gentle motion even when cursor is idle, like xAI.
    function ambient() {
        const cx = 0.85 + (Math.random() - 0.5) * 0.1;
        const cy = 0.4 + (Math.random() - 0.5) * 0.3;
        const dx = (-200 - Math.random() * 200);
        const dy = (Math.random() - 0.5) * 100;
        splat(cx, cy, dx, dy, smokeColor());
        setTimeout(ambient, config.AMBIENT_INTERVAL_MS + Math.random() * 800);
    }

    function bindEvents() {
        const hero = canvas.parentElement;
        hero.addEventListener('pointermove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = 1 - (e.clientY - rect.top) / rect.height;
            pointer.dx = (nx - pointer.x) * 8;
            pointer.dy = (ny - pointer.y) * 8;
            pointer.x = nx;
            pointer.y = ny;
            pointer.moved = Math.abs(pointer.dx) > 0.0001 || Math.abs(pointer.dy) > 0.0001;
            if (pointer.moved) pointer.color = smokeColor();
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) lastT = performance.now();
        });
    }

    resize();
    initFBOs();
    bindEvents();
    // Seed a few splats so it's already moving on load.
    for (let i = 0; i < 6; i++) {
        splat(0.7 + Math.random() * 0.25, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 800, (Math.random() - 0.5) * 800, smokeColor());
    }
    setTimeout(ambient, 600);
    requestAnimationFrame(frame);
})();
