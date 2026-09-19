'use strict';
/* Twin network renderer with clean white exterior. Original geometry, palette and drift. */
(() => {
  function makeSphere(count) {
    const particles = [], links = [], used = new Set();
    const g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - ((i + .5) / count) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y)), theta = g * i;
      particles.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r, size: .6 + ((i * 17) % 11) / 10, phase: ((i * 29) % 101) / 101 });
    }
    particles.forEach((p, i) => {
      particles.map((q, j) => ({ j, d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2 }))
        .filter(x => x.j !== i).sort((a, b) => a.d - b.d).slice(0, i % 5 === 0 ? 5 : 4)
        .forEach(({ j }) => {
          const a = Math.min(i, j), b = Math.max(i, j), key = `${a}:${b}`;
          if (!used.has(key)) { used.add(key); links.push({ a, b, phase: ((a * 13 + b * 31) % 97) / 97 }); }
        });
    });
    return { particles, links };
  }
  const sphere = makeSphere(216);
  function paint(context, pixelW, pixelH, ratio, time, rotation, reducedMotion, energy, impulse, isMini, settings = {}) {
    if (!context || pixelW <= 0 || pixelH <= 0) return;
    const pointer = settings.pointer || { x: 0, y: 0 };
    const hover = Boolean(settings.hover);
    const scale = Number.isFinite(settings.scale) ? settings.scale : 1;
    const frozen = reducedMotion, mode = settings.mode || 'idle';
    const c = context, s = Math.min(pixelW, pixelH) / 86 * (Number.isFinite(settings.fit) ? settings.fit : 1);
    const W = 118, H = 86, cx = W / 2, cy = H * .47;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.clearRect(0, 0, pixelW, pixelH);
    c.translate(pixelW / 2 - cx * s, pixelH / 2 - cy * s); c.scale(s, s);
    const yaw = isMini ? 0 : pointer.x * (hover ? .28 : .06);
    const tilt = -.16 + (isMini ? 0 : pointer.y * (hover ? .2 : .04));
    const breathe = frozen ? 1 : 1 + Math.sin(time * .0018) * .018;
    const radius = Math.min(W * .345, H * .405) * breathe * (isMini ? 1 : scale) * (1 + energy * .105 + Math.sin(impulse * Math.PI) * .025);
    // Inner illumination stays inside the sphere; no exterior halo.
    c.save(); c.beginPath(); c.arc(cx, cy, radius * .88, 0, Math.PI * 2); c.clip();
    const glow = c.createRadialGradient(cx, cy, radius * .08, cx, cy, radius * 1.28);
    glow.addColorStop(0, `rgba(224,247,255,${.08 + energy * .13})`);
    glow.addColorStop(.33, `rgba(56,189,248,${.065 + energy * .08})`);
    glow.addColorStop(.66, 'rgba(37,99,235,.03)'); glow.addColorStop(1, 'rgba(2,12,34,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(cx, cy, radius * 1.3, 0, Math.PI * 2); c.fill(); c.restore();
    c.save(); c.globalCompositeOperation = 'lighter';
    const scanY = cy - radius + ((time * .035) % (radius * 2));
    const scanWidth = Math.sqrt(Math.max(0, radius ** 2 - (scanY - cy) ** 2));
    const scan = c.createLinearGradient(cx - scanWidth, scanY, cx + scanWidth, scanY);
    scan.addColorStop(0, 'rgba(56,189,248,0)'); scan.addColorStop(.5, 'rgba(224,247,255,.14)'); scan.addColorStop(1, 'rgba(56,189,248,0)');
    c.strokeStyle = scan; c.lineWidth = .7; c.beginPath(); c.moveTo(cx - scanWidth, scanY); c.lineTo(cx + scanWidth, scanY); c.stroke(); c.restore();
    c.save(); c.globalCompositeOperation = 'lighter';
    const co = Math.cos(rotation + yaw), si = Math.sin(rotation + yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const projected = sphere.particles.map(p => {
      const drift = frozen ? 1 : 1 + Math.sin(time * .0014 + p.phase * 12) * .022;
      const px = p.x * drift, py = p.y * drift, pz = p.z * drift;
      const x1 = px * co - pz * si, z1 = px * si + pz * co;
      const y2 = py * ct - z1 * st, z2 = py * st + z1 * ct, perspective = 1 / (1.14 - z2 * .22);
      return { x: cx + x1 * radius * perspective, y: cy + y2 * radius * perspective, z: z2, perspective, p };
    });
    const modeEnergy = mode === 'processing' ? 1.9 : mode === 'listening' || mode === 'speaking' ? 1.3 + energy : hover && !isMini ? 1.18 : 1;
    sphere.links.forEach(link => {
      const a = projected[link.a], b = projected[link.b], depth = Math.max(.12, (a.z + b.z + 2) / 4);
      c.strokeStyle = `rgba(45,190,255,${Math.min(.86, (.15 + depth * .2) * modeEnergy)})`; c.lineWidth = .62;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    });
    projected.forEach(({ x, y, z, perspective, p }) => {
      const depth = Math.max(.25, (z + 1.2) / 2.2);
      c.fillStyle = `rgba(${z > .25 ? '238,252,255' : '103,232,249'},${Math.min(.95, .38 + depth * .56)})`;
      c.beginPath(); c.arc(x, y, Math.max(.62, p.size * perspective * depth * 1.08), 0, Math.PI * 2); c.fill();
    });
    c.save(); c.globalCompositeOperation = 'lighter';
    // Keep the white glints and fine electrical flashes tight to the shell.
    c.beginPath(); c.arc(cx, cy, radius * .91, 0, Math.PI * 2); c.clip();
    for (let i = 0; i < 5; i++) {
      const a = rotation * (i % 2 === 0 ? 1.4 : -1.1) + i * 2.17;
      const x = cx + Math.cos(a) * radius * (.72 + (i % 3) * .08), y = cy + Math.sin(a) * radius * (.72 + (i % 3) * .08);
      const p = .32 + Math.abs(Math.sin(time * .0028 + i * 1.9)) * .42, r = 2.4 + p * 3.4;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${p * .82})`); g.addColorStop(.2, `rgba(224,247,255,${p * .62})`); g.addColorStop(1, 'rgba(56,189,248,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    for (let bolt = 0; bolt < 3; bolt++) {
      const life = (time * .00042 + bolt * .31) % 1, ba = Math.sin(life * Math.PI) * (.28 + (bolt % 2) * .14);
      if (ba < .05) continue;
      const start = rotation * (bolt % 2 === 0 ? 1.6 : -1.25) + bolt * 2.11 + life * .42;
      for (const [lw, alpha, rgb] of [[.6, .32, '56,189,248'], [.35, .94, '248,254,255']]) {
        c.strokeStyle = `rgba(${rgb},${alpha * ba})`; c.lineWidth = lw; c.beginPath();
        for (let j = 0; j <= 8; j++) {
          const u = j / 8, a = start + (.5 + bolt * .12) * u;
          const jitter = j === 0 || j === 8 ? 0 : Math.sin(time * .026 + bolt * 17 + j * 9.4) * radius * .014;
          const r = radius * (.87 + Math.sin(u * Math.PI) * .015) + jitter, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          j ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    }
    c.restore(); c.restore();
  }
  window.TwinOrbRenderer = Object.freeze({ revision: 'twin-source-clean-shell-3', sourceBlob: '83bb5068a6d4ab517a9ce810c16d4bdccaa515a7', particleCount: sphere.particles.length, linkCount: sphere.links.length, paint });
})();
