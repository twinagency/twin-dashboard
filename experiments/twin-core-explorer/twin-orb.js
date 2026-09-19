'use strict';
/** One source-derived Twin renderer for all viewports and the command icon.
 * Source: TwinAssistant.tsx, blob 83bb5068a6d4ab517a9ce810c16d4bdccaa515a7.
 * The uploaded recording is a reference only, not a shipped video or bitmap.
 */
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
  const satelliteData = Array.from({ length: 14 }, (_, i) => ({
    angle: (i / 14) * Math.PI * 2 + ((i * 7) % 5) * .11,
    distance: 1.38 + ((i * 13) % 7) * .12, elevation: Math.sin(i * 2.17) * .72,
    phase: ((i * 37) % 101) / 101, size: .1 + ((i * 11) % 5) * .012,
    speed: (i % 2 === 0 ? 1 : -1) * (.000035 + (i % 4) * .000009)
  }));
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
    const glow = c.createRadialGradient(cx, cy, radius * .08, cx, cy, radius * 1.28);
    glow.addColorStop(0, `rgba(224,247,255,${.08 + energy * .13})`);
    glow.addColorStop(.33, `rgba(56,189,248,${.065 + energy * .08})`);
    glow.addColorStop(.66, 'rgba(37,99,235,.03)'); glow.addColorStop(1, 'rgba(2,12,34,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(cx, cy, radius * 1.3, 0, Math.PI * 2); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter';
    const scanY = cy - radius + ((time * .035) % (radius * 2));
    const scanWidth = Math.sqrt(Math.max(0, radius ** 2 - (scanY - cy) ** 2));
    const scan = c.createLinearGradient(cx - scanWidth, scanY, cx + scanWidth, scanY);
    scan.addColorStop(0, 'rgba(56,189,248,0)'); scan.addColorStop(.5, 'rgba(224,247,255,.14)'); scan.addColorStop(1, 'rgba(56,189,248,0)');
    c.strokeStyle = scan; c.lineWidth = .7; c.beginPath(); c.moveTo(cx - scanWidth, scanY); c.lineTo(cx + scanWidth, scanY); c.stroke(); c.restore();
    c.save(); c.globalCompositeOperation = 'lighter';
    [
      { rx: 1.18, ry: .38, angle: -.44, speed: .018, alpha: .16 },
      { rx: 1.08, ry: .56, angle: .58, speed: -.011, alpha: .11 },
      { rx: .98, ry: .72, angle: -1.02, speed: .008, alpha: .08 }
    ].forEach((ring, i) => {
      c.save(); c.translate(cx, cy); c.rotate(ring.angle + yaw * .2);
      c.setLineDash(i === 1 ? [1.5, 5.5] : [3, 7]); c.lineDashOffset = time * ring.speed;
      c.strokeStyle = `rgba(103,232,249,${ring.alpha})`; c.lineWidth = i === 0 ? .7 : .5;
      c.beginPath(); c.ellipse(0, 0, radius * ring.rx, radius * ring.ry, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    });
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
      for (const [lw, alpha, rgb] of [[3.2, .2, '56,189,248'], [.82, .94, '248,254,255']]) {
        c.strokeStyle = `rgba(${rgb},${alpha * ba})`; c.lineWidth = lw; c.beginPath();
        for (let j = 0; j <= 8; j++) {
          const u = j / 8, a = start + (.5 + bolt * .12) * u;
          const jitter = j === 0 || j === 8 ? 0 : Math.sin(time * .026 + bolt * 17 + j * 9.4) * radius * .055;
          const r = radius * (1.01 + Math.sin(u * Math.PI) * .08) + jitter, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          j ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    }
    c.restore();
    const satelliteAlpha = .08 + (hover && !isMini ? .08 : 0), spread = .28;
    satelliteData.forEach(a => {
      const angle = a.angle + time * a.speed + yaw * .18, distance = radius * a.distance * spread;
      const depth = (Math.sin(angle * 1.3 + a.phase * 8) + 1) / 2;
      const x = cx + Math.cos(angle) * distance, y = cy + Math.sin(angle) * distance * .58 + a.elevation * radius * spread * .58;
      const nr = Math.max(4, radius * a.size * (.72 + depth * .38)), pulse = .55 + Math.abs(Math.sin(time * .0032 + a.phase * 14)) * .45;
      c.strokeStyle = `rgba(45,190,255,${satelliteAlpha * (.09 + depth * .16)})`; c.lineWidth = .55;
      c.beginPath(); c.moveTo(cx + Math.cos(angle) * radius * .84, cy + Math.sin(angle) * radius * .32);
      c.quadraticCurveTo((cx + x) / 2, cy + a.elevation * radius * .24, x, y); c.stroke();
      const g = c.createRadialGradient(x, y, 0, x, y, nr * 2.7);
      g.addColorStop(0, `rgba(239,254,255,${satelliteAlpha * .9})`); g.addColorStop(.18, `rgba(34,211,238,${satelliteAlpha * .5})`); g.addColorStop(1, 'rgba(14,116,144,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, nr * 2.7, 0, Math.PI * 2); c.fill();
      c.save(); c.translate(x, y); c.rotate(angle * .7);
      c.strokeStyle = `rgba(165,243,252,${satelliteAlpha * (.34 + pulse * .3)})`; c.lineWidth = .55;
      c.beginPath(); c.ellipse(0, 0, nr * 1.85, nr * .62, 0, 0, Math.PI * 2); c.stroke(); c.rotate(1.04);
      c.beginPath(); c.ellipse(0, 0, nr * 1.55, nr * .52, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = `rgba(240,253,255,${satelliteAlpha})`; c.beginPath(); c.arc(0, 0, Math.max(1, nr * .16 * pulse), 0, Math.PI * 2); c.fill(); c.restore();
      const transfer = (time * .00022 + a.phase) % 1;
      c.fillStyle = `rgba(224,247,255,${satelliteAlpha * Math.sin(transfer * Math.PI) * .85})`;
      c.beginPath(); c.arc(cx + (x - cx) * transfer, cy + (y - cy) * transfer, .8 + depth * .8, 0, Math.PI * 2); c.fill();
    });
    for (let i = 0; i < 22; i++) {
      const dx = ((i * 47 + time * .004 * ((i % 3) + 1)) % (W + 20)) - 10, dy = ((i * 31 + Math.sin(time * .0008 + i) * 12) % H + H) % H;
      c.fillStyle = `rgba(186,230,253,${.05 + (i % 4) * .018})`; c.fillRect(dx, dy, .65, .65);
    }
    c.restore();
  }
  window.TwinOrbRenderer = Object.freeze({ revision: 'twin-source-video-2', sourceBlob: '83bb5068a6d4ab517a9ce810c16d4bdccaa515a7', particleCount: sphere.particles.length, linkCount: sphere.links.length, paint });
})();
