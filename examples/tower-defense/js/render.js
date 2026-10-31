/* 渲染层：把纯逻辑状态画到 canvas 上。
 * 性能策略：地形（草地/道路/石台/障碍）在切关时一次性烘焙进离屏画布，
 * 每帧只做「一次 blit + 动态图层」；粒子/文字按 FX 档位降级；离屏实体裁剪。
 * 相机：letterbox 适配 + 捏合缩放（fit..2.6x）+ 边界钳制。渲染层只读状态，不改状态。 */
import {
  TILE, GRID_W, GRID_H, MAP_W, MAP_H, CELL, THEME_DEFAULT, TAU,
  clamp, DPR_MAX, FX_LEVELS, mulberry32, seedOf,
} from './config.js';
import { statsOf, rangePx, pathPos } from './engine.js';

const MAX_ZOOM = 2.6;

/* ---------------- 地形烘焙 ---------------- */
function grassTile(g, theme, rng, x, y, pad) {
  const px = x * TILE, py = y * TILE;
  g.fillStyle = ((x + y) & 1) ? theme.grass : theme.grass2;
  g.fillRect(px, py, TILE, TILE);
  const n = 3 + ((rng() * 4) | 0);
  g.globalAlpha = 0.10;
  for (let i = 0; i < n; i++) {
    const rx = px + rng() * TILE, ry = py + rng() * TILE, r = 2 + rng() * 5;
    g.fillStyle = rng() > 0.5 ? '#ffffff' : '#000000';
    g.beginPath(); g.arc(rx, ry, r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  if (pad) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(px + 6, py + 6, TILE - 12, TILE - 12);
    g.fillStyle = theme.rock;
    g.fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 2;
    g.strokeRect(px + 8.5, py + 8.5, TILE - 17, TILE - 17);
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.beginPath();
    g.moveTo(px + 12, py + TILE / 2); g.lineTo(px + TILE - 12, py + TILE / 2);
    g.moveTo(px + TILE / 2, py + 12); g.lineTo(px + TILE / 2, py + TILE - 12);
    g.stroke();
  }
}

function rockDecor(g, theme, rng, x, y) {
  const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
  g.fillStyle = 'rgba(0,0,0,.34)';
  g.beginPath(); g.ellipse(cx, cy + 12, TILE * 0.36, TILE * 0.16, 0, 0, TAU); g.fill();
  const n = 2 + ((rng() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const rx = cx + (rng() - 0.5) * TILE * 0.4, ry = cy + (rng() - 0.5) * TILE * 0.3;
    const r = TILE * (0.14 + rng() * 0.14);
    g.fillStyle = i === 0 ? theme.rock : theme.b;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU, rr = r * (0.78 + rng() * 0.4);
      const fx = rx + Math.cos(a) * rr, fy = ry + Math.sin(a) * rr * 0.82;
      if (k === 0) g.moveTo(fx, fy); else g.lineTo(fx, fy);
    }
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.beginPath(); g.ellipse(rx - r * 0.2, ry - r * 0.3, r * 0.42, r * 0.24, -0.5, 0, TAU); g.fill();
  }
}

/** 一次性烘焙：草地 + 石台 + 障碍 + 道路 + 主题装饰 */
export function buildTerrain(st) {
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const g = c.getContext('2d');
  const theme = Object.assign({}, THEME_DEFAULT, st.level.theme || {});
  const gr = g.createLinearGradient(0, 0, MAP_W * 0.4, MAP_H);
  gr.addColorStop(0, theme.a); gr.addColorStop(1, theme.b);
  g.fillStyle = gr; g.fillRect(0, 0, MAP_W, MAP_H);

  const rng = mulberry32(seedOf(st.level.id * 31 + 5, 91));
  const grid = st.grid;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const cell = grid.at(x, y);
      if (cell === CELL.PATH) {
        g.fillStyle = theme.track;
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      } else grassTile(g, theme, rng, x, y, cell === CELL.PAD);
    }
  }
  /* 道路连边：把相邻道路缝起来，并给边界压暗，避免出现网格缝 */
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid.at(x, y) !== CELL.PATH) continue;
      const px = x * TILE, py = y * TILE;
      g.fillStyle = theme.track;
      if (grid.at(x + 1, y) === CELL.PATH) g.fillRect(px + TILE - 1, py, 2, TILE);
      if (grid.at(x, y + 1) === CELL.PATH) g.fillRect(px, py + TILE - 1, TILE, 2);
      g.fillStyle = 'rgba(0,0,0,.22)';
      if (grid.at(x + 1, y) !== CELL.PATH) g.fillRect(px + TILE - 3, py, 3, TILE);
      if (grid.at(x - 1, y) !== CELL.PATH) g.fillRect(px, py, 3, TILE);
      if (grid.at(x, y + 1) !== CELL.PATH) g.fillRect(px, py + TILE - 3, TILE, 3);
      if (grid.at(x, y - 1) !== CELL.PATH) g.fillRect(px, py, TILE, 3);
    }
  }
  g.strokeStyle = 'rgba(255,255,255,.13)';
  g.lineWidth = 3; g.setLineDash([14, 16]);
  for (const p of st.paths) {
    g.beginPath();
    p.segs.forEach((s, i) => { if (i === 0) g.moveTo(s.a.x, s.a.y); g.lineTo(s.b.x, s.b.y); });
    g.stroke();
  }
  g.setLineDash([]);

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) if (grid.at(x, y) === CELL.BLOCK) rockDecor(g, theme, rng, x, y);
  }
  if (theme.water) {
    g.globalAlpha = 0.5;
    for (let i = 0; i < 16; i++) {
      const wx = rng() * MAP_W, wy = rng() * MAP_H, ww = 30 + rng() * 90;
      g.strokeStyle = theme.water; g.lineWidth = 2;
      g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + ww / 2, wy - 5, wx + ww, wy); g.stroke();
    }
    g.globalAlpha = 1;
  }
  const vg = g.createRadialGradient(MAP_W / 2, MAP_H / 2, MAP_H * 0.34, MAP_W / 2, MAP_H / 2, MAP_H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.46)');
  g.fillStyle = vg; g.fillRect(0, 0, MAP_W, MAP_H);
  return c;
}

/* ---------------- 塔 ---------------- */
const TOWER_SKIN = {
  arrow: { c: '#8fd67f', barrel: 20, w: 4, shape: 'bow' },
  arcane: { c: '#b07cff', barrel: 0, w: 0, shape: 'orb' },
  frost: { c: '#7fd8ff', barrel: 12, w: 5, shape: 'spike' },
  forge: { c: '#f2c14e', barrel: 0, w: 0, shape: 'anvil' },
  venom: { c: '#7ee787', barrel: 14, w: 5, shape: 'jar' },
  javelin: { c: '#d9e3f2', barrel: 24, w: 3, shape: 'spear' },
  tesla: { c: '#8fc7ff', barrel: 0, w: 0, shape: 'coil' },
  flame: { c: '#ff8f3c', barrel: 18, w: 7, shape: 'nozzle' },
  cannon: { c: '#c0c8d4', barrel: 17, w: 10, shape: 'barrel' },
  sniper: { c: '#ffd27f', barrel: 28, w: 3, shape: 'scope' },
};

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

/** 塔身：10 种塔各有一套程序化形状，Lv3 带光环，开火有炮口闪光 */
function towerBody(g, t, st, skin, r) {
  if (skin.shape === 'orb' || skin.shape === 'coil' || skin.shape === 'anvil' || skin.shape === 'jar') {
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(0, r * 0.5, r * 0.8, r * 0.34, 0, 0, TAU); g.fill();
  }
  if (skin.shape === 'orb') {
    const pulse = 1 + Math.sin(st.time * 3 + t.uid) * 0.06;
    const gr = g.createRadialGradient(0, -r * 0.1, 1, 0, -r * 0.1, r * 0.8 * pulse);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, skin.c); gr.addColorStop(1, 'rgba(80,20,140,.25)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, -r * 0.1, r * 0.72 * pulse, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(0, -r * 0.1, r * 0.78 * pulse, r * 0.3 * pulse, st.time * 1.6, 0, TAU); g.stroke();
  } else if (skin.shape === 'coil') {
    g.strokeStyle = '#6b7b95'; g.lineWidth = 3;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(0, -i * 5 - 4, r * 0.5 - i * 2, 4, 0, 0, TAU); g.stroke(); }
    g.fillStyle = skin.c;
    g.beginPath(); g.arc(0, -r * 0.72, r * 0.24, 0, TAU); g.fill();
    if (t.cd < 0.12) {
      g.strokeStyle = 'rgba(200,230,255,.9)'; g.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const a = st.time * 9 + i * 2.1;
        g.beginPath(); g.moveTo(0, -r * 0.72);
        g.lineTo(Math.cos(a) * r * 0.6, -r * 0.72 + Math.sin(a) * r * 0.5); g.stroke();
      }
    }
  } else if (skin.shape === 'anvil') {
    g.fillStyle = '#4b5261';
    g.fillRect(-r * 0.62, -r * 0.28, r * 1.24, r * 0.62);
    g.fillRect(-r * 0.3, r * 0.2, r * 0.6, r * 0.42);
    g.fillStyle = skin.c;
    g.fillRect(-r * 0.66, -r * 0.42, r * 0.9, r * 0.16);
    const sp = (st.time * 2 + t.uid) % 1.6;
    if (sp < 0.7) {
      g.globalAlpha = 1 - sp / 0.7; g.fillStyle = skin.c;
      g.beginPath(); g.arc(r * 0.3, -r * 0.7 + sp * 12, 3.2, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
  } else if (skin.shape === 'jar') {
    g.fillStyle = '#3a4557';
    g.beginPath(); g.ellipse(0, 0, r * 0.6, r * 0.7, 0, 0, TAU); g.fill();
    g.fillStyle = skin.c; g.globalAlpha = 0.85;
    g.beginPath(); g.ellipse(0, r * 0.12, r * 0.42, r * 0.44, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#cfe8d0';
    g.beginPath(); g.arc(0, -r * 0.5, r * 0.16, 0, TAU); g.fill();
  } else {
    g.fillStyle = 'rgba(0,0,0,.32)';
    g.beginPath(); g.ellipse(0, r * 0.46, r * 0.78, r * 0.3, 0, 0, TAU); g.fill();
    g.fillStyle = '#3d4657';
    g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU); g.fill();
    g.save();
    g.rotate(t.aim);
    g.fillStyle = '#58637a';
    g.fillRect(-r * 0.2, -r * 0.24, r * 1.5, r * 0.48);
    g.fillStyle = skin.c;
    g.fillRect(r * 0.5, -skin.w * 0.5, skin.barrel, skin.w);
    if (skin.shape === 'bow' || skin.shape === 'spear') {
      g.strokeStyle = skin.c; g.lineWidth = 2.4;
      g.beginPath(); g.arc(r * 0.4, 0, r * 0.5, -1.1, 1.1); g.stroke();
    }
    if (skin.shape === 'scope') {
      g.fillStyle = '#8fb4ff';
      g.beginPath(); g.arc(r * 0.2, 0, r * 0.16, 0, TAU); g.fill();
    }
    if (skin.shape === 'nozzle') {
      g.fillStyle = '#ffd27f';
      g.beginPath(); g.arc(r * 0.5 + skin.barrel, 0, skin.w * 0.7, 0, TAU); g.fill();
    }
    if (t.flash > 0) {
      g.globalAlpha = clamp(t.flash * 5, 0, 1);
      g.fillStyle = '#fff3c4';
      g.beginPath(); g.arc(r * 0.5 + skin.barrel + 4, 0, 7 + t.flash * 22, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
    g.fillStyle = '#2c3444';
    g.beginPath(); g.arc(0, 0, r * 0.3, 0, TAU); g.fill();
  }
}

export function drawTower(g, st, t, sel) {
  const skin = TOWER_SKIN[t.id] || TOWER_SKIN.arrow;
  const r = TILE * 0.42;
  g.save();
  g.translate(t.px, t.py);
  if (sel) {
    g.strokeStyle = skin.c; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, r + 6, 0, TAU); g.stroke();
  }
  g.fillStyle = sel ? '#5a6a86' : '#48536a';
  roundRect(g, -r, -r * 0.86, r * 2, r * 1.8, 6); g.fill();
  g.fillStyle = 'rgba(255,255,255,.06)';
  roundRect(g, -r, -r * 0.86, r * 2, r * 0.6, 6); g.fill();
  towerBody(g, t, st, skin, r);
  for (let i = 0; i < t.lv; i++) {
    g.fillStyle = i === 2 ? '#ff9d4a' : i === 1 ? '#f2c14e' : '#9fb6d4';
    g.beginPath(); g.arc(-r + 6 + i * 7, r * 0.7, 2.6, 0, TAU); g.fill();
  }
  if (t.lv >= 3) {
    g.strokeStyle = 'rgba(255,157,74,.55)'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 0, r + 3, 0, TAU); g.stroke();
  }
  g.restore();
}

/* ---------------- 敌人 ---------------- */
const ELITE_RING = ['', '#f2c14e', '#ff6b6b'];
const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

export function drawEnemy(g, st, e, tier) {
  const size = e.size * TILE;
  g.save();
  g.translate(e.x, e.y);
  if (e.flying) {
    g.globalAlpha = 0.28; g.fillStyle = '#000000';
    g.beginPath(); g.ellipse(0, size * 0.9, size * 0.6, size * 0.24, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.translate(0, -size * 0.5 + Math.sin(st.time * 5 + e.uid) * 2);
  }
  if (e.hidden) g.globalAlpha = 0.34;
  if (e.shield > 0) {
    g.strokeStyle = 'rgba(143,199,255,.85)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, size * 1.22, 0, TAU); g.stroke();
  }
  if (e.elite) {
    g.strokeStyle = ELITE_RING[e.elite] || '#f2c14e';
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    const sp = st.time * (e.elite > 1 ? 1.6 : 0.9);
    g.beginPath(); g.arc(0, 0, size * 1.34, sp, sp + TAU); g.stroke();
    g.setLineDash([]);
  }
  g.rotate(e.ang);
  const col = e.def.color;
  const flash = e.flash > 0 ? clamp(e.flash * 8, 0, 1) : 0;
  g.fillStyle = flash > 0.4 ? '#ffffff' : col;
  const m = e.def.mechanic, s = size;
  if (e.boss) {
    g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.arc(0, 0, s * 0.62, 0, TAU); g.fill();
    g.fillStyle = flash > 0.4 ? '#ffffff' : '#ffe08a';
    for (let i = -1; i <= 1; i++) {
      g.save(); g.rotate(i * 0.5);
      g.beginPath(); g.moveTo(s * 0.9, -s * 0.16); g.lineTo(s * 1.42, 0); g.lineTo(s * 0.9, s * 0.16);
      g.closePath(); g.fill(); g.restore();
    }
    g.fillStyle = '#ff5a5a';
    g.beginPath(); g.arc(s * 0.28, -s * 0.22, s * 0.11, 0, TAU); g.fill();
  } else if (m.includes('flying')) {
    const wf = Math.sin(st.time * 14 + e.uid) * 0.5;
    g.beginPath(); g.ellipse(0, 0, s * 0.7, s * 0.42, 0, 0, TAU); g.fill();
    g.globalAlpha *= 0.72;
    for (const k of [1, -1]) {
      g.beginPath();
      g.moveTo(-s * 0.1, 0);
      g.quadraticCurveTo(-s * 0.5, k * s * (1.1 + wf), s * 0.5, k * s * 0.32);
      g.closePath(); g.fill();
    }
    g.globalAlpha = e.hidden ? 0.34 : 1;
  } else if (m.includes('mech') || e.id === 'tank') {
    roundRect(g, -s * 0.86, -s * 0.66, s * 1.72, s * 1.32, s * 0.24); g.fill();
    g.fillStyle = 'rgba(0,0,0,.3)';
    roundRect(g, -s * 0.4, -s * 0.36, s * 1.2, s * 0.72, s * 0.16); g.fill();
    g.fillStyle = '#cfd8e3';
    g.fillRect(s * 0.6, -s * 0.1, s * 0.6, s * 0.2);
  } else if (e.id === 'runner' || e.id === 'boar') {
    g.beginPath();
    g.moveTo(s * 1.05, 0); g.lineTo(-s * 0.6, -s * 0.62); g.lineTo(-s * 0.3, 0); g.lineTo(-s * 0.6, s * 0.62);
    g.closePath(); g.fill();
    if (e.id === 'boar') {
      g.fillStyle = '#f0e6d2';
      g.beginPath(); g.arc(s * 0.55, -s * 0.34, s * 0.14, 0, TAU); g.fill();
      g.beginPath(); g.arc(s * 0.55, s * 0.34, s * 0.14, 0, TAU); g.fill();
    }
  } else if (e.id === 'shieldman' || e.id === 'icekin') {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, rr = i % 2 ? s * 0.78 : s;
      const fx = Math.cos(a) * rr, fy = Math.sin(a) * rr;
      if (i === 0) g.moveTo(fx, fy); else g.lineTo(fx, fy);
    }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.4; g.stroke();
  } else {
    g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.beginPath(); g.arc(-s * 0.3, -s * 0.3, s * 0.34, 0, TAU); g.fill();
  }
  g.restore();

  g.save();
  g.translate(e.x, e.y);
  if (e.freezeT > 0) { g.fillStyle = 'rgba(127,216,255,.42)'; g.beginPath(); g.arc(0, 0, size * 1.1, 0, TAU); g.fill(); }
  else if (e.stunT > 0) { g.strokeStyle = '#ffe08a'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, size * 1.15, 0, TAU); g.stroke(); }
  else if (e.slowT > 0 && e.slowPct > 0.05) { g.strokeStyle = 'rgba(127,216,255,.6)'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 0, size * 1.15, 0, TAU); g.stroke(); }
  if (e.burnT > 0 && tier > 0) {
    g.fillStyle = 'rgba(255,143,60,.55)';
    for (let i = 0; i < 3; i++) {
      const a = st.time * 7 + i * 2.1;
      g.beginPath(); g.arc(Math.cos(a) * size * 0.7, -size * 0.9 + Math.sin(a) * 3, 2.6, 0, TAU); g.fill();
    }
  }
  if (e.poisonT > 0 && tier > 0) {
    g.fillStyle = 'rgba(126,231,135,.6)';
    g.beginPath(); g.arc(size * 0.7, -size * 0.7, 3, 0, TAU); g.fill();
  }
  const hpk = e.hpMax > 0 ? clamp(e.hp / e.hpMax, 0, 1) : 0;
  if (hpk < 1 || e.boss) {
    const w = Math.max(size * 1.9, 16), y = -size - (e.boss ? 14 : 8), hh = e.boss ? 5 : 3.2;
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(-w / 2, y, w, hh);
    g.fillStyle = e.boss ? '#ff6b6b' : hpk > 0.5 ? '#3ddc97' : hpk > 0.25 ? '#f2c14e' : '#ff6b6b';
    g.fillRect(-w / 2 + 0.5, y + 0.5, (w - 1) * hpk, hh - 1);
  }
  if (e.boss || e.elite > 1) {
    g.font = (e.boss ? '600 12px ' : '600 10px ') + FONT;
    g.textAlign = 'center';
    g.fillStyle = e.boss ? 'rgba(255,255,255,.9)' : '#ff9d4a';
    g.fillText(e.boss ? e.def.name : e.eliteName, 0, -size - (e.boss ? 20 : 12));
  }
  g.restore();
}

/* ---------------- 弹道 / 数字 ---------------- */
export function drawShots(g, st, tier) {
  for (const q of st.shots) {
    const col = q.color || '#ffd27f';
    g.save();
    g.translate(q.x, q.y);
    if (q.kind === 'arrow') {
      g.rotate(Math.atan2(q.vy, q.vx));
      g.strokeStyle = col; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(5, -1.2, 3, 2.4);
    } else if (q.kind === 'snipe') {
      g.fillStyle = '#fff8dc';
      g.beginPath(); g.arc(0, 0, 2.4, 0, TAU); g.fill();
    } else {
      const r = q.rad || 4;
      if (tier > 0) {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.globalAlpha = 0.5;
        g.beginPath(); g.arc(0, 0, r * 2.6, 0, TAU); g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = col;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    }
    g.restore();
  }
  for (const b of st.beams) {
    const k = clamp(b.t / b.life, 0, 1);
    g.save();
    g.globalAlpha = k;
    g.strokeStyle = b.color || '#fff2c4';
    g.lineWidth = Math.max(1, (b.w || 3) * k);
    g.beginPath();
    if (b.pts) {
      g.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) g.lineTo(b.pts[i].x, b.pts[i].y);
    } else { g.moveTo(b.x1, b.y1); g.lineTo(b.x2, b.y2); }
    g.stroke();
    g.restore();
  }
}

export function drawFloaters(g, st) {
  g.textAlign = 'center';
  g.font = '700 12px ' + FONT;
  for (const f of st.floaters) {
    const k = clamp(f.t / 0.7, 0, 1);
    g.globalAlpha = 1 - k;
    const col = f.type === 'fire' ? '#ff8f3c' : f.type === 'poison' ? '#7ee787' : f.type === 'magic' ? '#b07cff' : f.type === 'true' ? '#e9eef7' : '#ffd27f';
    const txt = String(Math.round(f.v));
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillText(txt, f.x + 1, f.y - k * 26 + 1);
    g.fillStyle = col;
    g.fillText(txt, f.x, f.y - k * 26);
  }
  g.globalAlpha = 1;
}

/* ---------------- 基地 / 出生点 / 流向 ---------------- */
export function drawBase(g, st) {
  const b = st.grid.base;
  const x = (b.x + 0.5) * TILE, y = (b.y + 0.5) * TILE;
  const pulse = 1 + Math.sin(st.time * 2.4) * 0.05;
  g.save();
  g.translate(x, y);
  g.strokeStyle = `rgba(242,193,78,${0.35 + 0.15 * Math.sin(st.time * 3)})`;
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, TILE * 0.9 * pulse, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.ellipse(0, TILE * 0.34, TILE * 0.5, TILE * 0.18, 0, 0, TAU); g.fill();
  const gr = g.createLinearGradient(0, -TILE * 0.5, 0, TILE * 0.4);
  gr.addColorStop(0, '#ffe08a'); gr.addColorStop(1, '#c9822a');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, -TILE * 0.52); g.lineTo(TILE * 0.34, -TILE * 0.1); g.lineTo(TILE * 0.22, TILE * 0.32);
  g.lineTo(-TILE * 0.22, TILE * 0.32); g.lineTo(-TILE * 0.34, -TILE * 0.1);
  g.closePath(); g.fill();
  g.fillStyle = st.hp / Math.max(1, st.hpMax) > 0.34 ? 'rgba(255,255,255,.55)' : 'rgba(255,120,120,.7)';
  g.beginPath(); g.arc(0, -TILE * 0.06, TILE * 0.12 * pulse, 0, TAU); g.fill();
  g.restore();
}

export function drawSpawns(g, st) {
  const pts = st.level.spawnPts || st.level.path.map((l) => l[0]);
  for (const sp of pts) {
    const arr = Array.isArray(sp) ? sp : [sp.x, sp.y];
    const x = (arr[0] + 0.5) * TILE, y = (arr[1] + 0.5) * TILE;
    g.save();
    g.translate(x, y);
    g.globalAlpha = 0.55 + 0.25 * Math.sin(st.time * 4);
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, TILE * 0.7);
    gr.addColorStop(0, 'rgba(255,110,110,.9)'); gr.addColorStop(1, 'rgba(255,60,60,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, TILE * 0.7, 0, TAU); g.fill();
    g.restore();
  }
}

/** 沿路径流动的方向箭头：让玩家一眼看出怪物往哪走 */
export function drawFlow(g, st) {
  const t = (st.time * 42) % 120;
  g.save();
  g.fillStyle = 'rgba(255,255,255,.16)';
  for (const p of st.paths) {
    for (let d = t; d < p.len; d += 120) {
      const pos = pathPos(p, d);
      g.save();
      g.translate(pos.x, pos.y);
      g.rotate(pos.ang);
      g.beginPath();
      g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5);
      g.closePath(); g.fill();
      g.restore();
    }
  }
  g.restore();
}

/* ---------------- 环境氛围 ---------------- */
export function drawEnv(g, st, w, h, tier) {
  const env = st.level.env, weather = st.level.weather;
  if (!env && !weather) return;
  g.save();
  if (env === 'night') {
    const gr = g.createRadialGradient(w * 0.5, h * 0.42, h * 0.2, w * 0.5, h * 0.5, h * 0.95);
    gr.addColorStop(0, 'rgba(10,16,32,.12)'); gr.addColorStop(1, 'rgba(4,8,18,.62)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  } else if (env === 'sandstorm') {
    g.fillStyle = 'rgba(216,196,140,.14)'; g.fillRect(0, 0, w, h);
    if (st.envPhase === 1) {
      g.fillStyle = 'rgba(216,196,140,.2)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,240,200,.35)';
      g.font = '600 12px ' + FONT;
      g.textAlign = 'center';
      g.fillText('沙暴：射程 -15%', w / 2, 22);
      if (tier > 0) {
        g.strokeStyle = 'rgba(255,240,200,.2)'; g.lineWidth = 1;
        for (let i = 0; i < 26; i++) {
          const y = (i * 40 + (st.time * 900) % 60) % h;
          const x0 = -40 + ((i * 97 + st.time * 900) % (w + 80));
          g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 60, y + 4); g.stroke();
        }
      }
    }
  } else if (env === 'swamp') {
    g.fillStyle = 'rgba(60,120,70,.12)'; g.fillRect(0, 0, w, h);
  } else if (env === 'lava') {
    g.fillStyle = `rgba(255,96,40,${0.08 + 0.03 * Math.sin(st.time * 1.6)})`; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, h * 0.6, 0, h);
    gr.addColorStop(0, 'rgba(255,80,20,0)'); gr.addColorStop(1, 'rgba(255,90,30,.3)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  } else if (env === 'snow') {
    g.fillStyle = 'rgba(190,220,255,.10)'; g.fillRect(0, 0, w, h);
  }
  if (weather === 'rain' && tier > 0) {
    g.strokeStyle = 'rgba(160,200,255,.26)'; g.lineWidth = 1;
    const n = tier === 2 ? 90 : 46;
    for (let i = 0; i < n; i++) {
      const x = ((i * 137 + st.time * 620) % (w + 40)) - 20;
      const y = ((i * 89 + st.time * 1180) % (h + 40)) - 20;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 14); g.stroke();
    }
  }
  if (weather === 'fog') { g.fillStyle = 'rgba(200,210,225,.12)'; g.fillRect(0, 0, w, h); }
  if (weather === 'spore') {
    g.fillStyle = 'rgba(126,231,135,.10)'; g.fillRect(0, 0, w, h);
    if (tier > 0) {
      g.fillStyle = 'rgba(126,231,135,.35)';
      for (let i = 0; i < 22; i++) {
        const x = (i * 73 + Math.sin(st.time * 0.6 + i) * 26 + w) % w;
        const y = (h - ((i * 53 + st.time * 26) % (h + 40))) + 20;
        g.beginPath(); g.arc(x, y, 2 + (i % 3), 0, TAU); g.fill();
      }
    }
  }
  if (weather === 'ember') {
    const gr = g.createLinearGradient(0, h, 0, h * 0.4);
    gr.addColorStop(0, 'rgba(255,120,40,.16)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  g.restore();
}

/* 射程圈：建造预览与选中塔共用 */
export function drawRange(g, st, t, rangePxOverride) {
  const r = rangePxOverride || rangePx(st, t);
  const x = t.px != null ? t.px : (t.x + 0.5) * TILE;
  const y = t.py != null ? t.py : (t.y + 0.5) * TILE;
  g.save();
  g.fillStyle = 'rgba(90,169,255,.08)';
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(120,190,255,.5)';
  g.lineWidth = 1.6;
  g.setLineDash([9, 7]);
  g.lineDashOffset = -st.time * 26;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.setLineDash([]);
  g.restore();
}

/** 触控建造指示器：指尖上方 RETICLE_LIFT px 的落点准星（由 game 层算好世界坐标传入） */
export const RETICLE_LIFT = 36;

export function drawReticle(g, st, ui) {
  const p = ui.reticle;
  const ok = ui.reticleOk;
  const size = TILE * 0.52;
  g.save();
  g.translate(p.x, p.y);
  g.strokeStyle = ok ? 'rgba(61,220,151,.95)' : 'rgba(255,107,107,.95)';
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, 0, size, 0, TAU); g.stroke();
  g.globalAlpha = 0.35;
  g.beginPath(); g.arc(0, 0, size * 0.55, 0, TAU); g.stroke();
  g.globalAlpha = 1;
  g.beginPath();
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    g.moveTo(Math.cos(a) * size * 0.75, Math.sin(a) * size * 0.75);
    g.lineTo(Math.cos(a) * size * 1.25, Math.sin(a) * size * 1.25);
  }
  g.stroke();
  const r = ui.buildRange;
  if (ui.buildDef && r) {
    g.globalAlpha = 0.12;
    g.fillStyle = ok ? '#3ddc97' : '#ff6b6b';
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.globalAlpha = 0.5;
    g.strokeStyle = ok ? '#3ddc97' : '#ff6b6b';
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  }
  g.restore();
  void st;
}

/* ---------------- 主渲染器 ---------------- */
export class Renderer {
  constructor(canvas, fx) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.fx = fx;
    this.dpr = 1;
    this.cssW = 1; this.cssH = 1;
    this.view = { zoom: 1, x: 0, y: 0, fit: 1 };
    this.terrain = null;
    this.terrainKey = '';
    this.tier = 1;
    this.showGrid = true;
  }

  setTier(t) {
    this.tier = clamp(t | 0, 0, FX_LEVELS.length - 1);
    this.dpr = 1;
    this.terrainKey = '';
  }

  resize(st) {
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    this.cssW = w; this.cssH = h;
    this.dpr = Math.min(DPR_MAX, (window.devicePixelRatio || 1) * (this.tier === 0 ? 0.8 : 1));
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    this.fitView(st, !!st);
  }

  /** 适配窗口：zoom 下限 = 铺满视口的 fit，上限 2.6x；keepCenter 时保持当前视野中心 */
  fitView(st, keepCenter) {
    const fit = Math.min(this.cssW / MAP_W, this.cssH / MAP_H);
    const v = this.view;
    const cx = v.x + this.cssW / (2 * Math.max(0.0001, v.zoom));
    const cy = v.y + this.cssH / (2 * Math.max(0.0001, v.zoom));
    v.fit = fit;
    v.zoom = clamp(v.zoom * (keepCenter ? 1 : 1), fit, MAX_ZOOM);
    if (!keepCenter) { this.centerOn(st, MAP_W / 2, MAP_H / 2); return; }
    this.centerOn(st, cx, cy);
  }

  centerOn(st, cx, cy) {
    const v = this.view;
    const vw = this.cssW / v.zoom, vh = this.cssH / v.zoom;
    void st;
    v.x = MAP_W <= vw ? (MAP_W - vw) / 2 : clamp(cx - vw / 2, 0, MAP_W - vw);
    v.y = MAP_H <= vh ? (MAP_H - vh) / 2 : clamp(cy - vh / 2, 0, MAP_H - vh);
  }

  zoomAt(sx, sy, factor) {
    const v = this.view;
    const before = this.screenToWorld(sx, sy);
    v.zoom = clamp(v.zoom * factor, v.fit, MAX_ZOOM);
    const after = this.screenToWorld(sx, sy);
    v.x += before.x - after.x; v.y += before.y - after.y;
    this.clampCam();
  }

  panBy(dx, dy) {
    const v = this.view;
    v.x -= dx / v.zoom; v.y -= dy / v.zoom;
    this.clampCam();
  }

  clampCam() {
    const v = this.view;
    const vw = this.cssW / v.zoom, vh = this.cssH / v.zoom;
    v.x = MAP_W <= vw ? (MAP_W - vw) / 2 : clamp(v.x, 0, MAP_W - vw);
    v.y = MAP_H <= vh ? (MAP_H - vh) / 2 : clamp(v.y, 0, MAP_H - vh);
  }

  screenToWorld(sx, sy) {
    const v = this.view;
    return { x: v.x + sx / v.zoom, y: v.y + sy / v.zoom };
  }

  worldToScreen(wx, wy) {
    const v = this.view;
    return { x: (wx - v.x) * v.zoom, y: (wy - v.y) * v.zoom };
  }

  viewRect() {
    const v = this.view;
    return { x0: v.x - 40, y0: v.y - 40, x1: v.x + this.cssW / v.zoom + 40, y1: v.y + this.cssH / v.zoom + 40 };
  }

  setLevel(st) {
    this.terrainKey = this.terrainKeyOf(st);
    this.terrain = buildTerrain(st);
    const env = st.level.env, weather = st.level.weather;
    const kind = weather === 'snow' || env === 'snow' ? 'snow'
      : (weather === 'ember' || env === 'lava') ? 'ember'
        : (env === 'sandstorm' || weather === 'sand') ? 'sand'
          : weather === 'spore' ? 'spore'
            : env === 'night' ? 'dust' : '';
    this.fx.setAmbient(kind);
  }

  terrainKeyOf(st) { return st.level.id + '|' + (st.level.theme ? JSON.stringify(st.level.theme) : '') + '|' + (st.level.env || '') + '|' + (st.level.weather || ''); }

  ensureTerrain(st) { if (this.terrainKeyOf(st) !== this.terrainKey) this.setLevel(st); }

  /** 主入口：draw(st, ui, dt)。ui = { selected, buildId, buildDef, buildRange, reticle, reticleOk, dmgNum } */
  draw(st, ui = {}, dt = 0) {
    const g = this.g, v = this.view;
    this.ensureTerrain(st);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#05080e';
    g.fillRect(0, 0, this.cssW, this.cssH);

    const sh = this.fx.shakeOffset;
    g.save();
    g.scale(v.zoom, v.zoom);
    g.translate(-v.x + sh.x / v.zoom, -v.y + sh.y / v.zoom);

    if (this.terrain) g.drawImage(this.terrain, 0, 0);
    drawSpawns(g, st);
    if (this.showGrid) this.drawGrid(g, st, ui);
    drawFlow(g, st);
    drawBase(g, st);

    const vr = this.viewRect();
    const vis = (x, y) => x > vr.x0 && x < vr.x1 && y > vr.y0 && y < vr.y1;
    const tier = this.tier;

    if (ui.selected) drawRange(g, st, ui.selected, 0);
    if (ui.reticle) drawReticle(g, st, ui);
    for (const t of st.towers) if (vis(t.px, t.py)) drawTower(g, st, t, ui.selected === t);
    for (const e of st.enemies) if (e.alive && vis(e.x, e.y)) drawEnemy(g, st, e, tier);
    drawShots(g, st, tier);
    if (ui.dmgNum) drawFloaters(g, st);
    this.fx.draw(g);
    this.fx.ambient(dt, MAP_W, MAP_H);
    drawEnv(g, st, MAP_W, MAP_H, tier);
    g.restore();

    this.drawOffscreenMarks(g, st, vr);
    this.fx.drawFlash(g, this.cssW, this.cssH);
  }

  drawGrid(g, st, ui) {
    const pads = st.level.build === 'pads';
    g.save();
    g.strokeStyle = pads ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.07)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= GRID_W; x++) { g.moveTo(x * TILE, 0); g.lineTo(x * TILE, MAP_H); }
    for (let y = 0; y <= GRID_H; y++) { g.moveTo(0, y * TILE); g.lineTo(MAP_W, y * TILE); }
    g.stroke();
    /* 建造模式下高亮所有合法落点，手指扫一眼就知道能点哪 */
    if (ui.buildId) {
      g.fillStyle = 'rgba(90,169,255,.10)';
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const c = st.grid.at(x, y);
          const okCell = pads ? c === CELL.PAD : c === CELL.EMPTY;
          if (okCell && !st.towers.some((t) => t.x === x && t.y === y)) g.fillRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
        }
      }
    }
    g.restore();
  }

  /** 视野外敌人指示：缩小时也能看到 BOSS 从哪个方向来 */
  drawOffscreenMarks(g, st, vr) {
    let n = 0;
    for (const e of st.enemies) {
      if (!e.alive || n >= 12) continue;
      if (e.x > vr.x0 && e.x < vr.x1 && e.y > vr.y0 && e.y < vr.y1) continue;
      const s = this.worldToScreen(e.x, e.y);
      const cx = clamp(s.x, 12, this.cssW - 12), cy = clamp(s.y, 12, this.cssH - 12);
      g.save();
      g.globalAlpha = 0.85;
      g.fillStyle = e.boss ? '#ff6b6b' : e.elite > 1 ? '#ff9d4a' : '#9fb6d4';
      g.translate(cx, cy);
      g.rotate(Math.atan2(s.y - cy, s.x - cx));
      g.beginPath();
      g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-5, 5);
      g.closePath(); g.fill();
      g.restore();
      n++;
    }
    g.globalAlpha = 1;
  }
}
