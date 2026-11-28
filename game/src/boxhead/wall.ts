import './wall.css';
import logoUrl from '../../../app/src/main/assets/remote/logo.svg';
import { connect } from '../net/link';
import {
  ARENAS,
  MAX_PLAYERS,
  MODES,
  PLAYER_COLORS,
  WEAPON_BY_ID,
  type ArenaId,
  type Command,
  type FromRoom,
  type ModeId,
  type Phase,
  type RosterEntry,
  type SeatState,
  type Shared,
} from './protocol';
import { BoxheadSim, TICK, WORLD_H, WORLD_W, type Enemy, type Player, type PlayerSeed } from './sim';
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

// --- Canvas principal + capa cacheada de piso y sangre persistente (0 costo por frame) ---
const canvas = document.getElementById('arena') as HTMLCanvasElement;
canvas.width = WORLD_W;
canvas.height = WORLD_H;
const ctx = canvas.getContext('2d')!;

const floorCanvas = document.createElement('canvas');
floorCanvas.width = WORLD_W;
floorCanvas.height = WORLD_H;
const floorCtx = floorCanvas.getContext('2d')!;

const hud = document.createElement('div');
hud.className = 'hud';
document.body.appendChild(hud);

const overlay = document.createElement('div');
overlay.className = 'overlay';
document.body.appendChild(overlay);

// --- Estado de la sala ---
const sound = new Sound();
let phase: Phase = 'lobby';
let arenaId: ArenaId = 'plaza';
let modeId: ModeId = 'coop';
let friendlyFire = false;
let leadId: number | null = null;
let bestWave = Number(localStorage.getItem('gd.boxhead.wave') || '0') || 0;
let perkTime = 0;
let shake = 0;

interface Slot {
  id: number;
  name: string;
  color: number;
}
const slots = new Map<number, Slot>();
let sim: BoxheadSim | null = null;

// Pools fijos de humo cuadrado, flashes y textos flotantes (cero GC en Fika P8).
const MAX_SMOKE = 90;
const smX = new Float32Array(MAX_SMOKE);
const smY = new Float32Array(MAX_SMOKE);
const smVx = new Float32Array(MAX_SMOKE);
const smVy = new Float32Array(MAX_SMOKE);
const smSize = new Float32Array(MAX_SMOKE);
const smLife = new Float32Array(MAX_SMOKE);
const smColor: string[] = new Array(MAX_SMOKE).fill('#ff9933');
let smHead = 0;

const MAX_FLOAT = 20;
const flX = new Float32Array(MAX_FLOAT);
const flY = new Float32Array(MAX_FLOAT);
const flLife = new Float32Array(MAX_FLOAT);
const flText: string[] = new Array(MAX_FLOAT).fill('');
const flColor: string[] = new Array(MAX_FLOAT).fill('#fff');
let flHead = 0;

function spawnSmoke(x: number, y: number, count: number, speed: number, color: string, size: number): void {
  for (let i = 0; i < count; i++) {
    const idx = smHead;
    smHead = (smHead + 1) % MAX_SMOKE;
    const ang = Math.random() * Math.PI * 2;
    const sp = speed * (0.3 + Math.random() * 0.85);
    smX[idx] = x;
    smY[idx] = y;
    smVx[idx] = Math.cos(ang) * sp;
    smVy[idx] = Math.sin(ang) * sp;
    smSize[idx] = size * (0.7 + Math.random() * 0.6);
    smLife[idx] = 0.32 + Math.random() * 0.25;
    smColor[idx] = color;
  }
}

function spawnFloat(x: number, y: number, text: string, color: string): void {
  const idx = flHead;
  flHead = (flHead + 1) % MAX_FLOAT;
  flX[idx] = x;
  flY[idx] = y;
  flLife[idx] = 0.9;
  flText[idx] = text;
  flColor[idx] = color;
}

function bakeFloor(): void {
  const arena = sim ? sim.arena : arenaId;
  // Base de color según el mapa (0 costo por frame: se dibuja una sola vez).
  floorCtx.fillStyle = arena === 'cementerio' ? '#2c332d'
    : arena === 'estacion' ? '#33363c'
    : arena === 'laberinto' ? '#36383e'
    : '#3c3f45';
  floorCtx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Grilla de baldosas.
  const tile = arena === 'cementerio' ? 48 : 64;
  floorCtx.strokeStyle = 'rgba(0,0,0,0.18)';
  floorCtx.lineWidth = 1;
  floorCtx.beginPath();
  for (let x = 0; x <= WORLD_W; x += tile) {
    floorCtx.moveTo(x, 0);
    floorCtx.lineTo(x, WORLD_H);
  }
  for (let y = 0; y <= WORLD_H; y += tile) {
    floorCtx.moveTo(0, y);
    floorCtx.lineTo(WORLD_W, y);
  }
  floorCtx.stroke();

  // Detalles ambientales únicos por mapa.
  if (arena === 'plaza') {
    // Medallón central de la plaza + sendas peatonales.
    floorCtx.fillStyle = 'rgba(255,255,255,0.045)';
    floorCtx.beginPath();
    floorCtx.arc(WORLD_W * 0.5, WORLD_H * 0.5, 130, 0, Math.PI * 2);
    floorCtx.fill();
    floorCtx.strokeStyle = 'rgba(255, 212, 71, 0.22)';
    floorCtx.lineWidth = 3;
    floorCtx.beginPath();
    floorCtx.arc(WORLD_W * 0.5, WORLD_H * 0.5, 118, 0, Math.PI * 2);
    floorCtx.stroke();
    floorCtx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = -2; i <= 2; i++) {
      floorCtx.fillRect(600 + i * 22, 60, 12, 38);
      floorCtx.fillRect(600 + i * 22, WORLD_H - 98, 12, 38);
    }
  } else if (arena === 'laberinto') {
    // Sectores pintados en el piso del búnker.
    floorCtx.fillStyle = 'rgba(255,255,255,0.07)';
    floorCtx.font = '600 42px Sora, sans-serif';
    floorCtx.textAlign = 'center';
    floorCtx.textBaseline = 'middle';
    floorCtx.fillText('A1', 160, 120);
    floorCtx.fillText('B2', 1120, 120);
    floorCtx.fillText('C3', 160, 600);
    floorCtx.fillText('D4', 1120, 600);
  } else if (arena === 'estacion') {
    // Vías de tren dobles + durmientes + líneas amarillas de andén.
    floorCtx.fillStyle = '#25272b';
    floorCtx.fillRect(420, 0, 440, WORLD_H);
    floorCtx.fillStyle = '#4a3d33';
    for (let y = 16; y < WORLD_H; y += 26) {
      floorCtx.fillRect(450, y, 120, 9);
      floorCtx.fillRect(710, y, 120, 9);
    }
    floorCtx.fillStyle = '#757c85';
    floorCtx.fillRect(470, 0, 8, WORLD_H);
    floorCtx.fillRect(542, 0, 8, WORLD_H);
    floorCtx.fillRect(730, 0, 8, WORLD_H);
    floorCtx.fillRect(802, 0, 8, WORLD_H);
    floorCtx.fillStyle = 'rgba(255, 208, 56, 0.55)';
    floorCtx.fillRect(410, 0, 8, WORLD_H);
    floorCtx.fillRect(862, 0, 8, WORLD_H);
  } else if (arena === 'cementerio') {
    // Caminos de tierra en cruz + halos cálidos de antorchas.
    floorCtx.fillStyle = '#3b372c';
    floorCtx.fillRect(WORLD_W * 0.5 - 48, 0, 96, WORLD_H);
    floorCtx.fillRect(0, WORLD_H * 0.5 - 48, WORLD_W, 96);
    const torches = [[296, 225], [984, 225], [296, 495], [984, 495]];
    for (let i = 0; i < torches.length; i++) {
      const [tx, ty] = torches[i];
      const g = floorCtx.createRadialGradient(tx, ty, 6, tx, ty, 95);
      g.addColorStop(0, 'rgba(255, 168, 56, 0.22)');
      g.addColorStop(1, 'rgba(255, 168, 56, 0)');
      floorCtx.fillStyle = g;
      floorCtx.beginPath();
      floorCtx.arc(tx, ty, 95, 0, Math.PI * 2);
      floorCtx.fill();
    }
  }

  // Puertas de spawn con franjas de peligro rojas/negras.
  floorCtx.fillStyle = 'rgba(215, 40, 40, 0.28)';
  floorCtx.fillRect(460, 0, 360, 22);
  floorCtx.fillRect(460, WORLD_H - 22, 360, 22);
  floorCtx.fillRect(0, 240, 22, 240);
  floorCtx.fillRect(WORLD_W - 22, 240, 22, 240);

  if (!sim) return;
  // Sombras proyectadas de las paredes (fijas en el piso).
  floorCtx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i < sim.walls.length; i++) {
    const w = sim.walls[i];
    floorCtx.fillRect(w.x + 8, w.y + 10, w.w, w.h);
  }
}

function stampShell(x: number, y: number): void {
  floorCtx.fillStyle = '#d4aa38';
  floorCtx.globalAlpha = 0.72;
  floorCtx.fillRect(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14, 4, 2);
  floorCtx.globalAlpha = 1;
}

function stampBlood(x: number, y: number, big: boolean, color: string): void {
  floorCtx.fillStyle = color;
  floorCtx.globalAlpha = big ? 0.65 : 0.45;
  const count = big ? 6 : 3;
  for (let i = 0; i < count; i++) {
    const ox = (Math.random() - 0.5) * (big ? 28 : 14);
    const oy = (Math.random() - 0.5) * (big ? 28 : 14);
    const s = big ? 6 + Math.random() * 8 : 4 + Math.random() * 4;
    floorCtx.fillRect(x + ox - s * 0.5, y + oy - s * 0.5, s, s);
  }
  floorCtx.globalAlpha = 1;
}

function stampScorch(x: number, y: number, r: number): void {
  floorCtx.fillStyle = '#1d1d1f';
  floorCtx.globalAlpha = 0.42;
  floorCtx.beginPath();
  floorCtx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  floorCtx.fill();
  floorCtx.globalAlpha = 1;
}

function makeShared(): Shared {
  const seats: SeatState[] = [];
  if (sim) {
    for (let i = 0; i < sim.players.length; i++) {
      const p = sim.players[i];
      seats.push({
        id: p.id,
        name: p.name,
        color: p.color,
        hp: Math.ceil(p.hp),
        maxHp: p.maxHp,
        downed: p.downed,
        dead: p.dead,
        score: p.score,
        kills: p.kills,
        weapon: p.weapon,
        ammo: p.ammo[p.weapon],
        unlocked: p.unlocked.slice(),
        dashReady: p.dashCd <= 0,
        perkChoices: p.perkChoices.slice(),
        pickedPerk: p.pickedPerk,
      });
    }
  } else {
    for (const s of slots.values()) {
      seats.push({
        id: s.id,
        name: s.name,
        color: s.color,
        hp: 100,
        maxHp: 100,
        downed: false,
        dead: false,
        score: 0,
        kills: 0,
        weapon: 'pistol',
        ammo: -1,
        unlocked: ['pistol', 'uzi'],
        dashReady: true,
        perkChoices: [],
        pickedPerk: false,
      });
    }
  }
  return {
    phase,
    arena: arenaId,
    mode: modeId,
    friendlyFire,
    wave: sim ? sim.wave : 1,
    combo: sim ? sim.combo : 0,
    lead: leadId,
    perkTime: Math.ceil(perkTime),
    seats,
    bestWave,
  };
}

let lastBroadcast = 0;
function broadcast(force = false): void {
  const now = performance.now();
  if (!force && now - lastBroadcast < 140) return;
  lastBroadcast = now;
  link.send({ t: 'all', d: makeShared() });
}

function startMatch(): void {
  const seeds: PlayerSeed[] = [];
  for (const s of slots.values()) {
    seeds.push({ id: s.id, name: s.name, color: s.color });
  }
  if (seeds.length === 0) {
    seeds.push({ id: -1, name: 'Demo', color: PLAYER_COLORS[0] });
  }
  sim = new BoxheadSim(arenaId, modeId, friendlyFire, seeds, Date.now());
  bakeFloor();
  phase = 'play';
  perkTime = 0;
  renderOverlay();
  broadcast(true);
}

function goLobby(): void {
  phase = 'lobby';
  sim = null;
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
        if (!slots.has(e.id) && slots.size < MAX_PLAYERS) {
          slots.set(e.id, {
            id: e.id,
            name: e.name || `Jugador ${e.id}`,
            color: PLAYER_COLORS[(e.id - 1) % PLAYER_COLORS.length],
          });
        }
      }
      for (const id of Array.from(slots.keys())) {
        if (!seen.has(id)) slots.delete(id);
      }
      if (leadId === null || !seen.has(leadId)) leadId = firstOn;
      renderOverlay();
      broadcast(true);
    } else if (msg.t === 'in') {
      if (sim && phase === 'play') {
        sim.setInput(msg.id, msg.x, msg.y, !!msg.k, !!msg.n, !!msg.b);
      }
    } else if (msg.t === 'cmd') {
      handleCommand(msg.id, msg.d);
    }
  },
  () => { /* */ },
);

function handleCommand(id: number, cmd: Command): void {
  const isLead = id === leadId || leadId === null;
  const slot = slots.get(id);
  if (cmd.a === 'name' && slot) {
    slot.name = String(cmd.name || '').trim().slice(0, 14) || slot.name;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'color' && slot) {
    if (PLAYER_COLORS.indexOf(cmd.color) >= 0) slot.color = cmd.color;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'arena' && isLead && phase === 'lobby') {
    if (ARENAS.some((a) => a.id === cmd.arena)) arenaId = cmd.arena;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'mode' && isLead && phase === 'lobby') {
    if (MODES.some((m) => m.id === cmd.mode)) modeId = cmd.mode;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'ff' && isLead && phase === 'lobby') {
    friendlyFire = !!cmd.on;
    renderOverlay();
    broadcast(true);
  } else if (cmd.a === 'weapon' && sim && phase === 'play') {
    sim.cycleWeapon(id, cmd.dir);
    broadcast(true);
  } else if (cmd.a === 'setWeapon' && sim && phase === 'play') {
    sim.setWeapon(id, cmd.weapon);
    broadcast(true);
  } else if (cmd.a === 'perk' && sim && phase === 'perk') {
    if (sim.pickPerk(id, cmd.perk)) {
      sound.pickup();
      if (sim.allPerksPicked()) nextWave();
      else broadcast(true);
    }
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

function nextWave(): void {
  if (!sim) return;
  sim.startWave(sim.wave + 1);
  phase = 'play';
  sound.wave();
  renderOverlay();
  broadcast(true);
}

// Teclado en compu / control remoto.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (phase === 'lobby' || phase === 'over')) startMatch();
});

// --- Overlays ---
function renderOverlay(): void {
  if (phase === 'play') {
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');

  if (phase === 'lobby') {
    const arenaChips = ARENAS.map((a) => `<div class="chip ${a.id === arenaId ? 'on' : ''}">${a.name}</div>`).join('');
    const modeChips = MODES.map((m) => `<div class="chip ${m.id === modeId ? 'on' : ''}">${m.name}</div>`).join('');
    const seatHtml = slots.size === 0
      ? '<div class="seat" style="opacity:0.6">Esperando hasta 6 celulares…</div>'
      : Array.from(slots.values()).map((s) => `<div class="seat"><span class="dot" style="background:${hex(s.color)}"></span>${esc(s.name)}${s.id === leadId ? ' ★' : ''}</div>`).join('');
    overlay.innerHTML = `
      <div class="card">
        <div class="col-main">
          <div class="brand"><img src="${logoUrl}" alt=""><span>galfredev · Boxhead</span></div>
          <h1>Boxhead: Horda</h1>
          <div class="sub">Hasta 6 jugadores contra la horda. Mejor oleada: <b>${bestWave || 1}</b></div>
          <div class="chips">${arenaChips}</div>
          <div class="chips">${modeChips}<div class="chip ${friendlyFire ? 'on' : ''}">Fuego amigo: ${friendlyFire ? 'Sí' : 'No'}</div></div>
          <div class="roster">${seatHtml}</div>
          <div class="hint-bar">El líder (★) elige mapa y arranca desde su celular. Entre oleadas todos eligen mejora.</div>
        </div>
        <div class="col-qr">
          <div class="qr-box">${qrSvg(qrCode)}</div>
          <div class="qr-hint">Escaneá para entrar con tu celular</div>
        </div>
      </div>`;
    return;
  }

  if (phase === 'perk' && sim) {
    const rows = sim.players.map((p) => `
      <div class="podium-row">
        <div class="podium-left"><span class="dot" style="background:${hex(p.color)}"></span>${esc(p.name)}</div>
        <div>${p.pickedPerk ? 'Listo ✓' : 'Eligiendo mejora en su celular…'}</div>
      </div>`).join('');
    overlay.innerHTML = `
      <div class="card podium">
        <div class="brand" style="justify-content:center"><img src="${logoUrl}" alt=""><span>Oleada ${sim.wave} superada</span></div>
        <h1>Elegí tu mejora</h1>
        <div class="sub">Siguiente oleada en ${Math.ceil(perkTime)} s</div>
        <div class="podium-list">${rows}</div>
      </div>`;
    return;
  }

  if (phase === 'over' && sim) {
    const sorted = sim.players.slice().sort((a, b) => b.score - a.score);
    const rows = sorted.map((p, idx) => `
      <div class="podium-row ${idx === 0 ? 'first' : ''}">
        <div class="podium-left"><span class="dot" style="background:${hex(p.color)}"></span>${idx + 1}. ${esc(p.name)}</div>
        <div>${p.score} pts · ${p.kills} bajas</div>
      </div>`).join('');
    overlay.innerHTML = `
      <div class="card podium">
        <div class="brand" style="justify-content:center"><img src="${logoUrl}" alt=""><span>Fin de la horda</span></div>
        <h1>Llegaron a la oleada ${sim.wave}</h1>
        <div class="sub">Récord del proyector: oleada ${bestWave}</div>
        <div class="podium-list">${rows}</div>
        <div class="hint-bar">El líder puede reiniciar o volver a la sala desde su celular.</div>
      </div>`;
  }
}

// --- Dibujo 2.5D estilo clásico Boxhead ---
function draw(dt: number): void {
  if (!sim) {
    ctx.fillStyle = '#25272b';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    return;
  }

  ctx.save();
  if (shake > 0) {
    const s = shake * 12;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    shake = Math.max(0, shake - dt * 4);
  }

  // 1. Piso + sangre acumulada en 1 sola llamada!
  ctx.drawImage(floorCanvas, 0, 0);

  // 2. Paredes con relieve 2.5D estilo Boxhead.
  for (let i = 0; i < sim.walls.length; i++) {
    const w = sim.walls[i];
    ctx.fillStyle = '#5c6169';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#7c828c';
    ctx.fillRect(w.x, w.y, w.w, 6);
    ctx.strokeStyle = '#1a1b1e';
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  // 2.5 Baliza interactiva de Caja de Suministros dorada.
  if (sim.supplyBeacon) {
    const sb = sim.supplyBeacon;
    const pulse = 18 + Math.sin(sim.time * 14) * 6;
    ctx.strokeStyle = '#ffd447';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sb.x, sb.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 212, 71, 0.16)';
    ctx.beginPath();
    ctx.arc(sb.x, sb.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd447';
    ctx.font = '600 12px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`SUMINISTRO ${Math.ceil(sb.timer)}s`, sb.x, sb.y - 26);
  }

  // 3. Cajas parpadeantes (munición / botiquín / suministro dorado).
  const blink = Math.floor(sim.time * 6) % 2 === 0;
  for (let i = 0; i < sim.crates.length; i++) {
    const c = sim.crates[i];
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(c.x - 11, c.y + 5, 24, 10);
    const sz = c.kind === 'supply' ? 26 : 22;
    const half = sz * 0.5;
    ctx.fillStyle = c.kind === 'supply' ? (blink ? '#fff2a6' : '#ffd447')
      : c.kind === 'med' ? (blink ? '#ffffff' : '#ff4466')
      : (blink ? '#ffd447' : '#c98a1a');
    ctx.fillRect(c.x - half, c.y - half, sz, sz);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - half, c.y - half, sz, sz);
    ctx.fillStyle = c.kind === 'med' ? '#e63946' : '#111';
    ctx.font = '600 13px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.kind === 'supply' ? '★' : c.kind === 'med' ? '+' : 'A', c.x, c.y + 1);
  }

  // 4. Props: barriles rojos, minas, muros falsos, torretas.
  for (let i = 0; i < sim.props.length; i++) {
    const pr = sim.props[i];
    if (pr.kind === 'barrel') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(pr.x + 3, pr.y + 9, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d92626';
      ctx.fillRect(pr.x - 12, pr.y - 14, 24, 26);
      ctx.fillStyle = '#ff6b3d';
      ctx.fillRect(pr.x - 12, pr.y - 4, 24, 6);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.strokeRect(pr.x - 12, pr.y - 14, 24, 26);
    } else if (pr.kind === 'mine') {
      ctx.fillStyle = '#262626';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = blink ? '#ff3333' : '#661111';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === 'wall') {
      ctx.fillStyle = '#8b6e4b';
      ctx.fillRect(pr.x - 18, pr.y - 18, 36, 36);
      ctx.strokeStyle = '#2a1f14';
      ctx.lineWidth = 2;
      ctx.strokeRect(pr.x - 18, pr.y - 18, 36, 36);
    } else if (pr.kind === 'turret') {
      ctx.fillStyle = '#334433';
      ctx.fillRect(pr.x - 12, pr.y - 12, 24, 24);
      ctx.strokeStyle = '#7dff6b';
      ctx.lineWidth = 2;
      ctx.strokeRect(pr.x - 12, pr.y - 12, 24, 24);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y);
      ctx.lineTo(pr.x + pr.aimX * 18, pr.y + pr.aimY * 18);
      ctx.stroke();
    }
  }

  // 5. Enemigos estilo Boxhead (cabezones cuadrados).
  for (let i = 0; i < sim.enemies.length; i++) {
    drawEnemy(sim.enemies[i]);
  }

  // 6. Jugadores estilo Boxhead (chaqueta de color + cabeza cuadrada + arma + nombre).
  for (let i = 0; i < sim.players.length; i++) {
    drawPlayer(sim.players[i]);
  }

  // 7. Proyectiles con estela para Railgun y cohetes.
  for (let i = 0; i < sim.projectiles.length; i++) {
    const b = sim.projectiles[i];
    if (b.pierce) {
      ctx.strokeStyle = '#4de8ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
      ctx.stroke();
    } else if (b.blast > 0 && !b.grenade) {
      ctx.strokeStyle = 'rgba(255, 160, 60, 0.55)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
      ctx.stroke();
    }
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 8. Humo y fuego cuadrado de explosiones (icónico de Boxhead).
  for (let i = 0; i < MAX_SMOKE; i++) {
    if (smLife[i] <= 0) continue;
    smLife[i] -= dt;
    smX[i] += smVx[i] * dt;
    smY[i] += smVy[i] * dt;
    ctx.globalAlpha = Math.max(0, smLife[i] * 2);
    ctx.fillStyle = smColor[i];
    const s = smSize[i];
    ctx.fillRect(smX[i] - s * 0.5, smY[i] - s * 0.5, s, s);
  }
  ctx.globalAlpha = 1;

  // 9. Textos flotantes (+Munición, ¡Reanimado!).
  ctx.font = '600 14px Sora, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < MAX_FLOAT; i++) {
    if (flLife[i] <= 0) continue;
    flLife[i] -= dt;
    flY[i] -= dt * 28;
    ctx.globalAlpha = Math.max(0, flLife[i]);
    ctx.fillStyle = flColor[i];
    ctx.fillText(flText[i], flX[i], flY[i]);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Barra de jefe arriba si hay un jefe vivo.
  const boss = sim.enemies.find((e) => e.kind === 'boss');
  if (boss) {
    const bw = 360;
    const bx = (WORLD_W - bw) * 0.5;
    ctx.fillStyle = 'rgba(14, 14, 18, 0.85)';
    ctx.fillRect(bx - 6, 62, bw + 12, 22);
    ctx.fillStyle = '#331115';
    ctx.fillRect(bx, 68, bw, 10);
    ctx.fillStyle = '#ff2a38';
    ctx.fillRect(bx, 68, bw * Math.max(0, boss.hp / boss.maxHp), 10);
    ctx.fillStyle = '#ffd447';
    ctx.font = '600 11px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JEFE DEMONIO', WORLD_W * 0.5, 58);
  }

  // HUD superior.
  const mult = Math.min(25, 1 + Math.floor(sim.combo / 3));
  const totalScore = sim.players.reduce((s, p) => s + p.score, 0);
  hud.innerHTML = `
    <div class="pill">Oleada ${sim.wave} <small>Enemigos ${sim.enemies.length}</small></div>
    ${sim.combo >= 3 ? `<div class="pill combo-pill">COMBO x${mult} <small>${sim.combo} bajas</small></div>` : ''}
    <div class="pill">${totalScore} pts <small>Récord Ol. ${bestWave || 1}</small></div>`;
}

function drawEnemy(en: Enemy): void {
  const s = en.r;
  // Sombra.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(en.x + 2, en.y + s * 0.7, s * 0.9, s * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyCol = en.hitFlash > 0
    ? '#ffffff'
    : en.kind === 'boss' ? '#990018'
    : en.kind === 'demon' ? '#d91e2a'
    : en.kind === 'bloater' ? '#6d8a2d'
    : en.kind === 'runner' ? '#9ed468'
    : '#5e8c45';
  const headCol = en.hitFlash > 0
    ? '#ffffff'
    : en.kind === 'boss' || en.kind === 'demon' ? '#ff2a38'
    : '#7bb556';

  // Torso cuadrado + cabeza cuadrada (Boxhead).
  ctx.fillStyle = bodyCol;
  ctx.fillRect(en.x - s * 0.72, en.y - s * 0.3, s * 1.44, s * 1.0);
  ctx.fillStyle = headCol;
  ctx.fillRect(en.x - s * 0.78, en.y - s * 1.15, s * 1.56, s * 1.05);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(en.x - s * 0.78, en.y - s * 1.15, s * 1.56, s * 1.05);

  // Cuernos para demonios y corona para jefes.
  if (en.kind === 'demon' || en.kind === 'boss') {
    ctx.fillStyle = en.kind === 'boss' ? '#ffd447' : '#2a0808';
    ctx.fillRect(en.x - s * 0.65, en.y - s * 1.42, 5, s * 0.3);
    ctx.fillRect(en.x + s * 0.65 - 5, en.y - s * 1.42, 5, s * 0.3);
  }

  // Ojos mirando hacia el objetivo.
  const ex = en.aimX * s * 0.25;
  const ey = en.aimY * s * 0.15;
  ctx.fillStyle = en.kind === 'demon' || en.kind === 'boss' ? '#ffe566' : '#111';
  ctx.fillRect(en.x + ex - 5, en.y - s * 0.75 + ey, 3, 3);
  ctx.fillRect(en.x + ex + 2, en.y - s * 0.75 + ey, 3, 3);

  // Barra de vida solo para jefes o enemigos heridos.
  if (en.kind === 'boss' || en.hp < en.maxHp) {
    const bw = s * 2;
    ctx.fillStyle = '#111';
    ctx.fillRect(en.x - bw * 0.5, en.y - s * 1.48, bw, 5);
    ctx.fillStyle = en.kind === 'boss' ? '#ffd447' : '#e63946';
    ctx.fillRect(en.x - bw * 0.5, en.y - s * 1.48, bw * Math.max(0, en.hp / en.maxHp), 5);
  }
}

function drawPlayer(p: Player): void {
  if (p.dead) return;
  const col = hex(p.color);

  // Sombra.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x + 2, p.y + 11, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p.downed) {
    // Jugador caído + aro de reanimación.
    ctx.strokeStyle = '#ff5555';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
    ctx.stroke();
    if (p.reviveT > 0) {
      ctx.strokeStyle = '#7dff6b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + (p.reviveT / 1.5) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.fillRect(p.x - 13, p.y - 6, 26, 12);
    ctx.fillStyle = '#ffddbb';
    ctx.fillRect(p.x - 8, p.y - 10, 16, 12);
    ctx.fillStyle = '#fff';
    ctx.font = '600 12px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`AYUDA ${Math.ceil(p.bleedT)}s`, p.x, p.y - 26);
    return;
  }

  // Flecha sutil de mira para no perder tu dirección entre 6.
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x + p.aimX * 18, p.y + p.aimY * 18);
  ctx.lineTo(p.x + p.aimX * 30, p.y + p.aimY * 30);
  ctx.stroke();

  // Cuerpo cuadrado (chaqueta de color) + cabeza cuadrada piel clara (Boxhead clásico).
  ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : col;
  ctx.fillRect(p.x - 11, p.y - 4, 22, 16);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x - 11, p.y - 4, 22, 16);

  ctx.fillStyle = p.dashT > 0 ? '#ffffff' : '#f5cfa0';
  ctx.fillRect(p.x - 12, p.y - 20, 24, 18);
  ctx.strokeRect(p.x - 12, p.y - 20, 24, 18);

  // Vincha / pelo del color del jugador para distinguir mejor entre 6.
  ctx.fillStyle = col;
  ctx.fillRect(p.x - 12, p.y - 20, 24, 5);

  // Ojos mirando hacia aimX/aimY.
  const ex = p.aimX * 4;
  const ey = p.aimY * 2;
  ctx.fillStyle = '#111';
  ctx.fillRect(p.x + ex - 5, p.y - 13 + ey, 3, 3);
  ctx.fillRect(p.x + ex + 2, p.y - 13 + ey, 3, 3);

  // Cañón diferenciado según el arma equipada.
  const gunLen = p.weapon === 'railgun' ? 28 : p.weapon === 'rocket' ? 26 : p.weapon === 'shotgun' ? 24 : p.weapon === 'uzi' ? 18 : 17;
  const gunW = p.weapon === 'rocket' ? 8 : p.weapon === 'railgun' ? 6 : 5;
  ctx.strokeStyle = p.weapon === 'railgun' ? '#4de8ff' : p.weapon === 'rocket' ? '#3d6e3a' : '#1c1c1c';
  ctx.lineWidth = gunW;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y + 2);
  ctx.lineTo(p.x + p.aimX * gunLen, p.y + 2 + p.aimY * gunLen);
  ctx.stroke();

  // Nombre corto + barrita de vida.
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 12px Sora, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.name, p.x, p.y - 30);
  ctx.fillStyle = '#111';
  ctx.fillRect(p.x - 16, p.y - 27, 32, 4);
  ctx.fillStyle = p.hp > 40 ? '#7dff6b' : '#ff5555';
  ctx.fillRect(p.x - 16, p.y - 27, 32 * (p.hp / p.maxHp), 4);
}

// --- Loop principal ---
let lastTs = performance.now();
let acc = 0;

function loop(ts: number): void {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  if (phase === 'play' && sim) {
    acc += dt;
    while (acc >= TICK) {
      acc -= TICK;
      sim.step(TICK);
      for (let i = 0; i < sim.events.length; i++) {
        const ev = sim.events[i];
        if (ev.kind === 'shot') {
          sound.shot(ev.weapon);
          if (ev.weapon === 'pistol' || ev.weapon === 'uzi' || ev.weapon === 'shotgun') {
            stampShell(ev.x, ev.y);
            spawnSmoke(ev.x + ev.ax * 18, ev.y + ev.ay * 18, 2, 70, '#ffe066', 6);
          } else if (ev.weapon === 'railgun') {
            spawnSmoke(ev.x + ev.ax * 22, ev.y + ev.ay * 22, 4, 100, '#4de8ff', 7);
          }
        } else if (ev.kind === 'blood') {
          stampBlood(ev.x, ev.y, ev.big, ev.color);
          if (ev.big) spawnSmoke(ev.x, ev.y, 6, 120, ev.color, 7);
        } else if (ev.kind === 'boom') {
          sound.boom();
          shake = 0.8;
          stampScorch(ev.x, ev.y, ev.r);
          spawnSmoke(ev.x, ev.y, 16, 230, '#ff8822', 14);
          spawnSmoke(ev.x, ev.y, 10, 140, '#444444', 18);
        } else if (ev.kind === 'pickup') {
          sound.pickup();
          spawnFloat(ev.x, ev.y - 16, ev.label, ev.color);
        } else if (ev.kind === 'dash') {
          sound.dash();
          spawnSmoke(ev.x, ev.y, 5, 90, hex(ev.color), 8);
        } else if (ev.kind === 'waveClear') {
          if (sim.wave > bestWave) {
            bestWave = sim.wave;
            try { localStorage.setItem('gd.boxhead.wave', String(bestWave)); } catch { /* */ }
          }
          phase = 'perk';
          perkTime = 12;
          sound.wave();
          renderOverlay();
          broadcast(true);
        } else if (ev.kind === 'gameOver') {
          if (sim.wave > bestWave) {
            bestWave = sim.wave;
            try { localStorage.setItem('gd.boxhead.wave', String(bestWave)); } catch { /* */ }
          }
          phase = 'over';
          renderOverlay();
          broadcast(true);
        }
      }
      if (phase !== 'play') break;
    }
    broadcast(false);
  } else if (phase === 'perk' && sim) {
    perkTime -= dt;
    renderOverlay();
    broadcast(false);
    if (perkTime <= 0) {
      // Auto-elige la primera opción para quien no tocó a tiempo.
      for (let i = 0; i < sim.players.length; i++) {
        const p = sim.players[i];
        if (!p.pickedPerk && p.perkChoices.length > 0) sim.pickPerk(p.id, p.perkChoices[0]);
      }
      nextWave();
    }
  }

  draw(dt);
  requestAnimationFrame(loop);
}

// Exponer helper mínimo para depuración si hace falta.
void WEAPON_BY_ID;
renderOverlay();
requestAnimationFrame(loop);
