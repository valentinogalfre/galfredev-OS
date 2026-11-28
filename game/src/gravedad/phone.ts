import './phone.css';
import { connect } from '../net/link';
import { goFull, holdStill } from '../futbol/touch';
import { COLORS, MAPS, MODES, type Command, type FromRoom, type Seat, type Shared } from './protocol';

holdStill();
goFull();

const hash = new URLSearchParams(location.hash.slice(1));
const room = hash.get('r') ?? '';
const app = document.getElementById('app')!;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let myId: number | null = null;
let myKey = sessionStorage.getItem(`gd.gravedad.k.${room}`) || '';
let myName = localStorage.getItem('gd.jname') || localStorage.getItem('gd.gravedad.n') || '';
let shared: Shared | null = null;
let online = false;
let menuOpen = false;
let kicked = false;
let pressPulse = false;

const link = connect<FromRoom>(
  () => ({ t: 'join', room, name: myName || 'Jugador', key: myKey }),
  (msg) => {
    if (msg.t === 'joined') {
      myId = msg.id;
      myKey = msg.key;
      if (!myName) myName = msg.name;
      try { sessionStorage.setItem(`gd.gravedad.k.${room}`, myKey); } catch { /* */ }
      render();
    } else if (msg.t === 'all') {
      shared = msg.d;
      document.body.classList.toggle('playing', shared.phase === 'play' || shared.phase === 'count');
      render();
    } else if (msg.t === 'you' && msg.d.kicked) {
      kicked = true;
      render();
    }
  },
  (up) => {
    online = up;
    render();
  },
);

function cmd(d: Command): void {
  link.send({ t: 'cmd', d });
}

function triggerFlip(): void {
  link.send({ t: 'in', s: 0, x: 0, y: 0, b: false, n: false, k: true });
  setTimeout(() => link.send({ t: 'in', s: 0, x: 0, y: 0, b: false, n: false, k: false }), 45);
  if (navigator.vibrate) navigator.vibrate(18);
  pressPulse = true;
  const zone = document.getElementById('flip-zone');
  if (zone) {
    zone.classList.add('hit');
    setTimeout(() => {
      pressPulse = false;
      zone.classList.remove('hit');
    }, 80);
  }
}

function mySeat(): Seat | undefined {
  if (!shared || myId === null) return undefined;
  return shared.seats.find((s) => s.id === myId);
}

function render(): void {
  if (kicked) {
    app.innerHTML = `<div class="screen"><div class="box"><div class="title">Te sacaron de la sala</div><div style="margin-top:8px;opacity:0.75">Escaneá de nuevo el QR si querés volver a entrar.</div></div></div>`;
    return;
  }
  if (!shared) {
    app.innerHTML = `<div class="screen"><div class="box"><div class="title">Gravedad</div><div style="margin-top:8px;opacity:0.75">${online ? 'Conectando a la sala…' : 'Buscando el proyector…'}</div></div></div>`;
    return;
  }

  const isLead = myId !== null && shared.lead === myId;
  const seat = mySeat();
  const colorHex = seat ? hex(seat.color) : '#38e8ff';

  // Pantalla de juego: 1 botón gigante (sin mirar el celu).
  if (shared.phase === 'play' || shared.phase === 'count' || shared.phase === 'round') {
    const alive = seat ? seat.alive : false;
    const dir = seat ? seat.dir : 1;
    const arrow = dir === 1 ? '▲' : '▼';
    const powerBadges: string[] = [];
    if (seat?.shield) powerBadges.push('Escudo');
    if (seat?.turbo) powerBadges.push('Turbo');
    if (seat && seat.airFlips > 0) powerBadges.push(`Doble x${seat.airFlips}`);

    const bg = !alive && shared.phase === 'play'
      ? '#161117'
      : dir === 1
        ? `linear-gradient(180deg, #0b101c 0%, ${colorHex}33 100%)`
        : `linear-gradient(0deg, #0b101c 0%, ${colorHex}33 100%)`;

    app.innerHTML = `
      <div class="pad" style="background:${bg}">
        <div class="top-bar">
          <div class="status-chip" style="border-color:${colorHex}">${esc(seat ? seat.name : myName)} · ${shared.meters} m${powerBadges.length ? ` · ${powerBadges.join(' · ')}` : ''}</div>
          <button class="menu-btn" id="open-menu">Menú</button>
        </div>
        <button class="flip-zone ${pressPulse ? 'hit' : ''}" id="flip-zone" ${!alive && shared.phase === 'play' ? 'disabled' : ''}>
          <div class="arrow" style="color:${alive ? colorHex : '#777'}">${shared.phase === 'count' ? '●' : alive ? arrow : '✕'}</div>
          <div class="flip-text">${shared.phase === 'count' ? 'Preparate' : shared.phase === 'round' ? 'Fin de ronda' : alive ? 'Invertir' : 'Eliminado'}</div>
          <div class="flip-sub">${alive ? 'Tocá en cualquier parte de la pantalla' : 'Esperando la siguiente ronda'}</div>
        </button>
      </div>
      ${menuOpen ? renderMenu(isLead) : ''}`;

    const zone = document.getElementById('flip-zone');
    if (zone && shared.phase === 'play' && alive) {
      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        triggerFlip();
      });
    }
    bindMenu(isLead);
    return;
  }

  // Lobby o pantalla final.
  const swatches = COLORS.map((c) => `<div class="swatch ${seat && seat.color === c ? 'on' : ''}" data-color="${c}" style="background:${hex(c)}"></div>`).join('');
  const mapBtns = MAPS.map((m) => `<button class="btn ${shared!.map === m.id ? 'on' : ''}" data-map="${m.id}">${m.name}</button>`).join('');
  const modeBtns = MODES.map((m) => `<button class="btn ${shared!.mode === m.id ? 'on' : ''}" data-mode="${m.id}">${m.name}</button>`).join('');
  const botBtns = [0, 1, 2, 3, 4].map((b) => `<button class="btn ${shared!.bots === b ? 'on' : ''}" data-bots="${b}">${b}</button>`).join('');

  app.innerHTML = `
    <div class="screen">
      <div class="head">
        <div class="title">Gravedad</div>
        <div class="badge" style="color:${colorHex}">${isLead ? 'Líder ★' : online ? 'En sala' : 'Sin conexión'}</div>
      </div>

      ${shared.phase === 'over' ? `
        <div class="box">
          <div class="label">Resultado</div>
          <div style="font-size:20px;font-weight:600;margin-bottom:8px">${shared.winner ? `Ganó ${esc(shared.winner)}` : 'Partida terminada'}</div>
          <div style="opacity:0.75;margin-bottom:10px">Distancia: ${shared.meters} m · Récord: ${shared.record} m</div>
          ${isLead ? `<button class="btn primary" id="again">Jugar otra vez</button><button class="btn" id="to-lobby" style="width:100%;margin-top:8px">Volver a la sala</button>` : '<div style="opacity:0.7">Esperando al líder…</div>'}
        </div>` : ''}

      <div class="box">
        <div class="label">Tu corredor</div>
        <div class="row" style="margin-bottom:10px">
          <input type="text" id="name-in" maxlength="14" value="${esc(seat ? seat.name : myName)}" placeholder="Tu nombre">
          <button class="btn" id="save-name" style="margin:0 0 0 8px">Guardar</button>
        </div>
        <div class="swatches">${swatches}</div>
      </div>

      ${isLead && shared.phase === 'lobby' ? `
        <div class="box">
          <div class="label">Mapa</div>
          <div class="row">${mapBtns}</div>
          <div class="label" style="margin-top:6px">Modo</div>
          <div class="row">${modeBtns}</div>
          <div class="label" style="margin-top:6px">Bots</div>
          <div class="row">${botBtns}</div>
          <button class="btn primary" id="start">Empezar</button>
        </div>
        <button class="btn danger" id="exit-game" style="width:100%">Cerrar juego en el proyector</button>
      ` : shared.phase === 'lobby' ? `
        <div class="box" style="text-align:center;opacity:0.8">Esperando a que el líder largue la partida…</div>
      ` : ''}
    </div>`;

  const saveBtn = document.getElementById('save-name');
  const nameIn = document.getElementById('name-in') as HTMLInputElement | null;
  if (saveBtn && nameIn) {
    saveBtn.onclick = () => {
      const val = nameIn.value.trim().slice(0, 14);
      if (!val) return;
      myName = val;
      try { localStorage.setItem('gd.jname', val); } catch { /* */ }
      cmd({ a: 'name', name: val });
    };
  }
  app.querySelectorAll<HTMLElement>('[data-color]').forEach((el) => {
    el.onclick = () => cmd({ a: 'color', color: Number(el.dataset.color) });
  });
  app.querySelectorAll<HTMLElement>('[data-map]').forEach((el) => {
    el.onclick = () => cmd({ a: 'map', map: el.dataset.map as Shared['map'] });
  });
  app.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
    el.onclick = () => cmd({ a: 'mode', mode: el.dataset.mode as Shared['mode'] });
  });
  app.querySelectorAll<HTMLElement>('[data-bots]').forEach((el) => {
    el.onclick = () => cmd({ a: 'bots', bots: Number(el.dataset.bots) });
  });
  const startBtn = document.getElementById('start');
  if (startBtn) startBtn.onclick = () => cmd({ a: 'start' });
  const againBtn = document.getElementById('again');
  if (againBtn) againBtn.onclick = () => cmd({ a: 'again' });
  const lobbyBtn = document.getElementById('to-lobby');
  if (lobbyBtn) lobbyBtn.onclick = () => cmd({ a: 'lobby' });
  const exitBtn = document.getElementById('exit-game');
  if (exitBtn) exitBtn.onclick = () => cmd({ a: 'exit' });
}

function renderMenu(isLead: boolean): string {
  return `
    <div class="modal" id="modal">
      <div class="modal-card">
        <div class="title" style="margin-bottom:14px">Menú</div>
        <button class="btn on" id="m-resume">Seguir</button>
        ${isLead ? `
          <button class="btn" id="m-again">Reiniciar partida</button>
          <button class="btn" id="m-lobby">Volver a la sala</button>
          <button class="btn danger" id="m-exit">Cerrar en el proyector</button>
        ` : ''}
      </div>
    </div>`;
}

function bindMenu(isLead: boolean): void {
  const openBtn = document.getElementById('open-menu');
  if (openBtn) openBtn.onclick = () => { menuOpen = true; render(); };
  const resume = document.getElementById('m-resume');
  if (resume) resume.onclick = () => { menuOpen = false; render(); };
  if (isLead) {
    const again = document.getElementById('m-again');
    if (again) again.onclick = () => { menuOpen = false; cmd({ a: 'again' }); };
    const lobby = document.getElementById('m-lobby');
    if (lobby) lobby.onclick = () => { menuOpen = false; cmd({ a: 'lobby' }); };
    const exit = document.getElementById('m-exit');
    if (exit) exit.onclick = () => { menuOpen = false; cmd({ a: 'exit' }); };
  }
}

render();
