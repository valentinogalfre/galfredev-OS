import './phone.css';
import logoUrl from '../../../app/src/main/assets/remote/logo.svg';
import { connect, type Link } from '../net/link';
import { KITS, cleanAvatar, type Command, type FromRoom, type Shared, type Team, type Wish } from './protocol';
import { goFull, holdStill } from './touch';

const room = new URLSearchParams(location.hash.slice(1)).get('r') ?? '';
const store = (key: string, value?: string): string => {
  try {
    if (value !== undefined) localStorage.setItem(`futbol.${key}`, value);
    return localStorage.getItem(`futbol.${key}`) ?? '';
  } catch {
    return '';
  }
};
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const app = document.getElementById('app') as HTMLElement;
const pitch = document.createElement('section');
pitch.id = 'pad';
document.body.appendChild(pitch);

let link: Link | null = null;
let online = false;
let me: { id: number; name: string } | null = null;
let shared: Shared | null = null;
let problem = '';
/** La palanca: de -1 a 1 en cada eje, y el botón de patear. */
const stick = { x: 0, y: 0 };
let kick = false;
let prefsOpen = false;

interface PadPrefs {
  mode: 'fixed' | 'touch';
  stickSize: 's' | 'm' | 'l';
  kickSize: 's' | 'm' | 'l';
  curve: 'soft' | 'normal' | 'sharp';
  hand: 'right' | 'left';
  vibe: boolean;
}

const DEFAULT_PREFS: PadPrefs = { mode: 'fixed', stickSize: 'm', kickSize: 'm', curve: 'normal', hand: 'right', vibe: true };
function loadPrefs(): PadPrefs {
  try {
    const raw = store('prefs');
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
const prefs: PadPrefs = loadPrefs();
function savePrefs(): void {
  store('prefs', JSON.stringify(prefs));
  applyPrefsToPad();
}
function buzz(pattern: number | number[]): void {
  if (prefs.vibe) navigator.vibrate?.(pattern);
}

const STICK_PX: Record<PadPrefs['stickSize'], { ring: number; knob: number; reach: number }> = {
  s: { ring: 118, knob: 48, reach: 46 },
  m: { ring: 146, knob: 58, reach: 58 },
  l: { ring: 174, knob: 68, reach: 70 },
};
const KICK_PX: Record<PadPrefs['kickSize'], number> = { s: 112, m: 140, l: 168 };

const head = () => `<header><img src="${logoUrl}" alt="galfredev"><span class="tag ${online ? 'up' : ''}"><i></i>${online ? 'Conectado' : 'Sin conexión'}</span></header>`;
const command = (c: Command | Wish) => link?.send({ t: 'cmd', d: c });

function join(name: string): void {
  store('name', name);
  problem = '';
  link?.close();
  const key = () => (store('room') === room ? store('key') : '');
  link = connect<FromRoom>(() => ({ t: 'join', room, name, key: key() }), onMessage, (up) => {
    online = up;
    render();
  });
}

function onMessage(message: FromRoom): void {
  if (message.t === 'joined') {
    me = { id: message.id, name: message.name };
    store('room', room);
    store('key', message.key);
    const avatar = store('avatar');
    if (avatar) command({ a: 'avatar', v: avatar });
  } else if (message.t === 'error') {
    problem = { room: 'Esta sala ya cerró. Escaneá de nuevo el código de la pared.', name: 'Ese nombre no sirve. Probá con otro.', full: 'La sala está llena.', moved: 'Este control se abrió en otra pestaña. Entrá de nuevo para jugar desde acá.' }[message.code];
    link?.close();
    link = null;
    me = null;
  } else if (message.t === 'all') {
    const before = shared;
    shared = message.d;
    // Un gol se siente en la mano: largo si es a favor, corto si es en contra.
    if (before && me && message.d.last && (before.score[0] !== message.d.score[0] || before.score[1] !== message.d.score[1])) {
      const mine = message.d.players.find((p) => p.id === me!.id);
      buzz(mine && mine.team === message.d.last.team ? [80, 60, 160] : 60);
    }
    if (before && !before.overtime && message.d.overtime) buzz([90, 50, 90, 50, 180]);
    if (before && document.body.classList.contains('playing') && before.phase === message.d.phase && before.paused === message.d.paused && team() !== 2) return paintPad();
  } else if (message.t === 'host' && !message.on) {
    shared = null;
  } else return;
  render();
}

function team(): Team {
  return (shared && me && shared.players.find((p) => p.id === me!.id)?.team) ?? 2;
}

function render(): void {
  const playing = !!(me && shared && shared.phase === 'play' && team() !== 2);
  document.body.classList.toggle('playing', playing);
  turn(playing);
  if (playing) return buildPad();
  pitch.innerHTML = '';
  stick.x = stick.y = 0;
  kick = false;
  if (!room) app.innerHTML = `${head()}<div class="fill stack mid"><span class="tag">Fútbol</span><h1>Escaneá el código de la pared</h1><p>Esta página se abre desde el código que muestra el proyector.</p></div>`;
  else if (!me) {
    app.innerHTML = `${head()}<div class="fill stack mid">
      <div><span class="tag">Fútbol · picadito</span><h1>Tu celular es el jugador</h1><p>${problem ? esc(problem) : 'Poné tu nombre y entrá a la cancha.'}</p></div>
      <input id="name" maxlength="16" autocomplete="off" autocapitalize="words" placeholder="Tu nombre" value="${esc(store('name'))}">
      <button class="go cinta" id="enter">Entrar</button></div>`;
    const input = app.querySelector('#name') as HTMLInputElement;
    const enter = () => {
      if (!input.value.trim()) return;
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
      join(input.value.trim());
    };
    (app.querySelector('#enter') as HTMLElement).addEventListener('click', enter);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
  } else if (!shared) {
    app.innerHTML = `${head()}<div class="fill stack mid"><span class="tag">Fútbol</span><h1>Esperando a la pared</h1><p>Abrí Fútbol en el proyector, desde Juntada.</p></div>`;
  } else lobby(shared);
}

/** Jugando, la pantalla va acostada. Donde el navegador no deja girarla, se dibuja girada. */
let turned = false;
function turn(flat: boolean): void {
  if (flat === turned) return;
  turned = flat;
  const orientation = screen.orientation as unknown as { lock?: (o: string) => Promise<void>; unlock?: () => void } | undefined;
  try {
    if (flat) void orientation?.lock?.('landscape').catch(() => undefined); else orientation?.unlock?.();
  } catch { /* sin permiso para girar */ }
}

function prefsHtml(): string {
  const seg = <K extends keyof PadPrefs>(key: K, items: [PadPrefs[K], string][]) =>
    `<div class="segs">${items.map(([v, label]) => `<button type="button" class="seg ${prefs[key] === v ? 'on' : ''}" data-pk="${key}" data-pv="${String(v)}">${label}</button>`).join('')}</div>`;
  return `<div class="prefs-grid">
    <div class="pref"><span class="tag">Palanca</span>${seg('mode', [['fixed', 'Fija'], ['touch', 'Al toque']])}</div>
    <div class="pref"><span class="tag">Sensibilidad</span>${seg('curve', [['soft', 'Suave'], ['normal', 'Normal'], ['sharp', 'Precisa']])}</div>
    <div class="pref"><span class="tag">Tamaño palanca</span>${seg('stickSize', [['s', 'Chica'], ['m', 'Media'], ['l', 'Grande']])}</div>
    <div class="pref"><span class="tag">Botón patear</span>${seg('kickSize', [['s', 'Chico'], ['m', 'Medio'], ['l', 'Grande']])}</div>
    <div class="pref"><span class="tag">Lado</span>${seg('hand', [['right', 'Diestro'], ['left', 'Zurdo']])}</div>
    <div class="pref"><span class="tag">Vibración</span>${seg('vibe', [[true, 'Sí'], [false, 'No']])}</div>
  </div>`;
}

function wirePrefs(root: HTMLElement, onChange?: () => void): void {
  root.querySelectorAll<HTMLElement>('[data-pk]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.pk as keyof PadPrefs;
      const raw = btn.dataset.pv ?? '';
      (prefs as unknown as Record<string, unknown>)[key] = key === 'vibe' ? raw === 'true' : raw;
      savePrefs();
      onChange?.();
    });
  });
}

function pick(label: string, value: string, action: string): string {
  return `<div class="pick"><button class="quiet" data-a="${action}" data-d="-1">‹</button><div><span class="tag">${label}</span><b>${esc(value)}</b></div><button class="quiet" data-a="${action}" data-d="1">›</button></div>`;
}

function lobby(state: Shared): void {
  // Lo que alguien está escribiendo no se pierde porque la pared mandó otra cosa.
  const typing = document.activeElement && document.activeElement.id === 'avatar' ? (document.activeElement as HTMLInputElement).value : null;
  const self = state.players.find((p) => p.id === me!.id);
  const lead = state.lead === me!.id;
  const mine = team();
  const kit = mine === 2 ? null : KITS[state.kits[mine]];
  const leader = state.players.find((p) => p.id === state.lead);
  const over = state.phase === 'over';
  const watching = state.phase === 'play';
  const teams = ([0, 1, 2] as Team[]).map((t) => {
    const k = t === 2 ? null : KITS[state.kits[t]];
    const n = state.players.filter((p) => p.team === t && p.on).length;
    return `<button class="side ${mine === t ? 'on' : ''}" data-team="${t}" style="${k ? `--kit:${hex(k.color)};--ink:${hex(k.ink)}` : ''}"><i></i>${k ? esc(k.name) : 'Afuera'}<span>${n}</span></button>`;
  }).join('');
  const rows = state.players.map((p) => {
    const k = p.team === 2 ? null : KITS[state.kits[p.team]];
    return `<li class="${p.on ? '' : 'off'}"><b style="${k ? `background:${hex(k.color)};color:${hex(k.ink)}` : ''}">${esc(p.avatar)}</b>${esc(p.name)}<span class="tag">${p.id === state.lead ? 'lidera · ' : ''}${k ? esc(k.name) : 'afuera'}</span></li>`;
  }).join('');
  const result = over
    ? `<div class="final"><span class="tag">Final</span><h1>${state.winner === 0 || state.winner === 1 ? `Ganó ${esc(KITS[state.kits[state.winner]].name)}` : 'Empate'}</h1><p class="score">${state.score[0]} – ${state.score[1]}</p></div>`
    : watching ? `<div class="final"><span class="tag">Partido en juego · ${clock(state.clock)}</span><p class="score">${state.score[0]} – ${state.score[1]}</p><p>Elegí un equipo para entrar a la cancha.</p></div>` : '';
  const settings = lead && !watching ? `
      <h2 class="tag title">La sala</h2>
      ${pick('Cancha', state.field, 'field')}
      ${pick('Tiempo', state.minutes ? `${state.minutes} min` : 'Sin reloj', 'time')}
      ${pick('Goles', state.goals ? `A ${state.goals}` : 'Sin límite', 'goals')}
      ${pick('Ritmo', state.tempo || 'Normal', 'tempo')}
      <div class="row">${pick('Izquierda', KITS[state.kits[0]].name, 'kit0')}</div>
      <div class="row">${pick('Derecha', KITS[state.kits[1]].name, 'kit1')}</div>
      <div class="row"><button class="quiet" data-c="shuffle">Mezclar equipos</button><button class="quiet" data-c="exit">Salir del juego</button></div>` : '';
  const foot = lead
    ? watching ? `<div class="row"><button class="quiet" data-c="pause">${state.paused ? 'Seguir' : 'Pausa'}</button><button class="quiet" data-c="stop">Terminar</button></div>`
      : `<button class="go cinta" data-c="start">${over ? 'Revancha' : 'Jugar'}</button>${over ? '<button class="quiet wide" data-c="stop">Volver a la sala</button>' : ''}`
    : `<p>${leader ? `${esc(leader.name)} arranca el partido` : 'Esperando jugadores'}</p>`;
  app.innerHTML = `${head()}
    <div class="fill scroll stack">
      ${result}
      <div class="me" style="${kit ? `--kit:${hex(kit.color)};--ink:${hex(kit.ink)}` : ''}">
        <b class="ball">${esc(self?.avatar ?? '')}</b>
        <div><span class="tag">Tu jugador</span><strong>${esc(me!.name)}</strong></div>
        <label><span class="tag">Letras</span><input id="avatar" maxlength="4" autocomplete="off" value="${esc(self?.avatar ?? '')}"></label>
      </div>
      <div class="sides">${teams}</div>
      <details class="controls-box" ${prefsOpen ? 'open' : ''}>
        <summary><span class="tag">Mis controles</span><em>${prefs.mode === 'fixed' ? 'Fija' : 'Al toque'} · ${prefs.hand === 'left' ? 'Zurdo' : 'Diestro'}</em></summary>
        ${prefsHtml()}
      </details>
      ${settings}
      <h2 class="tag title">En la cancha · ${state.players.filter((q) => q.on).length}</h2>
      <ol>${rows}</ol>
    </div>
    <div class="foot stack">${foot}</div>`;
  const box = app.querySelector('.controls-box') as HTMLDetailsElement | null;
  box?.addEventListener('toggle', () => { prefsOpen = box.open; });
  wirePrefs(app, () => render());
  app.querySelectorAll<HTMLElement>('[data-team]').forEach((b) => b.addEventListener('click', () => command({ a: 'team', team: Number(b.dataset.team) as Team })));
  app.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => b.addEventListener('click', () => command({ a: b.dataset.c } as Command)));
  app.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
    const d = (b.dataset.d === '-1' ? -1 : 1) as 1 | -1, a = b.dataset.a as string;
    command(a === 'kit0' || a === 'kit1' ? { a: 'kit', team: a === 'kit0' ? 0 : 1, d } : { a, d } as Command);
  }));
  const avatar = app.querySelector('#avatar') as HTMLInputElement;
  if (typing !== null) {
    avatar.value = typing;
    avatar.focus();
  }
  avatar.addEventListener('change', () => {
    const v = cleanAvatar(avatar.value);
    if (!v) return;
    store('avatar', v);
    command({ a: 'avatar', v });
  });
}

function applyPrefsToPad(): void {
  const s = STICK_PX[prefs.stickSize];
  pitch.style.setProperty('--ring', `${s.ring}px`);
  pitch.style.setProperty('--knob', `${s.knob}px`);
  pitch.style.setProperty('--kick', `${KICK_PX[prefs.kickSize]}px`);
  pitch.classList.toggle('lefty', prefs.hand === 'left');
  const hint = pitch.querySelector('.zone .hint');
  if (hint) hint.textContent = prefs.mode === 'fixed' ? 'Palanca fija con límite' : 'Tocá para mover (anclada)';
}

function shapeStick(dx: number, dy: number, reach: number): { x: number; y: number; vx: number; vy: number } {
  const far = Math.hypot(dx, dy);
  if (far === 0) return { x: 0, y: 0, vx: 0, vy: 0 };
  const clamped = Math.min(far, reach);
  const nx = dx / far, ny = dy / far;
  const dead = prefs.curve === 'sharp' ? 0.06 : prefs.curve === 'soft' ? 0.12 : 0.09;
  const raw = clamped / reach;
  let mag = raw <= dead ? 0 : (raw - dead) / (1 - dead);
  if (prefs.curve === 'soft') mag = mag * mag;
  else if (prefs.curve === 'normal') mag = Math.pow(mag, 1.25);
  return { x: nx * mag, y: ny * mag, vx: nx * clamped, vy: ny * clamped };
}

/**
 * El control: palanca con límite firme (fija o anclada al toque, nunca se escapa de la pantalla),
 * botón de patear personalizable y panel rápido de ajustes en vivo.
 */
function buildPad(): void {
  if (pitch.querySelector('.zone')) return paintPad();
  pitch.innerHTML = `
    <div class="zone"><div class="ring"><i></i></div><span class="hint tag">Palanca fija con límite</span></div>
    <div class="top"><span class="board"></span><span class="tag clock"></span></div>
    <button class="kick"><b>Patear</b></button>
    <button class="quiet gear" title="Controles">⚙</button>
    <button class="quiet pause">II</button>
    <div class="sheet"><div class="sheet-card"><div class="sheet-head"><span class="tag">Personalizar controles</span><button class="quiet close-sheet">Listo</button></div><div class="sheet-body"></div></div></div>
    <div class="paused"><b>Pausa</b><div class="row"><button class="go cinta" data-c="pause">Seguir</button><button class="quiet" data-c="stop">Terminar</button></div></div>`;
  const zone = pitch.querySelector('.zone') as HTMLElement, ring = pitch.querySelector('.ring') as HTMLElement, knob = ring.querySelector('i') as HTMLElement;
  let finger = -1, ox = 0, oy = 0;
  // Girada a mano (celular parado sin poder acostar la pantalla), los ejes del dedo también giran.
  const axes = (e: PointerEvent) => {
    const tall = window.innerHeight > window.innerWidth, box = zone.getBoundingClientRect();
    return tall
      ? { x: e.clientY - box.top, y: box.right - e.clientX, w: box.height, h: box.width }
      : { x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, h: box.height };
  };
  const ringCenter = () => {
    const tall = window.innerHeight > window.innerWidth, zb = zone.getBoundingClientRect(), rb = ring.getBoundingClientRect();
    const rcx = rb.left + rb.width / 2, rcy = rb.top + rb.height / 2;
    return tall ? { x: rcy - zb.top, y: zb.right - rcx } : { x: rcx - zb.left, y: rcy - zb.top };
  };
  const updateFrom = (ax: number, ay: number) => {
    const reach = STICK_PX[prefs.stickSize].reach;
    const out = shapeStick(ax - ox, ay - oy, reach);
    stick.x = out.x;
    stick.y = out.y;
    knob.style.transform = `translate(${out.vx}px, ${out.vy}px)`;
  };
  zone.addEventListener('pointerdown', (e) => {
    if (finger !== -1) return;
    finger = e.pointerId;
    zone.setPointerCapture?.(e.pointerId);
    const at = axes(e);
    const half = STICK_PX[prefs.stickSize].ring / 2 + 12;
    if (prefs.mode === 'fixed') {
      const c = ringCenter();
      ox = c.x;
      oy = c.y;
    } else {
      ox = Math.max(half, Math.min(at.w - half, at.x));
      oy = Math.max(half, Math.min(at.h - half, at.y));
      ring.style.left = `${ox}px`;
      ring.style.top = `${oy}px`;
    }
    ring.classList.add('held');
    updateFrom(at.x, at.y);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== finger) return;
    const at = axes(e);
    updateFrom(at.x, at.y);
  });
  for (const type of ['pointerup', 'pointercancel']) zone.addEventListener(type, (e) => {
    if ((e as PointerEvent).pointerId !== finger) return;
    finger = -1;
    stick.x = stick.y = 0;
    knob.style.transform = '';
    ring.style.left = ring.style.top = '';
    ring.classList.remove('held');
  });
  const button = pitch.querySelector('.kick') as HTMLElement;
  const press = (down: boolean) => (e: Event) => {
    e.preventDefault();
    if (down && !kick) buzz(18);
    kick = down;
    button.classList.toggle('held', down);
    send();
  };
  button.addEventListener('pointerdown', press(true));
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, press(false));
  const sheet = pitch.querySelector('.sheet') as HTMLElement;
  const sheetBody = pitch.querySelector('.sheet-body') as HTMLElement;
  const paintSheet = () => {
    sheetBody.innerHTML = prefsHtml();
    wirePrefs(sheetBody, paintSheet);
  };
  (pitch.querySelector('.gear') as HTMLElement).addEventListener('click', () => {
    paintSheet();
    sheet.classList.add('on');
  });
  (pitch.querySelector('.close-sheet') as HTMLElement).addEventListener('click', () => sheet.classList.remove('on'));
  (pitch.querySelector('.pause') as HTMLElement).addEventListener('click', () => command({ a: 'pause' }));
  pitch.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => b.addEventListener('click', () => command({ a: b.dataset.c } as Command)));
  applyPrefsToPad();
  paintPad();
}

function paintPad(): void {
  if (!shared || !me) return;
  const mine = team(), board = pitch.querySelector('.board'), time = pitch.querySelector('.clock');
  if (!board || !time) return;
  const k0 = KITS[shared.kits[0]], k1 = KITS[shared.kits[1]];
  board.innerHTML = `<i style="background:${hex(k0.color)}"></i>${shared.score[0]} – ${shared.score[1]}<i style="background:${hex(k1.color)}"></i>`;
  time.textContent = shared.overtime ? 'Gol de oro' : clock(shared.clock);
  const kit = mine === 2 ? KITS[0] : KITS[shared.kits[mine]];
  pitch.style.setProperty('--kit', hex(kit.color));
  pitch.style.setProperty('--ink', hex(kit.ink));
  const lead = shared.lead === me.id;
  pitch.classList.toggle('lead', lead);
  pitch.classList.toggle('stopped', shared.paused);
}

// La palanca sale treinta veces por segundo jugando, y un aviso de vida el resto del tiempo.
let beat = 0;
let lastBeat = 0;
let lastSent = '';
function send(): void {
  const text = `${Math.round(stick.x * 100) / 100}|${Math.round(stick.y * 100) / 100}|${kick ? 1 : 0}`;
  lastSent = text;
  link?.send({ t: 'in', x: Math.round(stick.x * 100) / 100, y: Math.round(stick.y * 100) / 100, k: kick ? 1 : 0 });
}
setInterval(() => {
  if (document.body.classList.contains('playing')) {
    send();
    lastBeat = performance.now();
  } else if (performance.now() - lastBeat > 3000) {
    lastBeat = performance.now();
    if (lastSent !== '0|0|0') send();
    link?.send({ t: 'ping', n: ++beat });
  }
}, 33);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void (navigator as unknown as { wakeLock?: { request(type: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => undefined);
});
void (navigator as unknown as { wakeLock?: { request(type: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => undefined);

holdStill();
goFull();
render();
if (room && store('room') === room && store('key') && store('name')) join(store('name'));
