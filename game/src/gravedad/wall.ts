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
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  const stepX = 80;
  const offX = -(cam * 0.35) % stepX;
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

  // Zonas especiales (baja gravedad / láser inversor).
  for (let i = 0; i < sim.zones.length; i++) {
    const z = sim.zones[i];
    if (z.x + z.w < sim.camX - 40 || z.x > sim.camX + WORLD_W + 40) continue;
    if (z.kind === 'lowg') {
      ctx.fillStyle = 'rgba(125, 255, 107, 0.08)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = 'rgba(125, 255, 107, 0.32)';
      ctx.lineWidth = 2;
      ctx.strokeRect(z.x, z.y, z.w, z.h);
    } else {
      ctx.fillStyle = 'rgba(255, 82, 200, 0.28)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = '#ff52c8';
      ctx.fillRect(z.x + z.w * 0.4, z.y, 4, z.h);
    }
  }

  // Portales.
  for (let i = 0; i < sim.portals.length; i++) {
    const po = sim.portals[i];
    if (po.toX < sim.camX - 60 || po.x > sim.camX + WORLD_W + 60) continue;
    drawPortal(po.x, po.y, po.r, '#ff52c8');
    drawPortal(po.toX, po.toY, po.r * 0.82, '#9a7bff');
  }

  // Plataformas.
  for (let i = 0; i < sim.platforms.length; i++) {
    const p = sim.platforms[i];
    if (p.broken || p.x + p.w < sim.camX - 40 || p.x > sim.camX + WORLD_W + 40) continue;
    const jx = p.crumbleT >= 0 ? (Math.random() - 0.5) * 6 : 0;
    const jy = p.crumbleT >= 0 ? (Math.random() - 0.5) * 4 : 0;
    ctx.fillStyle = p.kind === 'crumble' ? '#3a1a22' : p.kind === 'moving' ? '#1c2c24' : '#132236';
    ctx.fillRect(p.x + jx, p.y + jy, p.w, p.h);
    ctx.fillStyle = p.kind === 'crumble' ? '#ff5c5c' : p.kind === 'moving' ? theme.accent2 : theme.accent;
    ctx.fillRect(p.x + jx, p.y + jy, p.w, 4);
    ctx.fillRect(p.x + jx, p.y + jy + p.h - 4, p.w, 4);
  }

  // Poderes flotantes.
  for (let i = 0; i < sim.pickups.length; i++) {
    const pk = sim.pickups[i];
    if (pk.taken || pk.x < sim.camX - 40 || pk.x > sim.camX + WORLD_W + 40) continue;
    const info = POWERS[pk.kind];
    const bob = Math.sin(bgTime * 5 + pk.id) * 6;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 16, 28, 0.88)';
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

  // Corredores + estelas.
  for (let i = 0; i < sim.runners.length; i++) {
    const r = sim.runners[i];
    if (!r.alive) continue;
    const col = hex(r.color);

    // Estela.
    if (r.trailCount > 1) {
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (let t = 1; t < r.trailCount; t++) {
        const i0 = (r.trailHead - t + r.trailX.length) % r.trailX.length;
        const i1 = (r.trailHead - t - 1 + r.trailX.length) % r.trailX.length;
        const alpha = (1 - t / r.trailCount) * 0.45;
        ctx.strokeStyle = col;
        ctx.globalAlpha = alpha;
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
      ctx.arc(r.x, r.y, 24, 0, Math.PI * 2);
      ctx.strokeStyle = r.turboT > 0 ? '#ffad33' : '#4de8ff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Cuerpo estilizado (orientado según gravedad).
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(1, r.dir);
    ctx.fillStyle = col;
    ctx.fillRect(-12, -14, 24, 24);
    // Visor brillante.
    ctx.fillStyle = '#08111c';
    ctx.fillRect(0, -10, 10, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, -8, 5, 4);
    // Piernas animadas.
    const swing = r.grounded ? Math.sin(bgTime * 22 + r.id) * 6 : 4;
    ctx.fillStyle = col;
    ctx.fillRect(-8 + swing, 10, 6, 7);
    ctx.fillRect(2 - swing, 10, 6, 7);
    ctx.restore();

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
  ctx.restore();

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

function drawPortal(x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 8, 32, 0.75)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
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
