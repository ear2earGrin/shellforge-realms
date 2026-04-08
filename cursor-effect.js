(function () {
    'use strict';

    // ── PIXEL PARTICLE CANVAS ────────────────────────────────────
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '9999',
    });
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const COLORS = ['#4ade80', '#4ade80', '#4ade80', '#86efac', '#bbf7d0', '#2cff9c', '#22d3ee'];
    const particles = [];
    let animId = null;
    let mx = -999, my = -999;

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function spawn(x, y, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.8 + Math.random() * 2.4;
            particles.push({
                x: x + (Math.random() - 0.5) * 6,
                y: y + (Math.random() - 0.5) * 6,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 0.5,
                life: 1,
                decay: 0.035 + Math.random() * 0.055,
                size: Math.random() < 0.5 ? 2 : (Math.random() < 0.7 ? 3 : 4),
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
            });
        }
    }

    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += 0.07;
            p.life -= p.decay;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            ctx.globalAlpha = p.life * p.life;
            ctx.fillStyle   = p.color;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        }
        ctx.globalAlpha = 1;
        animId = particles.length > 0 ? requestAnimationFrame(loop) : null;
    }

    function startLoop() {
        if (!animId) animId = requestAnimationFrame(loop);
    }

    // ── EVENT LISTENERS ─────────────────────────────────────────
    document.addEventListener('mousemove', (e) => {
        // Don't spawn particles when map modal is open
        const mapModal = document.getElementById('mapModal');
        if (mapModal && mapModal.classList.contains('active')) return;

        mx = e.clientX;
        my = e.clientY;

        // Spawn particles — more when hovering interactive elements
        const isHot = !!e.target.closest('a, button, .lore-card, .mech-btn, .artifact-card, .nav-btn');
        if (isHot) {
            if (Math.random() < 0.55) spawn(mx, my, 2);
        } else {
            if (Math.random() < 0.12) spawn(mx, my, 1);
        }
        startLoop();
    });

    // Burst on clicks
    document.addEventListener('click', (e) => {
        const mapModal = document.getElementById('mapModal');
        if (mapModal && mapModal.classList.contains('active')) return;

        const count = e.target.closest('.lore-card') ? 20
                    : e.target.closest('a, button')   ? 12
                    : 6;
        spawn(mx, my, count);
        startLoop();
    });
})();
