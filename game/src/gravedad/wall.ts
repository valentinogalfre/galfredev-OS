import './wall.css';
import logoUrl from '../../../app/src/main/assets/remote/logo.svg';
import { connect } from '../net/link';
import {
  COLORS,
  MAPS,
  MAX_PLAYERS,
  MODES,
  POWERS,
  type Command,
  type FromRoom,
  type MapId,
  type ModeId,
  type Phase,
  type PowerKind,
  type RosterEntry,
  type Seat,
  type Shared,
} from './protocol';
import { GravitySim, TICK, WORLD_H, WORLD_W, type RosterSeed } from './sim';
import { Sound } from './sound';

const hash = new URLSearchParams(location.hash.slice(1));
const secret = hash.get('s') ?? '';
const qrCode = hash.get('qr') ?? '';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function qrSvg(code: string): string {
  const [side, bits] = code.split('-');
  const n = Number(side);
  if (!n || !bits) return '';
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const nibble = parseInt(bits[i >> 2] || '0', 16);
      if (nibble & (8 >> (i & 3))) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${path}" fill="#111"/></svg>`;
}

// --- DOM ---
const canvas = document.getElementById('escena') as HTMLCanvasElement;
canvas.width = WORLD_W;
canvas.height = WORLD_H;
const ctx = canvas.getContext('2d')!;

const hud = document.createElement('div');
hud.className = 'hud';
document.body.appendChild(hud);

const banner = document.createElement('div');
banner.className = 'banner hidden';
document.body.appendChild(banner);

const overlay = document.createElement('div');
overlay.className = 'overlay';
document.body.appendChild(overlay);

// --- Estado de la sala ---
const sound = new Sound();
let phase: Phase = 'lobby';
let mapId: MapId = 'lab';
let modeId: ModeId = 'rondas';
let bots = 2;
let round = 0;
const MAX_ROUNDS = 5;
let leadId: number | null = null;
let record = Number(localStorage.getItem('gd.gravedad.rec') || '0') || 0;
let winnerName: string | null = null;
let lastPower: { who: string; kind: PowerKind; at: number } | null = null;

interface PlayerSlot {
  id: number;
  name: string;
  color: number;
  points: number;
  bestMeters: number;
  lastK: boolean;
}
const players = new Map<number, PlayerSlot>();
let sim: GravitySim | null = null;
let countTimer = 0;
let countNum = 3;
let roundPause = 0;
let shake = 0;

// Partículas y ondas en pool fijo (cero allocs en el loop).
const MAX_PART = 120;
const partX = new Float32Array(MAX_PART);
const partY = new Float32Array(MAX_PART);
const partVx = new Float32Array(MAX_PART);
const partVy = new Float32Array(MAX_PART);
const partLife = new Float32Array(MAX_PART);
const partColor: string[] = new Array(MAX_PART).fill('#fff');
let partHead = 0;

const MAX_WAVE = 16;
const waveX = new Float32Array(MAX_WAVE);
const waveY = new Float32Array(MAX_WAVE);
const waveR = new Float32Array(MAX_WAVE);
const waveLife = new Float32Array(MAX_WAVE);
const waveColor: string[] = new Array(MAX_WAVE).fill('#fff');
let waveHead = 0;

interface Callout { x: number; y: number; text: string; color: string; life: number; }
const callouts: Callout[] = [];
function spawnCallout(x: number, y: number, text: string, color: string): void {
  callouts.push({ x, y, text, color, life: 1.15 });
  if (callouts.length > 12) callouts.shift();
}

function spawnBurst(x: number, y: number, color: string, count: number, speed: number): void {
  for (let i = 0; i < count; i++) {
    const idx = partHead;
    partHead = (partHead + 1) % MAX_PART;
    const ang = Math.random() * Math.PI * 2;
    const sp = speed * (0.4 + Math.random() * 0.8);
    partX[idx] = x;
    partY[idx] = y;
    partVx[idx] = Math.cos(ang) * sp;
    partVy[idx] = Math.sin(ang) * sp;
    partLife[idx] = 0.35 + Math.random() * 0.25;
    partColor[idx] = color;
  }
}

function spawnWave(x: number, y: number, color: string): void {
  const idx = waveHead;
  waveHead = (waveHead + 1) % MAX_WAVE;
  waveX[idx] = x;
  waveY[idx] = y;
  waveR[idx] = 18;
  waveLife[idx] = 0.42;
  waveColor[idx] = color;
}

function buildSeeds(): RosterSeed[] {
  const list: RosterSeed[] = [];
  for (const p of players.values()) {
    list.push({ id: p.id, name: p.name, color: p.color, bot: false });
  }
  const botNames = ['Nova', 'Vex', 'Kira', 'Bolt', 'Echo', 'Zed'];
  const needBots = Math.min(bots, MAX_PLAYERS - list.length);
  for (let i = 0; i < needBots; i++) {
    list.push({
      id: -10 - i,
      name: `Bot ${botNames[i % botNames.length]}`,
      color: COLORS[(list.length + i) % COLORS.length],
      bot: true,
    });
  }
  if (list.length === 0) {
    list.push({ id: -1, name: 'Bot Nova', color: COLORS[0], bot: true });
    list.push({ id: -2, name: 'Bot Vex', color: COLORS[1], bot: true });
  }
  return list;
}

function makeShared(): Shared {
  const seats: Seat[] = [];
  if (sim) {
    for (let i = 0; i < sim.runners.length; i++) {
      const r = sim.runners[i];
      const slot = players.get(r.id);
      seats.push({
        id: r.id,
        name: r.name,
        color: r.color,
        bot: r.bot,
        points: slot ? slot.points : 0,
        bestMeters: slot ? Math.max(slot.bestMeters, r.meters) : r.meters,
        alive: r.alive,
        dir: r.dir,
        shield: r.shield,
        turbo: r.turboT > 0,
        airFlips: r.airFlips,
      });
    }
  } else {
    for (const p of players.values()) {
      seats.push({
        id: p.id,
        name: p.name,
        color: p.color,
        points: p.points,
        bestMeters: p.bestMeters,
        alive: true,
        dir: 1,
        shield: false,
        turbo: false,
        airFlips: 0,
      });
    }
  }
  return {
    phase,
    map: mapId,
    mode: modeId,
    bots,
    round,
    maxRounds: MAX_ROUNDS,
    lead: leadId,
    meters: sim ? sim.meters : 0,
    record,
    seats,
    winner: winnerName,
    lastPower,
  };
}

let lastBroadcast = 0;
function broadcast(force = false): void {
  const now = performance.now();
  if (!force && now - lastBroadcast < 120) return;
  lastBroadcast = now;
  link.send({ t: 'all', d: makeShared() });
}

function startMatch(): void {
  for (const p of players.values()) {
    p.points = 0;
    p.bestMeters = 0;
  }
  round = 1;
  winnerName = null;
  lastPower = null;
  beginRound();
}

function beginRound(): void {
  sim = new GravitySim(mapId, modeId, buildSeeds(), Date.now());
  phase = 'count';
  countTimer = 2.4;
  countNum = 3;
  sound.beep(false);
  renderOverlay();
  broadcast(true);
}

function finishRound(): void {
  if (!sim) return;
  const rank = sim.ranking();
  const top = rank[0];
  if (sim.meters > record) {
    record = sim.meters;
    try { localStorage.setItem('gd.gravedad.rec', String(record)); } catch { /* sin storage */ }
  }
  const award = [3, 2, 1];
  for (let i = 0; i < rank.length; i++) {
    const r = rank[i];
    const slot = players.get(r.id);
    if (slot) {
      if (r.meters > slot.bestMeters) slot.bestMeters = r.meters;
      if (modeId === 'rondas' && i < award.length) slot.points += award[i];
    }
  }

  if (modeId === 'distancia' || round >= MAX_ROUNDS) {
    phase = 'over';
    if (modeId === 'rondas' && players.size > 0) {
      const sorted = Array.from(players.values()).sort((a, b) => b.points - a.points || b.bestMeters - a.bestMeters);
      winnerName = sorted[0].name;
    } else {
      winnerName = top ? top.name : null;
    }
    sound.win();
    renderOverlay();
    broadcast(true);
    return;
  }

  phase = 'round';
  winnerName = top ? top.name : null;
  roundPause = 2.6;
  sound.win();
  renderOverlay();
  broadcast(true);
}

function goLobby(): void {
  phase = 'lobby';
  sim = null;
  winnerName = null;
  lastPower = null;
  banner.classList.add('hidden');
  renderOverlay();
  broadcast(true);
}

// --- Conexión con la sala ---
const link = connect<FromRoom>(
  () => ({ t: 'host', secret }),
  (msg) => {
    if (msg.t === 'roster') {
      const seen = new Set<number>();
      let firstOn: number | null = null;
      for (const e of msg.players as RosterEntry[]) {
        seen.add(e.id);
        if (e.on && firstOn === null) firstOn = e.id;
        if (!players.has(e.id)) {
          players.set(e.id, {
            id: e.id,
            name: e.name || `Jugador ${e.id}`,
            color: COLORS[(e.id - 1) % COLORS.length],
            points: 0,
            bestMeters: 0,
            lastK: false,
          });
        }
      }
      for (const id of Array.from(players.keys())) {
        if (!seen.has(id)) players.delete(id);
      }
      if (leadId === null || !seen.has(leadId)) leadId = firstOn;
      renderOverlay();
      broadcast(true);
    } else if (msg.t === 'in') {
      const slot = players.get(msg.id);
      if (!slot) return;
      const pressed = !!msg.k;
      if (pressed && !slot.lastK && phase === 'play' && sim) {
        sim.flip(msg.id);
      }
      slot.lastK = pressed;
    } else if (msg.t === 'cmd') {
      handleCommand(msg.id, msg.d);
    }
  },
  () => { /* estado de línea */ },
);

function handleCommand(id: number, cmd: Command): void {
  const isLead = id === leadId || leadId === null;
  const slot = players.get(id);
  if (cmd.a === 'name' && slot) {
    slot.name = String(cmd.name || '').trim().slice(0, 14) || slot.name;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'color' && slot) {
    if (COLORS.indexOf(cmd.color) >= 0) slot.color = cmd.color;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'map' && isLead && phase === 'lobby') {
    if (MAPS.some((m) => m.id === cmd.map)) mapId = cmd.map;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'mode' && isLead && phase === 'lobby') {
    if (MODES.some((m) => m.id === cmd.mode)) modeId = cmd.mode;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'bots' && isLead && phase === 'lobby') {
    bots = Math.max(0, Math.min(5, Math.round(cmd.bots)));
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'start' && isLead && phase === 'lobby') {
    startMatch();
  } else if (cmd.a === 'again' && isLead) {
    startMatch();
  } else if (cmd.a === 'lobby' && isLead) {
    goLobby();
  } else if (cmd.a === 'kick' && isLead && cmd.id !== id) {
    link.send({ t: 'to', id: cmd.id, d: { kicked: true } });
    link.send({ t: 'drop', id: cmd.id });
  } else if (cmd.a === 'exit' && isLead) {
    const host = (window as unknown as { CarreraHost?: { exit?: () => void } }).CarreraHost;
    if (host && host.exit) host.exit();
  }
}

// Teclado en compu / control remoto del proyector (Enter/OK arranca, Espacio invierte al primer jugador).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (phase === 'lobby' || phase === 'over')) {
    startMatch();
  } else if (e.key === ' ' && phase === 'play' && sim) {
    const first = sim.runners.find((r) => !r.bot && r.alive);
    if (first) sim.flip(first.id);
  }
});

// --- UI overlays ---
function renderOverlay(): void {
  if (phase === 'play' || phase === 'count') {
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');

  if (phase === 'lobby') {
    const mapChips = MAPS.map((m) => `<div class="chip ${m.id === mapId ? 'on' : ''}">${m.name}</div>`).join('');
    const modeChips = MODES.map((m) => `<div class="chip ${m.id === modeId ? 'on' : ''}">${m.name}</div>`).join('');
    const seatHtml = players.size === 0
      ? '<div class="seat" style="opacity:0.6">Esperando celulares… (o apretá OK para probar con bots)</div>'
      : Array.from(players.values()).map((p) => `<div class="seat"><span class="dot" style="background:${hex(p.color)}"></span>${esc(p.name)}${p.id === leadId ? ' ★' : ''}</div>`).join('');
    overlay.innerHTML = `
      <div class="card">
        <div class="col-main">
          <div class="brand"><img src="${logoUrl}" alt=""><span>galfredev · Gravedad</span></div>
          <h1>Gravedad</h1>
          <div class="sub">Un solo botón en el celular para invertir la gravedad. Récord: <b>${record} m</b></div>
          <div class="chips">${mapChips}</div>
          <div class="chips">${modeChips}<div class="chip">Bots: ${bots}</div></div>
          <div class="roster">${seatHtml}</div>
          <div class="hint-bar">El que tiene la estrella (★) elige mapa, modo y larga desde el celular.</div>
        </div>
        <div class="col-qr">
          <div class="qr-box">${qrSvg(qrCode)}</div>
          <div class="qr-hint">Escaneá para entrar con tu celular</div>
        </div>
      </div>`;
    return;
  }

  if (phase === 'round' || phase === 'over') {
    const rows = (players.size > 0
      ? Array.from(players.values()).sort((a, b) => (modeId === 'rondas' ? b.points - a.points : b.bestMeters - a.bestMeters))
      : (sim ? sim.ranking().map((r) => ({ name: r.name, color: r.color, points: 0, bestMeters: r.meters })) : [])
    ).map((p, idx) => `
      <div class="podium-row ${idx === 0 ? 'first' : ''}">
        <div class="podium-left"><span class="dot" style="background:${hex(p.color)}"></span>${idx + 1}. ${esc(p.name)}</div>
        <div>${modeId === 'rondas' ? `${p.points} pts · ` : ''}${p.bestMeters} m</div>
      </div>`).join('');
    overlay.innerHTML = `
      <div class="card podium">
        <div class="brand" style="justify-content:center"><img src="${logoUrl}" alt=""><span>${phase === 'over' ? 'Final' : `Ronda ${round} de ${MAX_ROUNDS}`}</span></div>
        <h1>${winnerName ? `Ganó ${esc(winnerName)}` : 'Fin de ronda'}</h1>
        <div class="sub">Distancia máxima: ${sim ? sim.meters : 0} m · Récord: ${record} m</div>
        <div class="podium-list">${rows}</div>
        <div class="hint-bar">${phase === 'over' ? 'El líder puede reiniciar o volver a la sala desde su celular.' : 'Siguiente ronda en un instante…'}</div>
      </div>`;
  }
}

// --- Dibujo 2D liviano (60 FPS en Fika P8) ---
let bgTime = 0;
function draw(dt: number): void {
  bgTime += dt;
  const theme = MAPS.find((m) => m.id === mapId) || MAPS[0];

  // Fondo degradado + grilla en paralaje liviana (sin shadowBlur).
  const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  grad.addColorStop(0, theme.bgTop);
  grad.addColorStop(1, theme.bgBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const cam = sim ? sim.camX : bgTime * 110;

  // Capa 1: arquitectura lejana en paralaje (identidad visual propia por mapa, sin shadowBlur).
  const farStep = 220;
  const farOff = -(cam * 0.18) % farStep;
  ctx.fillStyle = 'rgba(255,255,255,0.032)';
  for (let i = -1; i < 8; i++) {
    const bx = farOff + i * farStep;
    const seed = Math.abs(Math.floor((cam * 0.18 + bx) / farStep));
    const h = 160 + ((seed * 73) % 210);
    if (mapId === 'lab') {
      // Columnas de laboratorio con cápsulas iluminadas.
      ctx.fillStyle = 'rgba(77, 232, 255, 0.045)';
      ctx.fillRect(bx + 30, WORLD_H - h, 56, h);
      ctx.fillStyle = 'rgba(77, 232, 255, 0.11)';
      ctx.fillRect(bx + 42, WORLD_H - h + 24, 32, 10);
      ctx.fillRect(bx + 42, WORLD_H - h + 52, 32, 10);
    } else if (mapId === 'reactor') {
      // Silos de reactor con franjas de energía verde.
      ctx.fillStyle = 'rgba(125, 255, 107, 0.045)';
      ctx.fillRect(bx + 20, 0, 64, WORLD_H);
      ctx.fillStyle = 'rgba(125, 255, 107, 0.14)';
      const pulseY = ((bgTime * 70 + seed * 90) % WORLD_H);
      ctx.fillRect(bx + 46, pulseY, 12, 48);
    } else if (mapId === 'inversor') {
      // Monolitos geométricos flotantes.
      ctx.fillStyle = 'rgba(255, 82, 200, 0.055)';
      const my = 180 + ((seed * 61) % 300) + Math.sin(bgTime * 1.4 + seed) * 18;
      ctx.beginPath();
      ctx.moveTo(bx + 60, my - 56);
      ctx.lineTo(bx + 104, my);
      ctx.lineTo(bx + 60, my + 56);
      ctx.lineTo(bx + 16, my);
      ctx.closePath();
      ctx.fill();
    } else {
      // Arcos industriales y resplandor de horno en Caos.
      ctx.fillStyle = 'rgba(255, 92, 92, 0.055)';
      ctx.fillRect(bx + 18, 0, 22, WORLD_H);
      ctx.fillRect(bx + 130, 0, 22, WORLD_H);
      ctx.fillStyle = 'rgba(255, 173, 51, 0.07)';
      ctx.fillRect(bx + 40, WORLD_H - 95, 90, 95);
    }
  }

  // Capa 2: grilla tecnológica en paralaje medio.
  ctx.strokeStyle = 'rgba(255,255,255,0.042)';
  ctx.lineWidth = 1;
  const stepX = 80;
  const offX = -(cam * 0.38) % stepX;
  ctx.beginPath();
  for (let x = offX; x < WORLD_W; x += stepX) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
  }
  for (let y = 80; y < WORLD_H; y += 80) {
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
  }
  ctx.stroke();

  if (!sim) return;

  ctx.save();
  if (shake > 0) {
    const s = shake * 10;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    shake = Math.max(0, shake - dt * 3.5);
  }
  ctx.translate(-sim.camX, 0);

  // Marcadores holográficos de distancia cada 50 m (1000 px) integrados al mundo.
  const firstMark = Math.max(1000, Math.floor(sim.camX / 1000) * 1000);
  ctx.font = '600 18px Sora, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let mx = firstMark; mx < sim.camX + WORLD_W + 200; mx += 1000) {
    const mVal = Math.round((mx - 240) / 20);
    if (mVal <= 0) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, 132);
    ctx.lineTo(mx, 588);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillText(`${mVal} m`, mx, 360);
  }

  // Zonas especiales (baja gravedad con partículas ascendentes / láser inversor pulsante).
  for (let i = 0; i < sim.zones.length; i++) {
    const z = sim.zones[i];
    if (z.x + z.w < sim.camX - 40 || z.x > sim.camX + WORLD_W + 40) continue;
    if (z.kind === 'lowg') {
      ctx.fillStyle = 'rgba(125, 255, 107, 0.075)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = 'rgba(125, 255, 107, 0.34)';
      ctx.lineWidth = 2;
      ctx.strokeRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = 'rgba(125, 255, 107, 0.42)';
      for (let m = 0; m < 7; m++) {
        const mx = z.x + ((m * 97 + z.id * 31) % Math.max(20, z.w - 16)) + 8;
        const my = z.y + z.h - (((bgTime * 95 + m * 67) % z.h));
        ctx.fillRect(mx, my, 4, 12);
      }
    } else {
      const pulse = 0.24 + Math.sin(bgTime * 14 + z.id) * 0.1;
      ctx.fillStyle = `rgba(255, 82, 200, ${pulse})`;
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = '#ff52c8';
      ctx.fillRect(z.x + z.w * 0.5 - 2, z.y, 4, z.h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(z.x + z.w * 0.5 - 1, z.y, 2, z.h);
    }
  }

  // Portales con doble anillo giratorio.
  for (let i = 0; i < sim.portals.length; i++) {
    const po = sim.portals[i];
    if (po.toX < sim.camX - 60 || po.x > sim.camX + WORLD_W + 60) continue;
    drawPortal(po.x, po.y, po.r, '#ff52c8', bgTime * 3.2);
    drawPortal(po.toX, po.toY, po.r * 0.85, '#9a7bff', -bgTime * 3.2);
  }

  // Plataformas con identidad visual clara (sólida, móvil, frágil y boost).
  for (let i = 0; i < sim.platforms.length; i++) {
    const p = sim.platforms[i];
    if (p.broken || p.x + p.w < sim.camX - 40 || p.x > sim.camX + WORLD_W + 40) continue;
    const jx = p.crumbleT >= 0 ? (Math.random() - 0.5) * (4 + p.crumbleT * 10) : 0;
    const jy = p.crumbleT >= 0 ? (Math.random() - 0.5) * (3 + p.crumbleT * 8) : 0;
    const px = p.x + jx;
    const py = p.y + jy;

    if (p.kind === 'boost') {
      ctx.fillStyle = '#31230c';
      ctx.fillRect(px, py, p.w, p.h);
      ctx.fillStyle = '#ffad33';
      ctx.fillRect(px, py, p.w, 4);
      ctx.fillRect(px, py + p.h - 4, p.w, 4);
      // Flechas deslizantes de turbo >>>
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3;
      const shift = (bgTime * 110) % 28;
      ctx.beginPath();
      for (let cx = px + 14 + shift; cx < px + p.w - 12; cx += 28) {
        ctx.moveTo(cx - 6, py + 7);
        ctx.lineTo(cx + 3, py + p.h * 0.5);
        ctx.lineTo(cx - 6, py + p.h - 7);
      }
      ctx.stroke();
    } else if (p.kind === 'crumble') {
      const heat = p.crumbleT >= 0 ? Math.min(1, p.crumbleT / 0.55) : 0;
      ctx.fillStyle = heat > 0.4 ? '#5c1f22' : '#381822';
      ctx.fillRect(px, py, p.w, p.h);
      ctx.fillStyle = heat > 0.4 ? '#ffad33' : '#ff5c5c';
      ctx.fillRect(px, py, p.w, 4);
      ctx.fillRect(px, py + p.h - 4, p.w, 4);
      // Grietas visibles.
      ctx.strokeStyle = 'rgba(255, 180, 120, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let cx = px + 26; cx < px + p.w - 18; cx += 42) {
        ctx.moveTo(cx, py + 4);
        ctx.lineTo(cx + 6, py + p.h * 0.55);
        ctx.lineTo(cx - 3, py + p.h - 4);
      }
      ctx.stroke();
    } else if (p.kind === 'moving') {
      ctx.fillStyle = '#142a22';
      ctx.fillRect(px, py, p.w, p.h);
      ctx.fillStyle = theme.accent2;
      ctx.fillRect(px, py, p.w, 4);
      ctx.fillRect(px, py + p.h - 4, p.w, 4);
      ctx.fillStyle = 'rgba(125, 255, 107, 0.22)';
      for (let cx = px + 12; cx < px + p.w - 16; cx += 26) {
        ctx.fillRect(cx, py + 9, 10, p.h - 18);
      }
    } else {
      ctx.fillStyle = '#122135';
      ctx.fillRect(px, py, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let cx = px + 16; cx < px + p.w - 16; cx += 48) {
        ctx.fillRect(cx, py + 7, 2, p.h - 14);
      }
      ctx.fillStyle = theme.accent;
      ctx.fillRect(px, py, p.w, 4);
      ctx.fillRect(px, py + p.h - 4, p.w, 4);
    }
  }

  // Poderes flotantes con halo pulsante.
  for (let i = 0; i < sim.pickups.length; i++) {
    const pk = sim.pickups[i];
    if (pk.taken || pk.x < sim.camX - 40 || pk.x > sim.camX + WORLD_W + 40) continue;
    const info = POWERS[pk.kind];
    const bob = Math.sin(bgTime * 5 + pk.id) * 6;
    const pulseR = 23 + Math.sin(bgTime * 8 + pk.id) * 3;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = info.color;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 16, 28, 0.92)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = info.color;
    ctx.stroke();
    ctx.fillStyle = info.color;
    ctx.font = '600 16px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.short, pk.x, pk.y + bob + 1);
  }

  // Encontrar líder actual para dibujarle corona.
  let leaderId = -1;
  let leaderX = -Infinity;
  for (let i = 0; i < sim.runners.length; i++) {
    const r = sim.runners[i];
    if (r.alive && r.x > leaderX) {
      leaderX = r.x;
      leaderId = r.id;
    }
  }

  // Corredores + estelas + capa de energía.
  for (let i = 0; i < sim.runners.length; i++) {
    const r = sim.runners[i];
    if (!r.alive) continue;
    const col = hex(r.color);

    // Estela luminosa doble.
    if (r.trailCount > 1) {
      ctx.lineCap = 'round';
      for (let t = 1; t < r.trailCount; t++) {
        const i0 = (r.trailHead - t + r.trailX.length) % r.trailX.length;
        const i1 = (r.trailHead - t - 1 + r.trailX.length) % r.trailX.length;
        const frac = 1 - t / r.trailCount;
        ctx.strokeStyle = r.turboT > 0 ? '#ffad33' : col;
        ctx.lineWidth = 3 + frac * 7;
        ctx.globalAlpha = frac * 0.52;
        ctx.beginPath();
        ctx.moveTo(r.trailX[i0], r.trailY[i0]);
        ctx.lineTo(r.trailX[i1], r.trailY[i1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Aura de escudo o turbo.
    if (r.shield || r.turboT > 0) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, 25 + Math.sin(bgTime * 12) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = r.turboT > 0 ? '#ffad33' : '#4de8ff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Cuerpo estilizado con inclinación hacia adelante y bufanda/capa de energía.
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(1, r.dir);
    ctx.rotate(r.grounded ? 0.14 : -0.06);

    // Capa trasera flameando.
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.65;
    const flutter = Math.sin(bgTime * 28 + r.id) * 4;
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(-26, -4 + flutter);
    ctx.lineTo(-22, 6 + flutter);
    ctx.lineTo(-10, 4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Torso / casco.
    ctx.fillStyle = col;
    ctx.fillRect(-11, -14, 22, 23);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(-11, -14, 22, 4);
    // Visor futurista.
    ctx.fillStyle = '#07101c';
    ctx.fillRect(0, -10, 11, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, -8, 5, 4);
    // Piernas animadas.
    const swing = r.grounded ? Math.sin(bgTime * 24 + r.id) * 7 : 5;
    ctx.fillStyle = col;
    ctx.fillRect(-7 + swing, 9, 6, 8);
    ctx.fillRect(2 - swing, 9, 6, 8);
    ctx.restore();

    // Corona sobre el puntero cuando hay 2+ corredores.
    if (r.id === leaderId && sim.runners.length > 1) {
      const cy = r.y - 40;
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.moveTo(r.x - 8, cy + 6);
      ctx.lineTo(r.x - 8, cy - 3);
      ctx.lineTo(r.x - 3, cy + 1);
      ctx.lineTo(r.x, cy - 5);
      ctx.lineTo(r.x + 3, cy + 1);
      ctx.lineTo(r.x + 8, cy - 3);
      ctx.lineTo(r.x + 8, cy + 6);
      ctx.closePath();
      ctx.fill();
    }

    // Nombre chico sobre el corredor.
    ctx.fillStyle = '#f2f6ff';
    ctx.font = '600 13px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(r.name, r.x, r.y - 22);
  }

  // Ondas expansivas.
  for (let i = 0; i < MAX_WAVE; i++) {
    if (waveLife[i] <= 0) continue;
    waveLife[i] -= dt;
    waveR[i] += dt * 210;
    ctx.globalAlpha = Math.max(0, waveLife[i] / 0.42);
    ctx.strokeStyle = waveColor[i];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(waveX[i], waveY[i], waveR[i], 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Partículas.
  for (let i = 0; i < MAX_PART; i++) {
    if (partLife[i] <= 0) continue;
    partLife[i] -= dt;
    partX[i] += partVx[i] * dt;
    partY[i] += partVy[i] * dt;
    ctx.globalAlpha = Math.max(0, partLife[i] * 2);
    ctx.fillStyle = partColor[i];
    ctx.fillRect(partX[i] - 3, partY[i] - 3, 6, 6);
  }
  ctx.globalAlpha = 1;

  // Textos flotantes de poderes en el mundo.
  ctx.font = '600 16px Sora, sans-serif';
  ctx.textAlign = 'center';
  for (let i = callouts.length - 1; i >= 0; i--) {
    const c = callouts[i];
    c.life -= dt;
    c.y -= dt * 42;
    if (c.life <= 0) {
      callouts.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, c.life * 1.6);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, c.x, c.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Líneas sutiles de velocidad en los bordes cuando sube el ritmo.
  if (sim.speed > 430) {
    const alpha = Math.min(0.24, (sim.speed - 430) / 900);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let s = 0; s < 6; s++) {
      const sy = 50 + s * 115 + ((bgTime * 40) % 40);
      const sx = WORLD_W - ((bgTime * 1100 + s * 230) % (WORLD_W + 240));
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 85, sy);
    }
    ctx.stroke();
  }

  // Barra inferior en vivo con la posición relativa de todos los corredores.
  if (sim.runners.length > 1) {
    const barW = 420;
    const barX = (WORLD_W - barW) * 0.5;
    const barY = WORLD_H - 26;
    ctx.fillStyle = 'rgba(10, 16, 28, 0.72)';
    ctx.fillRect(barX, barY - 4, barW, 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY - 4, barW, 8);
    for (let i = 0; i < sim.runners.length; i++) {
      const r = sim.runners[i];
      if (!r.alive) continue;
      const t = Math.max(0, Math.min(1, (r.x - sim.camX) / WORLD_W));
      ctx.beginPath();
      ctx.arc(barX + t * barW, barY, r.id === leaderId ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = hex(r.color);
      ctx.fill();
      if (r.id === leaderId) {
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // HUD superior.
  const alive = sim.runners.filter((r) => r.alive).length;
  const powerTag = lastPower && performance.now() - lastPower.at < 2600
    ? `<div class="pill" style="border-color:${POWERS[lastPower.kind].color}">${esc(lastPower.who)}: ${POWERS[lastPower.kind].label}</div>`
    : '';
  hud.innerHTML = `
    <div class="pill">${sim.meters} m <small>Récord ${record} m</small></div>
    ${powerTag}
    <div class="pill">${modeId === 'rondas' ? `Ronda ${round}/${MAX_ROUNDS}` : 'Distancia'} <small>Vivos ${alive}/${sim.runners.length}</small></div>`;
}

function drawPortal(x: number, y: number, r: number, color: string, spin: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(18, 6, 32, 0.85)';
  ctx.fill();
  ctx.rotate(spin);
  ctx.setLineDash([10, 6]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.restore();
}

// --- Loop principal ---
let lastTs = performance.now();
let acc = 0;

function loop(ts: number): void {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  if (phase === 'count') {
    countTimer -= dt;
    const n = Math.max(1, Math.ceil(countTimer / 0.8));
    if (n !== countNum) {
      countNum = n;
      sound.beep(false);
    }
    banner.classList.remove('hidden');
    banner.innerHTML = `${n}<small>Tocá tu celular para invertir</small>`;
    if (countTimer <= 0) {
      phase = 'play';
      sound.beep(true);
      banner.classList.add('hidden');
      broadcast(true);
    }
  } else if (phase === 'play' && sim) {
    acc += dt;
    while (acc >= TICK) {
      acc -= TICK;
      sim.step(TICK);
      for (let i = 0; i < sim.events.length; i++) {
        const ev = sim.events[i];
        if (ev.kind === 'flip') {
          sound.flip(ev.dir);
          spawnWave(ev.x, ev.y, hex(ev.color));
        } else if (ev.kind === 'land') {
          sound.land();
          spawnBurst(ev.x, ev.y, hex(ev.color), 5, 110);
        } else if (ev.kind === 'power') {
          lastPower = { who: ev.name, kind: ev.power, at: performance.now() };
          spawnCallout(ev.x, ev.y - 26, `¡${POWERS[ev.power].label.toUpperCase()}!`, POWERS[ev.power].color);
          if (ev.power === 'pulso') {
            sound.pulse();
            shake = 0.65;
            spawnWave(ev.x, ev.y, '#ff55d8');
          } else {
            sound.power();
          }
          spawnBurst(ev.x, ev.y, POWERS[ev.power].color, 12, 180);
          broadcast(true);
        } else if (ev.kind === 'shield') {
          sound.shield();
          spawnWave(ev.x, ev.y, '#4de8ff');
        } else if (ev.kind === 'portal') {
          sound.power();
          spawnWave(ev.toX, ev.toY, '#9a7bff');
        } else if (ev.kind === 'die') {
          sound.die();
          shake = 0.5;
          spawnBurst(ev.x, ev.y, hex(ev.color), 18, 260);
          broadcast(true);
        } else if (ev.kind === 'roundEnd') {
          finishRound();
        }
      }
      if (sim.finished) break;
    }
    broadcast(false);
  } else if (phase === 'round') {
    roundPause -= dt;
    if (roundPause <= 0) {
      round++;
      beginRound();
    }
  }

  draw(dt);
  requestAnimationFrame(loop);
}

renderOverlay();
requestAnimationFrame(loop);
