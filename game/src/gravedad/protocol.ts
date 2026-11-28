/** Mensajes compartidos entre la pared y los celulares de Gravedad. */

export type MapId = 'lab' | 'reactor' | 'inversor' | 'caos';
export type ModeId = 'rondas' | 'distancia';
export type Phase = 'lobby' | 'count' | 'play' | 'round' | 'over';
export type PowerKind = 'escudo' | 'pulso' | 'turbo' | 'doble' | 'quiebre';

export const MAPS: readonly { id: MapId; name: string; tag: string; accent: string; accent2: string; bgTop: string; bgBot: string }[] = [
  { id: 'lab', name: 'Laboratorio', tag: 'Clásico y limpio', accent: '#38e8ff', accent2: '#f5b841', bgTop: '#08111c', bgBot: '#0f1c2e' },
  { id: 'reactor', name: 'Reactor', tag: 'Móviles y baja gravedad', accent: '#7dff6b', accent2: '#ff8a3d', bgTop: '#09150e', bgBot: '#132418' },
  { id: 'inversor', name: 'Inversor', tag: 'Portales y giros', accent: '#ff52c8', accent2: '#9a7bff', bgTop: '#16091b', bgBot: '#24102c' },
  { id: 'caos', name: 'Caos', tag: 'Pisos frágiles y velocidad', accent: '#ff5555', accent2: '#ffd447', bgTop: '#190a0d', bgBot: '#291116' },
];

export const MODES: readonly { id: ModeId; name: string; tag: string }[] = [
  { id: 'rondas', name: 'Rondas', tag: 'Al mejor de 5' },
  { id: 'distancia', name: 'Distancia', tag: 'Récord en metros' },
];

export const POWERS: Record<PowerKind, { label: string; color: string; short: string }> = {
  escudo: { label: 'Escudo', color: '#4de8ff', short: 'E' },
  pulso: { label: 'Pulso', color: '#ff55d8', short: 'P' },
  turbo: { label: 'Turbo', color: '#ffad33', short: 'T' },
  doble: { label: 'Doble salto', color: '#7dff6b', short: '2' },
  quiebre: { label: 'Quiebre', color: '#ff5c5c', short: 'Q' },
};

export const COLORS = [
  0x38e8ff, // cian
  0xff5577, // coral
  0x7dff6b, // lima
  0xffc93c, // oro
  0xc07cff, // violeta
  0xff8a3d, // naranja
  0x57a6ff, // azul
  0xff6bd6, // magenta
];

export const MAX_PLAYERS = 8;

export interface Seat {
  id: number;
  name: string;
  color: number;
  bot?: boolean;
  points: number;
  bestMeters: number;
  alive: boolean;
  dir: 1 | -1;
  shield: boolean;
  turbo: boolean;
  airFlips: number;
}

export interface Shared {
  phase: Phase;
  map: MapId;
  mode: ModeId;
  bots: number;
  round: number;
  maxRounds: number;
  lead: number | null;
  meters: number;
  record: number;
  seats: Seat[];
  winner: string | null;
  lastPower: { who: string; kind: PowerKind; at: number } | null;
}

export type Command =
  | { a: 'name'; name: string }
  | { a: 'color'; color: number }
  | { a: 'map'; map: MapId }
  | { a: 'mode'; mode: ModeId }
  | { a: 'bots'; bots: number }
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
