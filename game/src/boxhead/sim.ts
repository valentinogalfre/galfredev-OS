import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  WEAPON_BY_ID,
  WEAPONS,
  type ArenaId,
  type ModeId,
  type PerkId,
  type WeaponId,
} from './protocol.ts';

export const WORLD_W = 1280;
export const WORLD_H = 720;
export const TICK = 1 / 60;

const PLAYER_R = 14;
const PLAYER_SPEED = 235;
const DASH_SPEED = 640;
const DASH_DUR = 0.2;
const DASH_CD = 1.35;
const REVIVE_DIST = 54;
const REVIVE_TIME = 1.5;
const BLEED_TIME = 14;
const MAX_ENEMIES = 55;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Player {
  id: number;
  name: string;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimX: number;
  aimY: number;
  hp: number;
  maxHp: number;
  downed: boolean;
  bleedT: number;
  reviveT: number;
  dead: boolean;
  score: number;
  kills: number;
  weapon: WeaponId;
  unlocked: WeaponId[];
  ammo: Record<WeaponId, number>;
  fireCd: number;
  dashT: number;
  dashCd: number;
  dashDx: number;
  dashDy: number;
  hitFlash: number;
  // Mejoras acumuladas
  rateMult: number;
  speedMult: number;
  blastMult: number;
  ricochet: number;
  perkChoices: PerkId[];
  pickedPerk: boolean;
  // Entradas actuales
  inX: number;
  inY: number;
  inFire: boolean;
  inDash: boolean;
  inAlt: boolean;
  prevDash: boolean;
  prevAlt: boolean;
}

export type EnemyKind = 'zombie' | 'runner' | 'demon' | 'bloater' | 'boss';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  atkCd: number;
  hitFlash: number;
  aimX: number;
  aimY: number;
}

export interface Projectile {
  id: number;
  ownerId: number; // <0 = enemigo
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  r: number;
  life: number;
  blast: number;
  pierce: boolean;
  bounces: number;
  grenade: boolean;
  enemyShot: boolean;
  color: string;
  hitIds: number[];
}

export interface Prop {
  id: number;
  kind: 'barrel' | 'mine' | 'wall' | 'turret';
  ownerId: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  fireCd: number;
  aimX: number;
  aimY: number;
}

export interface Crate {
  id: number;
  kind: 'ammo' | 'med' | 'supply';
  x: number;
  y: number;
  life: number;
}

export interface SupplyBeacon {
  x: number;
  y: number;
  timer: number;
}

export type SimEvent =
  | { kind: 'shot'; weapon: WeaponId; x: number; y: number; ax: number; ay: number }
  | { kind: 'blood'; x: number; y: number; big: boolean; color: string }
  | { kind: 'boom'; x: number; y: number; r: number }
  | { kind: 'pickup'; x: number; y: number; label: string; color: string }
  | { kind: 'dash'; x: number; y: number; color: number }
  | { kind: 'waveClear'; wave: number }
  | { kind: 'gameOver' };

export interface PlayerSeed {
  id: number;
  name: string;
  color: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildArenaWalls(arena: ArenaId): Rect[] {
  const T = 36;
  const walls: Rect[] = [
    // Bordes exteriores con huecos de entrada para zombies (puertas).
    { x: 0, y: 0, w: 460, h: T },
    { x: 820, y: 0, w: 460, h: T },
    { x: 0, y: WORLD_H - T, w: 460, h: T },
    { x: 820, y: WORLD_H - T, w: 460, h: T },
    { x: 0, y: 0, w: T, h: 240 },
    { x: 0, y: 480, w: T, h: 240 },
    { x: WORLD_W - T, y: 0, w: T, h: 240 },
    { x: WORLD_W - T, y: 480, w: T, h: 240 },
  ];
  if (arena === 'plaza') {
    walls.push(
      { x: 320, y: 200, w: 72, h: 72 },
      { x: 888, y: 200, w: 72, h: 72 },
      { x: 320, y: 448, w: 72, h: 72 },
      { x: 888, y: 448, w: 72, h: 72 },
    );
  } else if (arena === 'laberinto') {
    walls.push(
      { x: 240, y: 170, w: 220, h: 36 },
      { x: 820, y: 170, w: 220, h: 36 },
      { x: 240, y: 514, w: 220, h: 36 },
      { x: 820, y: 514, w: 220, h: 36 },
      { x: 560, y: 270, w: 160, h: 36 },
      { x: 560, y: 414, w: 160, h: 36 },
    );
  } else if (arena === 'estacion') {
    walls.push(
      { x: 350, y: 120, w: 44, h: 190 },
      { x: 350, y: 410, w: 44, h: 190 },
      { x: 886, y: 120, w: 44, h: 190 },
      { x: 886, y: 410, w: 44, h: 190 },
      { x: 590, y: 315, w: 100, h: 90 },
    );
  } else {
    // cementerio: criptas y lápidas en diagonal para rodear a la horda.
    walls.push(
      { x: 250, y: 165, w: 92, h: 54 },
      { x: 938, y: 165, w: 92, h: 54 },
      { x: 250, y: 501, w: 92, h: 54 },
      { x: 938, y: 501, w: 92, h: 54 },
      { x: 510, y: 215, w: 54, h: 90 },
      { x: 716, y: 415, w: 54, h: 90 },
      { x: 716, y: 215, w: 54, h: 48 },
      { x: 510, y: 457, w: 54, h: 48 },
    );
  }
  return walls;
}

const SPAWN_DOORS: readonly { x: number; y: number }[] = [
  { x: 640, y: 24 },
  { x: 640, y: WORLD_H - 24 },
  { x: 24, y: 360 },
  { x: WORLD_W - 24, y: 360 },
];

export class BoxheadSim {
  readonly arena: ArenaId;
  readonly mode: ModeId;
  readonly friendlyFire: boolean;
  readonly walls: Rect[];

  players: Player[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  props: Prop[] = [];
  crates: Crate[] = [];
  supplyBeacon: SupplyBeacon | null = null;
  events: SimEvent[] = [];

  wave = 1;
  combo = 0;
  comboT = 0;
  time = 0;
  waveClear = false;
  gameOver = false;

  private rng: () => number;
  private nextId = 1;
  private toSpawn = 0;
  private spawnCd = 0;
  private nextSupplyT = 14;

  constructor(arena: ArenaId, mode: ModeId, friendlyFire: boolean, seeds: PlayerSeed[], seed = Date.now()) {
    this.arena = arena;
    this.mode = mode;
    this.friendlyFire = friendlyFire;
    this.walls = buildArenaWalls(arena);
    this.rng = mulberry32(seed);
    this.initPlayers(seeds);
    this.spawnInitialBarrels();
    this.startWave(1);
  }

  private initPlayers(seeds: PlayerSeed[]): void {
    const list = seeds.slice(0, MAX_PLAYERS);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const angle = (i / Math.max(1, list.length)) * Math.PI * 2;
      const sx = WORLD_W * 0.5 + Math.cos(angle) * 95;
      const sy = WORLD_H * 0.5 + Math.sin(angle) * 75;
      const ammo = {} as Record<WeaponId, number>;
      for (let w = 0; w < WEAPONS.length; w++) ammo[WEAPONS[w].id] = WEAPONS[w].maxAmmo;
      this.players.push({
        id: s.id,
        name: s.name,
        color: s.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        aimX: 1,
        aimY: 0,
        hp: 100,
        maxHp: 100,
        downed: false,
        bleedT: 0,
        reviveT: 0,
        dead: false,
        score: 0,
        kills: 0,
        weapon: 'pistol',
        unlocked: ['pistol', 'uzi'],
        ammo,
        fireCd: 0,
        dashT: 0,
        dashCd: 0,
        dashDx: 1,
        dashDy: 0,
        hitFlash: 0,
        rateMult: 1,
        speedMult: 1,
        blastMult: 1,
        ricochet: 0,
        perkChoices: [],
        pickedPerk: false,
        inX: 0,
        inY: 0,
        inFire: false,
        inDash: false,
        inAlt: false,
        prevDash: false,
        prevAlt: false,
      });
    }
  }

  private spawnInitialBarrels(): void {
    const spots = [
      { x: 460, y: 260 },
      { x: 820, y: 260 },
      { x: 460, y: 460 },
      { x: 820, y: 460 },
    ];
    for (let i = 0; i < spots.length; i++) {
      if (!this.hitsAnyWall(spots[i].x, spots[i].y, 18)) {
        this.props.push({
          id: this.nextId++,
          kind: 'barrel',
          ownerId: 0,
          x: spots[i].x,
          y: spots[i].y,
          hp: 25,
          maxHp: 25,
          fireCd: 0,
          aimX: 1,
          aimY: 0,
        });
      }
    }
  }

  startWave(n: number): void {
    this.wave = n;
    this.waveClear = false;
    const pScale = 1 + (this.players.length - 1) * 0.45;
    this.toSpawn = Math.round((8 + n * 5) * pScale);
    this.spawnCd = 0.6;

    // Desbloquear armas de esta oleada y reanimar caídos al empezar nueva oleada.
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.perkChoices = [];
      p.pickedPerk = false;
      if (p.dead || p.downed) {
        p.dead = false;
        p.downed = false;
        p.hp = 60;
        p.x = WORLD_W * 0.5 + (i - 2) * 36;
        p.y = WORLD_H * 0.5;
      }
      for (let w = 0; w < WEAPONS.length; w++) {
        const spec = WEAPONS[w];
        if (spec.unlockWave <= n && p.unlocked.indexOf(spec.id) < 0) {
          p.unlocked.push(spec.id);
          p.ammo[spec.id] = spec.maxAmmo;
        }
      }
    }

    // Jefe cada 5 oleadas.
    if (n % 5 === 0) {
      this.spawnEnemy('boss');
    }
  }

  setInput(id: number, x: number, y: number, fire: boolean, dash: boolean, alt: boolean): void {
    const p = this.players.find((u) => u.id === id);
    if (!p) return;
    p.inX = Math.max(-1, Math.min(1, x));
    p.inY = Math.max(-1, Math.min(1, y));
    p.inFire = fire;
    p.inDash = dash;
    p.inAlt = alt;
  }

  cycleWeapon(id: number, dir: 1 | -1): void {
    const p = this.players.find((u) => u.id === id);
    if (!p || p.unlocked.length <= 1) return;
    const idx = p.unlocked.indexOf(p.weapon);
    const next = (idx + dir + p.unlocked.length) % p.unlocked.length;
    p.weapon = p.unlocked[next];
  }

  setWeapon(id: number, weapon: WeaponId): void {
    const p = this.players.find((u) => u.id === id);
    if (!p || p.unlocked.indexOf(weapon) < 0) return;
    p.weapon = weapon;
  }

  preparePerks(): void {
    const all: PerkId[] = ['cadencia', 'rebote', 'boom', 'torreta', 'curar', 'velocidad'];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const pool = all.slice();
      const picks: PerkId[] = [];
      for (let k = 0; k < 3 && pool.length > 0; k++) {
        const idx = Math.floor(this.rng() * pool.length);
        picks.push(pool.splice(idx, 1)[0]);
      }
      p.perkChoices = picks;
      p.pickedPerk = false;
    }
  }

  pickPerk(id: number, perk: PerkId): boolean {
    const p = this.players.find((u) => u.id === id);
    if (!p || p.pickedPerk || p.perkChoices.indexOf(perk) < 0) return false;
    p.pickedPerk = true;
    if (perk === 'cadencia') {
      p.rateMult *= 1.22;
    } else if (perk === 'rebote') {
      p.ricochet = Math.min(2, p.ricochet + 1);
    } else if (perk === 'boom') {
      p.blastMult *= 1.35;
    } else if (perk === 'velocidad') {
      p.speedMult = Math.min(1.75, p.speedMult * 1.18);
    } else if (perk === 'curar') {
      for (let i = 0; i < this.players.length; i++) {
        const ally = this.players[i];
        ally.dead = false;
        ally.downed = false;
        ally.hp = Math.min(ally.maxHp, ally.hp + 50);
      }
    } else if (perk === 'torreta') {
      this.props.push({
        id: this.nextId++,
        kind: 'turret',
        ownerId: p.id,
        x: p.x,
        y: p.y,
        hp: 140,
        maxHp: 140,
        fireCd: 0.2,
        aimX: p.aimX,
        aimY: p.aimY,
      });
    }
    return true;
  }

  allPerksPicked(): boolean {
    return this.players.every((p) => p.pickedPerk);
  }

  step(dt = TICK): void {
    this.events.length = 0;
    if (this.gameOver || this.waveClear) return;
    this.time += dt;

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

    // Spawnear oleada.
    if (this.toSpawn > 0 && this.enemies.length < MAX_ENEMIES) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        this.spawnEnemy(this.pickEnemyKind());
        this.toSpawn--;
        this.spawnCd = Math.max(0.22, 0.95 - this.wave * 0.06);
      }
    }

    for (let i = 0; i < this.players.length; i++) {
      this.stepPlayer(this.players[i], dt);
    }
    this.stepProps(dt);
    this.stepProjectiles(dt);
    this.stepEnemies(dt);
    this.stepCrates(dt);

    // Fin de partida si todos murieron o cayeron.
    const anyUp = this.players.some((p) => !p.dead && !p.downed);
    if (!anyUp) {
      this.gameOver = true;
      this.events.push({ kind: 'gameOver' });
      return;
    }

    // Baliza interactiva de Caja de Suministros dorada.
    if (this.supplyBeacon) {
      this.supplyBeacon.timer -= dt;
      if (this.supplyBeacon.timer <= 0) {
        const bx = this.supplyBeacon.x;
        const by = this.supplyBeacon.y;
        this.supplyBeacon = null;
        this.crates.push({ id: this.nextId++, kind: 'supply', x: bx, y: by, life: 22 });
        this.events.push({ kind: 'pickup', x: bx, y: by, label: '¡SUMINISTROS!', color: '#ffd447' });
      }
    } else if (this.time >= this.nextSupplyT && this.enemies.length > 0) {
      this.nextSupplyT = this.time + 20;
      const spots = [
        { x: 640, y: 140 },
        { x: 640, y: 580 },
        { x: 460, y: 360 },
        { x: 820, y: 360 },
      ];
      const pick = spots[Math.floor(this.rng() * spots.length)];
      if (!this.hitsAnyWall(pick.x, pick.y, 24)) {
        this.supplyBeacon = { x: pick.x, y: pick.y, timer: 3.5 };
      }
    }

    // Oleada limpia -> elegir mejoras.
    if (this.toSpawn === 0 && this.enemies.length === 0) {
      this.waveClear = true;
      this.preparePerks();
      this.events.push({ kind: 'waveClear', wave: this.wave });
    }
  }

  private stepPlayer(p: Player, dt: number): void {
    if (p.dead) return;
    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
    if (p.fireCd > 0) p.fireCd = Math.max(0, p.fireCd - dt);
    if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);

    // Estado herido: un compañero cerca te levanta.
    if (p.downed) {
      p.bleedT -= dt;
      let reviving = false;
      for (let i = 0; i < this.players.length; i++) {
        const ally = this.players[i];
        if (ally.id === p.id || ally.dead || ally.downed) continue;
        const dx = ally.x - p.x;
        const dy = ally.y - p.y;
        if (dx * dx + dy * dy <= REVIVE_DIST * REVIVE_DIST) {
          reviving = true;
          break;
        }
      }
      if (reviving) {
        p.reviveT += dt;
        if (p.reviveT >= REVIVE_TIME) {
          p.downed = false;
          p.hp = 55;
          p.reviveT = 0;
          this.events.push({ kind: 'pickup', x: p.x, y: p.y, label: '¡Reanimado!', color: '#7dff6b' });
        }
      } else {
        p.reviveT = Math.max(0, p.reviveT - dt * 0.5);
      }
      if (p.bleedT <= 0) {
        p.dead = true;
        p.downed = false;
      }
      return;
    }

    const mag = Math.hypot(p.inX, p.inY);
    if (mag > 0.14) {
      const nx = p.inX / mag;
      const ny = p.inY / mag;
      // Apunta hacia donde mira/camina (estilo Boxhead clásico).
      p.aimX = nx;
      p.aimY = ny;
    }

    // Dash con i-frames breves.
    if (p.inDash && !p.prevDash && p.dashCd <= 0 && p.dashT <= 0) {
      p.dashT = DASH_DUR;
      p.dashCd = DASH_CD / p.speedMult;
      p.dashDx = p.aimX;
      p.dashDy = p.aimY;
      this.events.push({ kind: 'dash', x: p.x, y: p.y, color: p.color });
    }
    p.prevDash = p.inDash;

    if (p.dashT > 0) {
      p.dashT = Math.max(0, p.dashT - dt);
      p.vx = p.dashDx * DASH_SPEED;
      p.vy = p.dashDy * DASH_SPEED;
    } else if (mag > 0.12) {
      const sp = PLAYER_SPEED * p.speedMult * Math.min(1, mag);
      p.vx = (p.inX / mag) * sp;
      p.vy = (p.inY / mag) * sp;
    } else {
      p.vx = 0;
      p.vy = 0;
    }

    this.moveCircle(p, PLAYER_R, dt, true);

    // Botón rápido de barril/granada (b).
    if (p.inAlt && !p.prevAlt && p.fireCd <= 0) {
      if (p.unlocked.indexOf('barrel') >= 0 && p.ammo.barrel > 0) {
        this.fireWeapon(p, 'barrel');
      } else if (p.unlocked.indexOf('grenade') >= 0 && p.ammo.grenade > 0) {
        this.fireWeapon(p, 'grenade');
      }
    }
    p.prevAlt = p.inAlt;

    // Disparo principal.
    if (p.inFire && p.fireCd <= 0) {
      this.fireWeapon(p, p.weapon);
    }
  }

  /** Asistencia sutil (±16°) solo dentro del cono delantero hacia donde mira el jugador. */
  private assistedAim(p: Player): { x: number; y: number } {
    const baseAngle = Math.atan2(p.aimY, p.aimX);
    let bestAngle = baseAngle;
    let bestScore = Infinity;
    const maxCone = 0.28; // ~16 grados

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10 || dist > 560) continue;
      const ang = Math.atan2(dy, dx);
      let diff = ang - baseAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= maxCone) {
        const score = dist + Math.abs(diff) * 400;
        if (score < bestScore) {
          bestScore = score;
          bestAngle = ang;
        }
      }
    }
    return { x: Math.cos(bestAngle), y: Math.sin(bestAngle) };
  }

  private fireWeapon(p: Player, wid: WeaponId): void {
    const spec = WEAPON_BY_ID[wid];
    if (spec.maxAmmo >= 0) {
      if (p.ammo[wid] <= 0) {
        p.weapon = 'pistol';
        return;
      }
      p.ammo[wid]--;
    }

    p.fireCd = spec.cooldown / p.rateMult;
    const aim = this.assistedAim(p);
    this.events.push({ kind: 'shot', weapon: wid, x: p.x, y: p.y, ax: aim.x, ay: aim.y });

    if (spec.placeable) {
      const px = p.x + aim.x * 34;
      const py = p.y + aim.y * 34;
      if (!this.hitsAnyWall(px, py, 16)) {
        this.props.push({
          id: this.nextId++,
          kind: spec.placeable,
          ownerId: p.id,
          x: px,
          y: py,
          hp: spec.placeable === 'wall' ? 220 : 25,
          maxHp: spec.placeable === 'wall' ? 220 : 25,
          fireCd: 0,
          aimX: aim.x,
          aimY: aim.y,
        });
      }
      return;
    }

    const baseAng = Math.atan2(aim.y, aim.x);
    for (let i = 0; i < spec.pellets; i++) {
      const jitter = (this.rng() - 0.5) * spec.spread;
      const ang = baseAng + jitter;
      this.projectiles.push({
        id: this.nextId++,
        ownerId: p.id,
        x: p.x + Math.cos(ang) * 18,
        y: p.y + Math.sin(ang) * 18,
        vx: Math.cos(ang) * spec.speed,
        vy: Math.sin(ang) * spec.speed,
        damage: spec.damage * (spec.blast > 0 ? p.blastMult : 1),
        r: wid === 'rocket' ? 6 : wid === 'grenade' ? 6 : wid === 'railgun' ? 5 : 3.5,
        life: spec.grenade ? 0.72 : 1.35,
        blast: spec.blast * p.blastMult,
        pierce: !!spec.pierce,
        bounces: spec.grenade ? 2 : spec.blast > 0 ? 0 : p.ricochet,
        grenade: !!spec.grenade,
        enemyShot: false,
        color: wid === 'railgun' ? '#38e8ff' : wid === 'rocket' ? '#ff7b33' : wid === 'grenade' ? '#7dff6b' : '#ffe566',
        hitIds: [],
      });
    }
  }

  private stepProps(dt: number): void {
    for (let i = this.props.length - 1; i >= 0; i--) {
      const pr = this.props[i];
      if (pr.kind === 'mine') {
        for (let e = 0; e < this.enemies.length; e++) {
          const en = this.enemies[e];
          const dx = en.x - pr.x;
          const dy = en.y - pr.y;
          if (dx * dx + dy * dy <= (en.r + 22) * (en.r + 22)) {
            this.props.splice(i, 1);
            this.explode(pr.x, pr.y, 118, 155, pr.ownerId);
            break;
          }
        }
      } else if (pr.kind === 'turret') {
        pr.fireCd -= dt;
        if (pr.fireCd <= 0 && this.enemies.length > 0) {
          let best: Enemy | null = null;
          let bestD = 360 * 360;
          for (let e = 0; e < this.enemies.length; e++) {
            const en = this.enemies[e];
            const d2 = (en.x - pr.x) * (en.x - pr.x) + (en.y - pr.y) * (en.y - pr.y);
            if (d2 < bestD) { bestD = d2; best = en; }
          }
          if (best) {
            const ang = Math.atan2(best.y - pr.y, best.x - pr.x);
            pr.aimX = Math.cos(ang);
            pr.aimY = Math.sin(ang);
            pr.fireCd = 0.24;
            this.projectiles.push({
              id: this.nextId++,
              ownerId: pr.ownerId,
              x: pr.x + pr.aimX * 16,
              y: pr.y + pr.aimY * 16,
              vx: pr.aimX * 760,
              vy: pr.aimY * 760,
              damage: 20,
              r: 3.5,
              life: 0.9,
              blast: 0,
              pierce: false,
              bounces: 0,
              grenade: false,
              enemyShot: false,
              color: '#7dff6b',
              hitIds: [],
            });
          }
        }
      }
    }
  }

  private stepProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const b = this.projectiles[i];
      b.life -= dt;
      if (b.grenade) {
        b.vx *= 0.95;
        b.vy *= 0.95;
      }
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;

      // Rebote o impacto en pared.
      if (this.hitsAnyWall(nx, ny, b.r)) {
        if (b.bounces > 0) {
          b.bounces--;
          if (this.hitsAnyWall(nx, b.y, b.r)) b.vx = -b.vx;
          if (this.hitsAnyWall(b.x, ny, b.r)) b.vy = -b.vy;
          continue;
        }
        if (b.blast > 0) this.explode(b.x, b.y, b.blast, b.damage, b.ownerId);
        this.projectiles.splice(i, 1);
        continue;
      }
      b.x = nx;
      b.y = ny;

      if (b.life <= 0) {
        if (b.blast > 0) this.explode(b.x, b.y, b.blast, b.damage, b.ownerId);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (b.enemyShot) {
        // Bola de fuego de demonio contra jugadores.
        for (let pi = 0; pi < this.players.length; pi++) {
          const p = this.players[pi];
          if (p.dead || p.downed || p.dashT > 0) continue;
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          if (dx * dx + dy * dy <= (PLAYER_R + b.r) * (PLAYER_R + b.r)) {
            this.damagePlayer(p, b.damage);
            this.projectiles.splice(i, 1);
            break;
          }
        }
        continue;
      }

      // Impacto en barriles explosivos (reacción en cadena!).
      let consumed = false;
      for (let pi = this.props.length - 1; pi >= 0; pi--) {
        const pr = this.props[pi];
        if (pr.kind !== 'barrel') continue;
        const dx = pr.x - b.x;
        const dy = pr.y - b.y;
        if (dx * dx + dy * dy <= (18 + b.r) * (18 + b.r)) {
          pr.hp -= b.damage;
          if (pr.hp <= 0) {
            this.props.splice(pi, 1);
            const owner = this.players.find((u) => u.id === b.ownerId);
            const mult = owner ? owner.blastMult : 1;
            this.explode(pr.x, pr.y, 130 * mult, 155 * mult, b.ownerId);
          }
          if (!b.pierce) {
            consumed = true;
            break;
          }
        }
      }
      if (consumed) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Impacto en enemigos.
      if (!b.grenade) {
        for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
          const en = this.enemies[ei];
          if (b.hitIds.indexOf(en.id) >= 0) continue;
          const dx = en.x - b.x;
          const dy = en.y - b.y;
          if (dx * dx + dy * dy <= (en.r + b.r) * (en.r + b.r)) {
            b.hitIds.push(en.id);
            if (b.blast > 0) {
              this.explode(b.x, b.y, b.blast, b.damage, b.ownerId);
              consumed = true;
              break;
            }
            this.damageEnemy(ei, b.damage, b.ownerId);
            if (!b.pierce) {
              consumed = true;
              break;
            }
          }
        }
      }
      if (consumed) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Fuego amigo o modo Duelo.
      if ((this.friendlyFire || this.mode === 'duelo') && !b.grenade) {
        for (let pi = 0; pi < this.players.length; pi++) {
          const p = this.players[pi];
          if (p.id === b.ownerId || p.dead || p.downed || p.dashT > 0) continue;
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          if (dx * dx + dy * dy <= (PLAYER_R + b.r) * (PLAYER_R + b.r)) {
            this.damagePlayer(p, b.damage * (this.mode === 'duelo' ? 0.6 : 0.35));
            this.projectiles.splice(i, 1);
            break;
          }
        }
      }
    }
  }

  explode(x: number, y: number, radius: number, damage: number, ownerId: number): void {
    this.events.push({ kind: 'boom', x, y, r: radius });
    const r2 = radius * radius;

    // Daño a enemigos.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      const dx = en.x - x;
      const dy = en.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        const falloff = 1 - Math.sqrt(d2) / (radius * 1.25);
        this.damageEnemy(i, Math.max(25, damage * falloff), ownerId);
      }
    }

    // Reacción en cadena con barriles cercanos!
    const chain: Prop[] = [];
    for (let i = this.props.length - 1; i >= 0; i--) {
      const pr = this.props[i];
      const dx = pr.x - x;
      const dy = pr.y - y;
      if (dx * dx + dy * dy <= r2) {
        if (pr.kind === 'barrel' || pr.kind === 'mine') {
          this.props.splice(i, 1);
          chain.push(pr);
        }
      }
    }
    for (let i = 0; i < chain.length; i++) {
      this.explode(chain[i].x, chain[i].y, 125, 150, ownerId);
    }
  }

  private damageEnemy(idx: number, dmg: number, ownerId: number): void {
    const en = this.enemies[idx];
    if (!en) return;
    en.hp -= dmg;
    en.hitFlash = 0.12;
    this.events.push({ kind: 'blood', x: en.x, y: en.y, big: en.hp <= 0, color: en.kind === 'demon' || en.kind === 'boss' ? '#7a0c18' : '#8b1111' });
    if (en.hp <= 0) {
      this.enemies.splice(idx, 1);
      this.combo++;
      this.comboT = 4.5;
      const mult = Math.min(25, 1 + Math.floor(this.combo / 3));
      const basePts = en.kind === 'boss' ? 800 : en.kind === 'demon' ? 180 : en.kind === 'bloater' ? 140 : en.kind === 'runner' ? 95 : 60;
      const killer = this.players.find((p) => p.id === ownerId);
      if (killer) {
        killer.kills++;
        killer.score += basePts * mult;
      }
      if (en.kind === 'bloater') {
        this.explode(en.x, en.y, 95, 70, ownerId);
      }
      // Cajas de munición o botiquín (clásicas de Boxhead).
      if (this.crates.length < 10 && this.rng() < (en.kind === 'boss' ? 1 : 0.2)) {
        this.crates.push({
          id: this.nextId++,
          kind: this.rng() < 0.28 ? 'med' : 'ammo',
          x: en.x,
          y: en.y,
          life: 18,
        });
      }
    }
  }

  private damagePlayer(p: Player, dmg: number): void {
    if (p.dead || p.downed || p.dashT > 0) return;
    p.hp -= dmg;
    p.hitFlash = 0.18;
    this.events.push({ kind: 'blood', x: p.x, y: p.y, big: false, color: '#b31217' });
    if (p.hp <= 0) {
      p.hp = 0;
      if (this.players.length > 1) {
        p.downed = true;
        p.bleedT = BLEED_TIME;
        p.reviveT = 0;
      } else {
        p.dead = true;
      }
    }
  }

  private pickEnemyKind(): EnemyKind {
    const r = this.rng();
    if (this.wave >= 4 && r < 0.14) return 'bloater';
    if (this.wave >= 3 && r < 0.3) return 'demon';
    if (this.wave >= 2 && r < 0.54) return 'runner';
    return 'zombie';
  }

  private spawnEnemy(kind: EnemyKind): void {
    const door = SPAWN_DOORS[Math.floor(this.rng() * SPAWN_DOORS.length)];
    const hpScale = 1 + (this.wave - 1) * 0.16;
    const spec =
      kind === 'boss'
        ? { r: 26, hp: 560 * hpScale, speed: 92, dmg: 26 }
        : kind === 'demon'
          ? { r: 17, hp: 95 * hpScale, speed: 108, dmg: 18 }
          : kind === 'bloater'
            ? { r: 20, hp: 115 * hpScale, speed: 78, dmg: 20 }
            : kind === 'runner'
              ? { r: 13, hp: 40 * hpScale, speed: 158, dmg: 12 }
              : { r: 15, hp: 58 * hpScale, speed: 88, dmg: 14 };

    this.enemies.push({
      id: this.nextId++,
      kind,
      x: door.x + (this.rng() - 0.5) * 40,
      y: door.y + (this.rng() - 0.5) * 40,
      vx: 0,
      vy: 0,
      r: spec.r,
      hp: spec.hp,
      maxHp: spec.hp,
      speed: spec.speed,
      damage: spec.dmg,
      atkCd: 0.6,
      hitFlash: 0,
      aimX: 1,
      aimY: 0,
    });
  }

  private stepEnemies(dt: number): void {
    for (let i = 0; i < this.enemies.length; i++) {
      const en = this.enemies[i];
      if (en.hitFlash > 0) en.hitFlash = Math.max(0, en.hitFlash - dt);
      if (en.atkCd > 0) en.atkCd = Math.max(0, en.atkCd - dt);

      // Buscar jugador vivo más cercano.
      let target: Player | null = null;
      let bestD2 = Infinity;
      for (let pi = 0; pi < this.players.length; pi++) {
        const p = this.players[pi];
        if (p.dead || p.downed) continue;
        const d2 = (p.x - en.x) * (p.x - en.x) + (p.y - en.y) * (p.y - en.y);
        if (d2 < bestD2) { bestD2 = d2; target = p; }
      }
      if (!target) continue;

      const dx = target.x - en.x;
      const dy = target.y - en.y;
      const dist = Math.hypot(dx, dy) || 1;
      en.aimX = dx / dist;
      en.aimY = dy / dist;

      // Demonio y Jefe tiran bolas de fuego a distancia.
      if ((en.kind === 'demon' || en.kind === 'boss') && dist < 410 && en.atkCd <= 0) {
        en.atkCd = en.kind === 'boss' ? 1.55 : 2.1;
        const shots = en.kind === 'boss' ? [-0.22, 0, 0.22] : [0];
        const base = Math.atan2(dy, dx);
        for (let s = 0; s < shots.length; s++) {
          const ang = base + shots[s];
          this.projectiles.push({
            id: this.nextId++,
            ownerId: -en.id,
            x: en.x + Math.cos(ang) * (en.r + 6),
            y: en.y + Math.sin(ang) * (en.r + 6),
            vx: Math.cos(ang) * 320,
            vy: Math.sin(ang) * 320,
            damage: en.damage,
            r: 7,
            life: 1.8,
            blast: 0,
            pierce: false,
            bounces: 0,
            grenade: false,
            enemyShot: true,
            color: '#ff4b1f',
            hitIds: [],
          });
        }
      }

      en.vx = en.aimX * en.speed;
      en.vy = en.aimY * en.speed;

      // Separación suave entre zombies para que formen horda y no un solo bloque.
      for (let j = i + 1; j < this.enemies.length; j++) {
        const o = this.enemies[j];
        const sx = en.x - o.x;
        const sy = en.y - o.y;
        const minR = en.r + o.r;
        const d2 = sx * sx + sy * sy;
        if (d2 > 0.01 && d2 < minR * minR) {
          const d = Math.sqrt(d2);
          const push = (minR - d) * 4;
          en.vx += (sx / d) * push;
          en.vy += (sy / d) * push;
        }
      }

      this.moveCircle(en, en.r, dt, false);

      // Golpe cuerpo a cuerpo a muros falsos o torretas.
      for (let pi = this.props.length - 1; pi >= 0; pi--) {
        const pr = this.props[pi];
        if (pr.kind !== 'wall' && pr.kind !== 'turret') continue;
        const pdx = pr.x - en.x;
        const pdy = pr.y - en.y;
        if (pdx * pdx + pdy * pdy <= (en.r + 22) * (en.r + 22) && en.atkCd <= 0) {
          pr.hp -= en.damage;
          en.atkCd = 0.7;
          if (pr.hp <= 0) this.props.splice(pi, 1);
        }
      }

      // Golpe cuerpo a cuerpo al jugador.
      if (dist <= en.r + PLAYER_R + 4 && en.atkCd <= 0) {
        en.atkCd = 0.75;
        this.damagePlayer(target, en.damage);
      }
    }
  }

  private stepCrates(dt: number): void {
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.crates.splice(i, 1);
        continue;
      }
      for (let pi = 0; pi < this.players.length; pi++) {
        const p = this.players[pi];
        if (p.dead || p.downed) continue;
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        if (dx * dx + dy * dy <= (PLAYER_R + 18) * (PLAYER_R + 18)) {
          if (c.kind === 'supply') {
            p.hp = Math.min(p.maxHp, p.hp + 40);
            p.score += 150;
            for (let w = 0; w < p.unlocked.length; w++) {
              const wid = p.unlocked[w];
              const spec = WEAPON_BY_ID[wid];
              if (spec.maxAmmo > 0) p.ammo[wid] = Math.min(spec.maxAmmo, p.ammo[wid] + Math.ceil(spec.maxAmmo * 0.65));
            }
            if (p.unlocked.includes('barrel')) p.ammo.barrel = Math.min(WEAPON_BY_ID.barrel.maxAmmo, p.ammo.barrel + 2);
            this.events.push({ kind: 'pickup', x: c.x, y: c.y, label: '¡SUMINISTRO +150!', color: '#ffd447' });
          } else if (c.kind === 'med') {
            p.hp = Math.min(p.maxHp, p.hp + 45);
            this.events.push({ kind: 'pickup', x: c.x, y: c.y, label: '+45 HP', color: '#7dff6b' });
          } else {
            for (let w = 0; w < p.unlocked.length; w++) {
              const wid = p.unlocked[w];
              const spec = WEAPON_BY_ID[wid];
              if (spec.maxAmmo > 0) p.ammo[wid] = Math.min(spec.maxAmmo, p.ammo[wid] + Math.ceil(spec.maxAmmo * 0.45));
            }
            this.events.push({ kind: 'pickup', x: c.x, y: c.y, label: '+Munición', color: '#ffd447' });
          }
          this.crates.splice(i, 1);
          break;
        }
      }
    }
  }

  private moveCircle(ent: { x: number; y: number; vx: number; vy: number }, r: number, dt: number, clampInside: boolean): void {
    const nx = ent.x + ent.vx * dt;
    if (!this.hitsAnyWall(nx, ent.y, r) && !this.hitsSolidProp(nx, ent.y, r, clampInside)) {
      ent.x = nx;
    }
    const ny = ent.y + ent.vy * dt;
    if (!this.hitsAnyWall(ent.x, ny, r) && !this.hitsSolidProp(ent.x, ny, r, clampInside)) {
      ent.y = ny;
    }
    const pad = clampInside ? 40 : 12;
    ent.x = Math.max(pad, Math.min(WORLD_W - pad, ent.x));
    ent.y = Math.max(pad, Math.min(WORLD_H - pad, ent.y));
  }

  private hitsSolidProp(x: number, y: number, r: number, isPlayer: boolean): boolean {
    if (isPlayer) return false; // Jugadores pasan sobre sus propios muros falsos/barriles para no trabarse.
    for (let i = 0; i < this.props.length; i++) {
      const pr = this.props[i];
      if (pr.kind !== 'wall') continue;
      const dx = x - pr.x;
      const dy = y - pr.y;
      if (dx * dx + dy * dy < (r + 18) * (r + 18)) return true;
    }
    return false;
  }

  private hitsAnyWall(x: number, y: number, r: number): boolean {
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      const cx = Math.max(w.x, Math.min(x, w.x + w.w));
      const cy = Math.max(w.y, Math.min(y, w.y + w.h));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
}
