/** Mensajes y catálogos compartidos entre la pared y los celulares de Boxhead: Horda. */

export type ArenaId = 'plaza' | 'laberinto' | 'estacion';
export type ModeId = 'coop' | 'duelo';
export type Phase = 'lobby' | 'play' | 'perk' | 'over';
export type WeaponId = 'pistol' | 'uzi' | 'shotgun' | 'barrel' | 'grenade' | 'rocket' | 'mine' | 'wall' | 'railgun';
export type PerkId = 'cadencia' | 'rebote' | 'boom' | 'torreta' | 'curar' | 'velocidad';

export const MAX_PLAYERS = 6;

export const ARENAS: readonly { id: ArenaId; name: string; tag: string }[] = [
  { id: 'plaza', name: 'La Plaza', tag: 'Abierta con columnas y barriles' },
  { id: 'laberinto', name: 'El Laberinto', tag: 'Pasillos para atrincherarse' },
  { id: 'estacion', name: 'La Estación', tag: 'Cuellos de botella y emboscadas' },
];

export const MODES: readonly { id: ModeId; name: string }[] = [
  { id: 'coop', name: 'Horda Coop' },
  { id: 'duelo', name: 'Duelo + Horda' },
];

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  short: string;
  unlockWave: number;
  maxAmmo: number; // -1 = infinito
  cooldown: number;
  damage: number;
  speed: number;
  pellets: number;
  spread: number;
  blast: number;
  pierce?: boolean;
  placeable?: 'barrel' | 'mine' | 'wall';
  grenade?: boolean;
}

export const WEAPONS: readonly WeaponSpec[] = [
  { id: 'pistol', name: 'Pistola', short: 'PIST', unlockWave: 1, maxAmmo: -1, cooldown: 0.24, damage: 28, speed: 780, pellets: 1, spread: 0.03, blast: 0 },
  { id: 'uzi', name: 'Uzi', short: 'UZI', unlockWave: 1, maxAmmo: 140, cooldown: 0.085, damage: 17, speed: 820, pellets: 1, spread: 0.11, blast: 0 },
  { id: 'shotgun', name: 'Escopeta', short: 'ESC', unlockWave: 2, maxAmmo: 44, cooldown: 0.56, damage: 22, speed: 740, pellets: 5, spread: 0.28, blast: 0 },
  { id: 'barrel', name: 'Barril', short: 'BARR', unlockWave: 2, maxAmmo: 12, cooldown: 0.45, damage: 145, speed: 0, pellets: 1, spread: 0, blast: 125, placeable: 'barrel' },
  { id: 'grenade', name: 'Granada', short: 'GRAN', unlockWave: 3, maxAmmo: 16, cooldown: 0.55, damage: 130, speed: 440, pellets: 1, spread: 0, blast: 110, grenade: true },
  { id: 'wall', name: 'Muro', short: 'MURO', unlockWave: 3, maxAmmo: 10, cooldown: 0.4, damage: 0, speed: 0, pellets: 1, spread: 0, blast: 0, placeable: 'wall' },
  { id: 'mine', name: 'Mina', short: 'MINA', unlockWave: 4, maxAmmo: 12, cooldown: 0.4, damage: 155, speed: 0, pellets: 1, spread: 0, blast: 115, placeable: 'mine' },
  { id: 'rocket', name: 'Cohete', short: 'COH', unlockWave: 4, maxAmmo: 14, cooldown: 0.72, damage: 175, speed: 620, pellets: 1, spread: 0.02, blast: 130 },
  { id: 'railgun', name: 'Railgun', short: 'RAIL', unlockWave: 5, maxAmmo: 18, cooldown: 0.65, damage: 150, speed: 1280, pellets: 1, spread: 0, blast: 0, pierce: true },
];

export const WEAPON_BY_ID: Record<WeaponId, WeaponSpec> = WEAPONS.reduce((acc, w) => {
  acc[w.id] = w;
  return acc;
}, {} as Record<WeaponId, WeaponSpec>);

export const PERKS: Record<PerkId, { title: string; desc: string; color: string }> = {
  cadencia: { title: 'Gatillo rápido', desc: '+22% velocidad de disparo', color: '#ffd447' },
  rebote: { title: 'Balas rebotan', desc: 'Tus tiros rebotan en paredes', color: '#38e8ff' },
  boom: { title: 'Mega explosión', desc: '+35% radio y daño explosivo', color: '#ff6b3d' },
  torreta: { title: 'Torreta automática', desc: 'Planta una torreta que dispara sola', color: '#7dff6b' },
  curar: { title: 'Botiquín grupal', desc: '+50 vida a todo el equipo', color: '#ff5c8a' },
  velocidad: { title: 'Piernas turbo', desc: '+18% velocidad y dash más rápido', color: '#c07cff' },
};

export const PLAYER_COLORS = [
  0x2e8bff, // azul Boxhead
  0xe63946, // rojo
  0x2ecc71, // verde
  0xf4c430, // amarillo
  0x9b59b6, // violeta
  0xff7f2a, // naranja
];

export interface SeatState {
  id: number;
  name: string;
  color: number;
  hp: number;
  maxHp: number;
  downed: boolean;
  dead: boolean;
  score: number;
  kills: number;
  weapon: WeaponId;
  ammo: number;
  unlocked: WeaponId[];
  dashReady: boolean;
  perkChoices: PerkId[];
  pickedPerk: boolean;
}

export interface Shared {
  phase: Phase;
  arena: ArenaId;
  mode: ModeId;
  friendlyFire: boolean;
  wave: number;
  combo: number;
  lead: number | null;
  perkTime: number;
  seats: SeatState[];
  bestWave: number;
}

export type Command =
  | { a: 'name'; name: string }
  | { a: 'color'; color: number }
  | { a: 'arena'; arena: ArenaId }
  | { a: 'mode'; mode: ModeId }
  | { a: 'ff'; on: boolean }
  | { a: 'weapon'; dir: 1 | -1 }
  | { a: 'setWeapon'; weapon: WeaponId }
  | { a: 'perk'; perk: PerkId }
  | { a: 'start' }
  | { a: 'again' }
  | { a: 'lobby' }
  | { a: 'kick'; id: number }
  | { a: 'exit' };

export interface RosterEntry {
  id: number;
  name: string;
  on: boolean;
}

export type FromRoom =
  | { t: 'roster'; players: RosterEntry[] }
  | { t: 'in'; id: number; s: number; x: number; y: number; b: boolean; n: boolean; k: boolean }
  | { t: 'cmd'; id: number; d: Command }
  | { t: 'joined'; id: number; key: string; name: string }
  | { t: 'all'; d: Shared }
  | { t: 'you'; d: { kicked?: boolean } }
  | { t: 'error'; code: string };
