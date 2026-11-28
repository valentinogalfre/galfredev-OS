import { COLORS, MAX_PLAYERS, type MapId, type ModeId, type PowerKind } from './protocol.ts';

export const WORLD_W = 1280;
export const WORLD_H = 720;
export const TICK = 1 / 60;

const RUNNER_R = 16;
const GRAVITY = 2150;
const MAX_VY = 1080;
const BASE_SPEED = 365;
const MAX_SPEED = 640;
const COYOTE_S = 0.09;
const BUFFER_S = 0.12;
const FLOOR_Y = 588;
const CEIL_Y = 132;
const MID_Y = 360;

export type PlatKind = 'solid' | 'moving' | 'crumble' | 'boost';

export interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PlatKind;
  baseY: number;
  amp: number;
  freq: number;
  phase: number;
  crumbleT: number; // -1 = intacto, >= 0 = contando para romperse
  broken: boolean;
}

export interface Zone {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'lowg' | 'flip';
}

export interface Portal {
  id: number;
  x: number;
  y: number;
  toX: number;
  toY: number;
  r: number;
}

export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: PowerKind;
  taken: boolean;
}

export interface Runner {
  id: number;
  name: string;
  color: number;
  bot: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: 1 | -1; // 1 = cae hacia abajo (piso), -1 = cae hacia arriba (techo)
  grounded: boolean;
  coyote: number;
  buffer: number;
  alive: boolean;
  eliminatedOrder: number;
  shield: boolean;
  turboT: number;
  invulnT: number;
  airFlips: number;
  portalCd: number;
  flipZoneId: number;
  meters: number;
  botSkill: number;
  botCd: number;
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead: number;
  trailCount: number;
}

export type SimEvent =
  | { kind: 'flip'; id: number; x: number; y: number; dir: 1 | -1; color: number }
  | { kind: 'land'; id: number; x: number; y: number; dir: 1 | -1; color: number }
  | { kind: 'power'; id: number; name: string; power: PowerKind; x: number; y: number; color: number }
  | { kind: 'shield'; id: number; x: number; y: number; color: number }
  | { kind: 'portal'; id: number; x: number; y: number; toX: number; toY: number; color: number }
  | { kind: 'die'; id: number; x: number; y: number; color: number }
  | { kind: 'roundEnd'; winnerId: number | null };

export interface RosterSeed {
  id: number;
  name: string;
  color: number;
  bot: boolean;
}

/** Generador determinístico liviano (Mulberry32) para pistas reproducibles en tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GravitySim {
  readonly map: MapId;
  readonly mode: ModeId;
  runners: Runner[] = [];
  platforms: Platform[] = [];
  zones: Zone[] = [];
  portals: Portal[] = [];
  pickups: Pickup[] = [];
  events: SimEvent[] = [];

  camX = 0;
  speed = BASE_SPEED;
  time = 0;
  meters = 0;
  slowMo = 0;
  finished = false;
  winnerId: number | null = null;

  private rng: () => number;
  private nextId = 1;
  private genX = 0;
  private elimCounter = 0;
  private lastSafeSide: 1 | -1 = 1;
  private startX = 240;

  constructor(map: MapId, mode: ModeId, seeds: RosterSeed[], seed = Date.now()) {
    this.map = map;
    this.mode = mode;
    this.rng = mulberry32(seed);
    this.initLevel();
    this.initRunners(seeds);
  }

  private initLevel(): void {
    // Plataforma inicial larga arriba y abajo para una largada limpia y sin trampas.
    this.addPlatform(0, FLOOR_Y, 1180, 32, 'solid');
    this.addPlatform(0, CEIL_Y - 32, 1180, 32, 'solid');
    this.genX = 1180;
    this.ensureAhead(WORLD_W * 2.4);
  }

  private initRunners(seeds: RosterSeed[]): void {
    const list = seeds.slice(0, MAX_PLAYERS);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const trailLen = 14;
      this.runners.push({
        id: s.id,
        name: s.name,
        color: s.color || COLORS[i % COLORS.length],
        bot: s.bot,
        x: this.startX + (list.length - 1 - i) * 54,
        y: FLOOR_Y - RUNNER_R,
        vx: BASE_SPEED,
        vy: 0,
        dir: 1,
        grounded: true,
        coyote: COYOTE_S,
        buffer: 0,
        alive: true,
        eliminatedOrder: 0,
        shield: false,
        turboT: 0,
        invulnT: 0,
        airFlips: 0,
        portalCd: 0,
        flipZoneId: 0,
        meters: 0,
        botSkill: 0.72 + (i % 4) * 0.08,
        botCd: 0,
        trailX: new Float32Array(trailLen),
        trailY: new Float32Array(trailLen),
        trailHead: 0,
        trailCount: 0,
      });
    }
  }

  private addPlatform(x: number, y: number, w: number, h: number, kind: PlatKind, amp = 0, freq = 0): Platform {
    const p: Platform = {
      id: this.nextId++,
      x,
      y,
      w,
      h,
      kind,
      baseY: y,
      amp,
      freq,
      phase: this.rng() * Math.PI * 2,
      crumbleT: -1,
      broken: false,
    };
    this.platforms.push(p);
    return p;
  }

  private pickPower(): PowerKind {
    const kinds: PowerKind[] = ['escudo', 'pulso', 'turbo', 'doble', 'quiebre'];
    return kinds[Math.floor(this.rng() * kinds.length)];
  }

  /** Genera bloques de obstáculos diseñados a mano por mapa, siempre garantizando un camino jugable. */
  ensureAhead(targetX: number): void {
    while (this.genX < targetX) {
      const difficulty = Math.min(1, this.genX / 13000);
      const roll = this.rng();

      // Cada mapa favorece sus propios set-pieces memorables.
      if (this.map === 'reactor' && roll < 0.34) {
        this.genReactorElevator(difficulty);
      } else if (this.map === 'inversor' && roll < 0.36) {
        this.genPortalChasm(difficulty);
      } else if (this.map === 'caos' && roll < 0.36) {
        this.genFragileBridge(difficulty);
      } else if (roll < 0.52) {
        this.genDualRoute(difficulty);
      } else if (roll < 0.68) {
        this.genSlalom(difficulty);
      } else if (roll < 0.84) {
        this.genGravityStairs(difficulty);
      } else {
        this.genLowGVault(difficulty);
      }
    }
  }

  /** Set-piece 1: Doble ruta riesgo/recompensa (camino seguro + isla central con poder garantizado). */
  private genDualRoute(difficulty: number): void {
    const gap = Math.round(115 + difficulty * 45);
    const x0 = this.genX + gap;
    const segW = 460;
    const safeSide = this.lastSafeSide === 1 ? -1 : 1;
    this.lastSafeSide = safeSide;

    const safeY = safeSide === 1 ? FLOOR_Y : CEIL_Y - 28;
    const oppY = safeSide === 1 ? CEIL_Y - 28 : FLOOR_Y;
    this.addPlatform(x0 - 45, safeY, segW + 60, 28, 'solid');
    this.addPlatform(x0 + 40, oppY, segW - 90, 28, this.rng() < 0.45 ? 'boost' : 'solid');

    // Isla central elevada con poder garantizado para el que se anime a arriesgar.
    const midKind: PlatKind = this.map === 'caos' ? 'crumble' : 'solid';
    this.addPlatform(x0 + 130, MID_Y - 12, 190, 24, midKind);
    this.pickups.push({
      id: this.nextId++,
      x: x0 + 225,
      y: MID_Y - 46,
      kind: this.pickPower(),
      taken: false,
    });
    this.genX = x0 + segW;
  }

  /** Set-piece 2: Slalom clásico de G-Switch (alternancia rítmica piso/techo con rampas de velocidad). */
  private genSlalom(difficulty: number): void {
    let x = this.genX;
    const steps = 3;
    let side = this.lastSafeSide;
    for (let s = 0; s < steps; s++) {
      side = side === 1 ? -1 : 1;
      const gap = Math.round(110 + difficulty * 40);
      const w = Math.round(230 - difficulty * 35);
      x += gap;
      const y = side === 1 ? FLOOR_Y - (s % 2) * 26 : CEIL_Y - 28 + (s % 2) * 26;
      const kind: PlatKind = s === 1 && this.rng() < 0.6 ? 'boost' : (this.map === 'caos' && this.rng() < 0.35 ? 'crumble' : 'solid');
      this.addPlatform(x - 36, y, w + 48, 28, kind);
      if (s === 1 && (this.map === 'inversor' || this.map === 'caos')) {
        this.zones.push({ id: this.nextId++, x: x + w * 0.5, y: CEIL_Y - 10, w: 22, h: FLOOR_Y - CEIL_Y + 20, kind: 'flip' });
      }
      x += w;
    }
    this.lastSafeSide = side;
    this.genX = x;
  }

  /** Set-piece 3: Escaleras de gravedad (terrazas ascendentes/descendentes con poder en la cima). */
  private genGravityStairs(difficulty: number): void {
    const gap = Math.round(110 + difficulty * 40);
    const x0 = this.genX + gap;
    const side: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
    this.lastSafeSide = side;

    for (let i = 0; i < 3; i++) {
      const px = x0 + i * 170;
      const py = side === 1 ? FLOOR_Y - i * 44 : CEIL_Y - 28 + i * 44;
      this.addPlatform(px - 28, py, 165, 26, i === 2 ? 'boost' : 'solid');
    }
    // Techo/piso opuesto de rescate al final.
    const oppY = side === 1 ? CEIL_Y - 28 : FLOOR_Y;
    this.addPlatform(x0 + 180, oppY, 310, 28, 'solid');
    if (this.rng() < 0.65) {
      this.pickups.push({
        id: this.nextId++,
        x: x0 + 390,
        y: side === 1 ? FLOOR_Y - 140 : CEIL_Y + 140,
        kind: this.pickPower(),
        taken: false,
      });
    }
    this.genX = x0 + 500;
  }

  /** Set-piece 4: Ascensor del Reactor (plataformas móviles en contrafase + campo baja-G). */
  private genReactorElevator(difficulty: number): void {
    const gap = Math.round(110 + difficulty * 35);
    const x0 = this.genX + gap;
    this.zones.push({ id: this.nextId++, x: x0, y: CEIL_Y, w: 540, h: FLOOR_Y - CEIL_Y, kind: 'lowg' });

    this.addPlatform(x0 - 40, FLOOR_Y - 18, 220, 28, 'moving', 44, 1.9);
    this.addPlatform(x0 + 180, CEIL_Y - 10, 240, 28, 'moving', 44, 1.9);
    this.addPlatform(x0 + 360, FLOOR_Y - 12, 220, 28, 'boost');

    this.pickups.push({
      id: this.nextId++,
      x: x0 + 270,
      y: MID_Y,
      kind: this.pickPower(),
      taken: false,
    });
    this.lastSafeSide = 1;
    this.genX = x0 + 560;
  }

  /** Set-piece 5: Salto de Portal (portal que cruza un abismo + láser inversor). */
  private genPortalChasm(difficulty: number): void {
    const gap = Math.round(105 + difficulty * 35);
    const x0 = this.genX + gap;
    const fromFloor = this.lastSafeSide === 1;

    const entryY = fromFloor ? FLOOR_Y : CEIL_Y - 28;
    const exitY = fromFloor ? CEIL_Y - 28 : FLOOR_Y;
    this.addPlatform(x0 - 45, entryY, 240, 28, 'solid');
    this.addPlatform(x0 + 260, exitY, 320, 28, 'solid');
    // Plataforma alternativa opuesta por si alguien no entra al portal.
    this.addPlatform(x0 + 80, exitY, 170, 26, 'solid');

    this.portals.push({
      id: this.nextId++,
      x: x0 + 130,
      y: fromFloor ? entryY - 52 : entryY + 80,
      toX: x0 + 340,
      toY: fromFloor ? exitY + 82 : exitY - 52,
      r: 28,
    });
    if (this.rng() < 0.65) {
      this.zones.push({ id: this.nextId++, x: x0 + 470, y: CEIL_Y - 10, w: 22, h: FLOOR_Y - CEIL_Y + 20, kind: 'flip' });
    }
    this.lastSafeSide = fromFloor ? -1 : 1;
    this.genX = x0 + 560;
  }

  /** Set-piece 6: Puente frágil del Caos (se rompe bajo el puntero, obligando a los de atrás a invertir). */
  private genFragileBridge(difficulty: number): void {
    const gap = Math.round(105 + difficulty * 40);
    const x0 = this.genX + gap;
    const side: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
    const bridgeY = side === 1 ? FLOOR_Y : CEIL_Y - 28;
    const escapeY = side === 1 ? CEIL_Y - 28 : FLOOR_Y;

    for (let i = 0; i < 4; i++) {
      this.addPlatform(x0 - 30 + i * 135, bridgeY, 128, 28, 'crumble');
    }
    // Pista de escape en el lado opuesto con huecos.
    this.addPlatform(x0 + 90, escapeY, 180, 26, 'solid');
    this.addPlatform(x0 + 350, escapeY, 200, 26, 'boost');

    this.pickups.push({
      id: this.nextId++,
      x: x0 + 260,
      y: MID_Y,
      kind: this.pickPower(),
      taken: false,
    });
    this.lastSafeSide = side === 1 ? -1 : 1;
    this.genX = x0 + 540;
  }

  /** Set-piece 7: Bóveda de baja gravedad (gran salto flotante con poder en el aire). */
  private genLowGVault(difficulty: number): void {
    const gap = Math.round(115 + difficulty * 40);
    const x0 = this.genX + gap;
    this.zones.push({ id: this.nextId++, x: x0 - 20, y: CEIL_Y, w: 480, h: FLOOR_Y - CEIL_Y, kind: 'lowg' });
    this.addPlatform(x0 - 45, FLOOR_Y, 200, 28, 'boost');
    this.addPlatform(x0 + 140, CEIL_Y - 28, 220, 28, 'solid');
    this.addPlatform(x0 + 320, FLOOR_Y, 220, 28, 'solid');
    this.pickups.push({
      id: this.nextId++,
      x: x0 + 240,
      y: MID_Y,
      kind: this.pickPower(),
      taken: false,
    });
    this.lastSafeSide = 1;
    this.genX = x0 + 520;
  }

  /** Pide invertir la gravedad de un jugador. Si está en el aire, guarda buffer o usa doble salto. */
  flip(id: number): boolean {
    const r = this.runners.find((u) => u.id === id);
    if (!r || !r.alive || this.finished) return false;
    return this.tryFlip(r, true);
  }

  private tryFlip(r: Runner, allowBuffer: boolean): boolean {
    if (r.grounded || r.coyote > 0) {
      r.dir = r.dir === 1 ? -1 : 1;
      r.grounded = false;
      r.coyote = 0;
      r.buffer = 0;
      r.vy = r.dir * 260;
      this.events.push({ kind: 'flip', id: r.id, x: r.x, y: r.y, dir: r.dir, color: r.color });
      return true;
    }
    if (r.airFlips > 0) {
      r.airFlips--;
      r.dir = r.dir === 1 ? -1 : 1;
      r.vy = r.dir * 280;
      r.buffer = 0;
      this.events.push({ kind: 'flip', id: r.id, x: r.x, y: r.y, dir: r.dir, color: r.color });
      return true;
    }
    if (allowBuffer) r.buffer = BUFFER_S;
    return false;
  }

  step(dt = TICK): void {
    this.events.length = 0;
    if (this.finished) return;

    const effDt = this.slowMo > 0 ? dt * 0.35 : dt;
    if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - dt);
    this.time += effDt;

    const speedRate = this.map === 'caos' ? 14 : 9.5;
    this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.time * speedRate);

    // Mover plataformas oscilantes y actualizar pisos frágiles.
    for (let i = 0; i < this.platforms.length; i++) {
      const p = this.platforms[i];
      if (p.kind === 'moving' && !p.broken) {
        p.y = p.baseY + Math.sin(this.time * p.freq + p.phase) * p.amp;
      }
      if (p.crumbleT >= 0 && !p.broken) {
        p.crumbleT += effDt;
        if (p.crumbleT >= 0.42) p.broken = true;
      }
    }

    // Referencia del puntero para mantener pelotón y mover cámara.
    let leadX = this.camX + 420;
    let aliveCount = 0;
    for (let i = 0; i < this.runners.length; i++) {
      const r = this.runners[i];
      if (!r.alive) continue;
      aliveCount++;
      if (r.x > leadX) leadX = r.x;
    }

    for (let i = 0; i < this.runners.length; i++) {
      const r = this.runners[i];
      if (!r.alive) continue;
      if (r.bot) this.thinkBot(r, effDt);
      this.stepRunner(r, effDt, leadX);
    }

    // Actualizar cámara siguiendo suavemente al puntero.
    let newLead = this.camX + 420;
    let lastAlive: Runner | null = null;
    aliveCount = 0;
    for (let i = 0; i < this.runners.length; i++) {
      const r = this.runners[i];
      if (!r.alive) continue;
      aliveCount++;
      lastAlive = r;
      if (r.x > newLead) newLead = r.x;
    }
    const desiredCam = Math.max(this.camX, newLead - WORLD_W * 0.38);
    this.camX += (desiredCam - this.camX) * Math.min(1, effDt * 8.5);
    this.meters = Math.max(this.meters, Math.floor((newLead - this.startX) / 22));

    this.ensureAhead(this.camX + WORLD_W * 2.2);
    this.pruneBehind(this.camX - 360);

    // Fin de ronda: en Rondas con 2+ corredores gana el último en pie; en Distancia o 1 jugador termina al morir todos.
    const multi = this.runners.length > 1;
    if (this.mode === 'rondas' && multi && aliveCount <= 1) {
      this.finished = true;
      this.winnerId = lastAlive ? lastAlive.id : null;
      this.slowMo = 0.45;
      this.events.push({ kind: 'roundEnd', winnerId: this.winnerId });
    } else if (aliveCount === 0) {
      this.finished = true;
      let best: Runner | null = null;
      for (let i = 0; i < this.runners.length; i++) {
        if (!best || this.runners[i].meters > best.meters) best = this.runners[i];
      }
      this.winnerId = best ? best.id : null;
      this.events.push({ kind: 'roundEnd', winnerId: this.winnerId });
    }
  }

  private stepRunner(r: Runner, dt: number, leadX: number): void {
    if (r.turboT > 0) r.turboT = Math.max(0, r.turboT - dt);
    if (r.invulnT > 0) r.invulnT = Math.max(0, r.invulnT - dt);
    if (r.portalCd > 0) r.portalCd = Math.max(0, r.portalCd - dt);
    if (r.coyote > 0) r.coyote = Math.max(0, r.coyote - dt);
    if (r.buffer > 0) r.buffer = Math.max(0, r.buffer - dt);

    // Velocidad horizontal: base + leve ayuda si quedó un poco atrás, o turbo.
    const gapBehind = Math.max(0, leadX - r.x);
    const catchup = Math.min(55, gapBehind * 0.12);
    const targetVx = (this.speed + catchup) * (r.turboT > 0 ? 1.36 : 1);
    r.vx += (targetVx - r.vx) * Math.min(1, dt * 7);

    // Comprobar zonas (baja gravedad / láser inversor).
    let gravScale = 1;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (r.x >= z.x && r.x <= z.x + z.w && r.y >= z.y && r.y <= z.y + z.h) {
        if (z.kind === 'lowg') gravScale = 0.56;
        else if (z.kind === 'flip' && r.flipZoneId !== z.id) {
          r.flipZoneId = z.id;
          r.dir = r.dir === 1 ? -1 : 1;
          r.grounded = false;
          r.vy = r.dir * 240;
          this.events.push({ kind: 'flip', id: r.id, x: r.x, y: r.y, dir: r.dir, color: r.color });
        }
      }
    }

    const prevX = r.x;
    const prevY = r.y;
    const wasGrounded = r.grounded;
    r.grounded = false;

    // Avance horizontal y choque contra frentes de plataformas.
    r.x += r.vx * dt;
    if (r.turboT <= 0 && r.invulnT <= 0) {
      for (let i = 0; i < this.platforms.length; i++) {
        const p = this.platforms[i];
        if (p.broken) continue;
        if (r.y + RUNNER_R - 4 > p.y && r.y - RUNNER_R + 4 < p.y + p.h) {
          if (prevX + RUNNER_R <= p.x + 6 && r.x + RUNNER_R > p.x) {
            r.x = p.x - RUNNER_R;
            r.vx = Math.min(r.vx, 40);
          }
        }
      }
    }

    // Gravedad y avance vertical.
    r.vy += r.dir * GRAVITY * gravScale * dt;
    if (r.vy > MAX_VY) r.vy = MAX_VY;
    if (r.vy < -MAX_VY) r.vy = -MAX_VY;
    r.y += r.vy * dt;

    // Colisión vertical con plataformas.
    for (let i = 0; i < this.platforms.length; i++) {
      const p = this.platforms[i];
      if (p.broken) continue;
      if (r.x + RUNNER_R - 3 <= p.x || r.x - RUNNER_R + 3 >= p.x + p.w) continue;

      if (r.dir === 1 && r.vy >= 0) {
        if (prevY + RUNNER_R <= p.y + 14 && r.y + RUNNER_R >= p.y) {
          r.y = p.y - RUNNER_R;
          r.vy = 0;
          r.grounded = true;
          r.coyote = COYOTE_S;
          if (p.kind === 'crumble' && p.crumbleT < 0) p.crumbleT = 0;
          if (p.kind === 'boost') r.turboT = Math.max(r.turboT, 0.95);
          if (!wasGrounded) this.events.push({ kind: 'land', id: r.id, x: r.x, y: p.y, dir: 1, color: r.color });
        }
      } else if (r.dir === -1 && r.vy <= 0) {
        const bot = p.y + p.h;
        if (prevY - RUNNER_R >= bot - 14 && r.y - RUNNER_R <= bot) {
          r.y = bot + RUNNER_R;
          r.vy = 0;
          r.grounded = true;
          r.coyote = COYOTE_S;
          if (p.kind === 'crumble' && p.crumbleT < 0) p.crumbleT = 0;
          if (p.kind === 'boost') r.turboT = Math.max(r.turboT, 0.95);
          if (!wasGrounded) this.events.push({ kind: 'land', id: r.id, x: r.x, y: bot, dir: -1, color: r.color });
        }
      }
    }

    // Ejecutar flip en buffer apenas aterriza.
    if (r.grounded && r.buffer > 0) {
      this.tryFlip(r, false);
    }

    // Portales.
    if (r.portalCd <= 0) {
      for (let i = 0; i < this.portals.length; i++) {
        const po = this.portals[i];
        const dx = r.x - po.x;
        const dy = r.y - po.y;
        if (dx * dx + dy * dy <= (po.r + RUNNER_R) * (po.r + RUNNER_R)) {
          r.x = po.toX;
          r.y = po.toY;
          r.vy = 0;
          r.portalCd = 0.6;
          this.events.push({ kind: 'portal', id: r.id, x: po.x, y: po.y, toX: po.toX, toY: po.toY, color: r.color });
          break;
        }
      }
    }

    // Recoger poderes (activación automática al tocarlos).
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (pk.taken) continue;
      const dx = r.x - pk.x;
      const dy = r.y - pk.y;
      if (dx * dx + dy * dy <= (24 + RUNNER_R) * (24 + RUNNER_R)) {
        pk.taken = true;
        this.applyPower(r, pk.kind, pk.x, pk.y);
      }
    }

    // Estela (ring buffer fijo, cero allocs por frame).
    r.trailX[r.trailHead] = r.x;
    r.trailY[r.trailHead] = r.y;
    r.trailHead = (r.trailHead + 1) % r.trailX.length;
    if (r.trailCount < r.trailX.length) r.trailCount++;

    r.meters = Math.max(r.meters, Math.floor((r.x - this.startX) / 22));

    // Caída fuera de pantalla o quedado atrás.
    const out = r.y < -55 || r.y > WORLD_H + 55 || r.x < this.camX - 55;
    if (out) {
      if (r.shield) {
        r.shield = false;
        r.invulnT = 1.1;
        this.rescueRunner(r, leadX);
        this.events.push({ kind: 'shield', id: r.id, x: r.x, y: r.y, color: r.color });
      } else {
        r.alive = false;
        r.eliminatedOrder = ++this.elimCounter;
        this.events.push({ kind: 'die', id: r.id, x: Math.max(this.camX + 20, r.x), y: Math.max(30, Math.min(WORLD_H - 30, r.y)), color: r.color });
      }
    }
  }

  private rescueRunner(r: Runner, leadX: number): void {
    // Busca una plataforma segura cerca del puntero.
    const wantX = Math.max(this.camX + 240, leadX - 40);
    let best: Platform | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.platforms.length; i++) {
      const p = this.platforms[i];
      if (p.broken || p.w < 80) continue;
      const cx = p.x + p.w * 0.5;
      const d = Math.abs(cx - wantX);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best) {
      r.x = Math.max(best.x + 30, Math.min(best.x + best.w - 30, wantX));
      if (best.y > MID_Y) {
        r.dir = 1;
        r.y = best.y - RUNNER_R - 4;
      } else {
        r.dir = -1;
        r.y = best.y + best.h + RUNNER_R + 4;
      }
    } else {
      r.x = wantX;
      r.y = MID_Y;
    }
    r.vy = 0;
    r.vx = this.speed;
  }

  private applyPower(r: Runner, kind: PowerKind, x: number, y: number): void {
    this.events.push({ kind: 'power', id: r.id, name: r.name, power: kind, x, y, color: r.color });
    if (kind === 'escudo') {
      r.shield = true;
    } else if (kind === 'turbo') {
      r.turboT = 2.3;
    } else if (kind === 'doble') {
      r.airFlips = Math.min(3, r.airFlips + 2);
    } else if (kind === 'pulso') {
      for (let i = 0; i < this.runners.length; i++) {
        const other = this.runners[i];
        if (other.id === r.id || !other.alive || other.invulnT > 0) continue;
        other.dir = other.dir === 1 ? -1 : 1;
        other.grounded = false;
        other.vy = other.dir * 280;
        this.events.push({ kind: 'flip', id: other.id, x: other.x, y: other.y, dir: other.dir, color: other.color });
      }
    } else if (kind === 'quiebre') {
      // Convierte en frágil la plataforma que el corredor pisa o dejó justo atrás.
      for (let i = 0; i < this.platforms.length; i++) {
        const p = this.platforms[i];
        if (p.broken) continue;
        if (p.x + p.w >= r.x - 220 && p.x <= r.x + 60) {
          p.kind = 'crumble';
          if (p.crumbleT < 0) p.crumbleT = 0.08;
        }
      }
    }
  }

  private thinkBot(r: Runner, dt: number): void {
    if (r.botCd > 0) {
      r.botCd -= dt;
      return;
    }
    if (!r.grounded && r.airFlips === 0) return;

    const lookAhead = 72 + (r.vx - BASE_SPEED) * 0.14;
    const probeX = r.x + lookAhead;
    const hasSupport = this.hasPlatformUnder(probeX, r.y, r.dir);
    const wallAhead = this.hasWallAhead(r.x, r.y, 44);
    if (!hasSupport || wallAhead) {
      // Chequea si del otro lado hay plataforma para aterrizar.
      const oppHas = this.hasPlatformUnder(probeX + 45, r.y, r.dir === 1 ? -1 : 1);
      if (oppHas || wallAhead) {
        if (this.rng() < r.botSkill + 0.2) {
          this.tryFlip(r, false);
          r.botCd = 0.16;
        }
      }
    }
  }

  private hasPlatformUnder(x: number, y: number, dir: 1 | -1): boolean {
    for (let i = 0; i < this.platforms.length; i++) {
      const p = this.platforms[i];
      if (p.broken) continue;
      if (x < p.x - 10 || x > p.x + p.w + 10) continue;
      if (dir === 1 && p.y >= y - 10) return true;
      if (dir === -1 && p.y + p.h <= y + 10) return true;
    }
    return false;
  }

  private hasWallAhead(x: number, y: number, dist: number): boolean {
    for (let i = 0; i < this.platforms.length; i++) {
      const p = this.platforms[i];
      if (p.broken) continue;
      if (p.x >= x && p.x <= x + dist && y + RUNNER_R - 4 > p.y && y - RUNNER_R + 4 < p.y + p.h) {
        return true;
      }
    }
    return false;
  }

  private pruneBehind(minX: number): void {
    if (this.platforms.length > 60) {
      this.platforms = this.platforms.filter((p) => !p.broken && p.x + p.w > minX);
    }
    if (this.zones.length > 20) {
      this.zones = this.zones.filter((z) => z.x + z.w > minX);
    }
    if (this.portals.length > 12) {
      this.portals = this.portals.filter((p) => p.toX > minX);
    }
    if (this.pickups.length > 24) {
      this.pickups = this.pickups.filter((p) => !p.taken && p.x > minX);
    }
  }

  /** Orden final de la ronda: primero los vivos (más lejos), luego los últimos en caer. */
  ranking(): Runner[] {
    return this.runners.slice().sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (a.eliminatedOrder !== b.eliminatedOrder) return b.eliminatedOrder - a.eliminatedOrder;
      return b.meters - a.meters;
    });
  }
}
