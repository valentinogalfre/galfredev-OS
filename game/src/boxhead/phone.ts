import './phone.css';
import { connect } from '../net/link';
import { goFull, holdStill } from '../futbol/touch';
import {
  ARENAS,
  MODES,
  PERKS,
  PLAYER_COLORS,
  WEAPON_BY_ID,
  type Command,
  type FromRoom,
  type PerkId,
  type SeatState,
  type Shared,
} from './protocol';

holdStill();
goFull();

const hash = new URLSearchParams(location.hash.slice(1));
const room = hash.get('r') ?? '';
const app = document.getElementById('app')!;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let myId: number | null = null;
let myKey = sessionStorage.getItem(`gd.boxhead.k.${room}`) || '';
let myName = localStorage.getItem('gd.jname') || '';
let shared: Shared | null = null;
let online = false;
let menuOpen = false;
let kicked = false;
let lastScreen = '';

// Estado de controles en vivo (se envía sin re-renderizar el DOM completo durante el juego).
let joyX = 0;
let joyY = 0;
let firing = false;
let dashing = false;
let alting = false;
let joyPid: number | null = null;
let joyCx = 0;
let joyCy = 0;

const link = connect<FromRoom>(
  () => ({ t: 'join', room, name: myName || 'Jugador', key: myKey }),
  (msg) => {
    if (msg.t === 'joined') {
      myId = msg.id;
      myKey = msg.key;
      if (!myName) myName = msg.name;
      try { sessionStorage.setItem(`gd.boxhead.k.${room}`, myKey); } catch { /* */ }
      render(true);
    } else if (msg.t === 'all') {
      shared = msg.d;
      document.body.classList.toggle('playing', shared.phase === 'play');
      if (shared.phase === 'play' && lastScreen === 'play' && !menuOpen) {
        updatePlayHud();
      } else {
        render(false);
      }
    } else if (msg.t === 'you' && msg.d.kicked) {
      kicked = true;
      render(true);
    }
  },
  (up) => {
    online = up;
    if (lastScreen !== 'play') render(true);
  },
);

function cmd(d: Command): void {
  link.send({ t: 'cmd', d });
}

function sendInput(): void {
  if (!shared || shared.phase !== 'play') return;
  link.send({
    t: 'in',
    s: 0,
    x: Math.round(joyX * 100) / 100,
    y: Math.round(joyY * 100) / 100,
    b: alting,
    n: dashing,
    k: firing,
  });
}

setInterval(() => {
  if (shared && shared.phase === 'play') sendInput();
}, 40);

function mySeat(): SeatState | undefined {
  if (!shared || myId === null) return undefined;
  return shared.seats.find((s) => s.id === myId);
}

function updatePlayHud(): void {
  const seat = mySeat();
  if (!seat || !shared) return;
  const fill = document.getElementById('hp-fill');
  if (fill) {
    fill.style.width = `${Math.max(0, Math.min(100, (seat.hp / seat.maxHp) * 100))}%`;
    fill.style.background = seat.downed ? '#ff9f1c' : seat.hp > 40 ? '#7dff6b' : '#ff5555';
  }
  const wepName = document.getElementById('wep-name');
  if (wepName) {
    const spec = WEAPON_BY_ID[seat.weapon];
    wepName.textContent = `${spec.name}${seat.ammo >= 0 ? ` (${seat.ammo})` : ' ∞'}`;
  }
  const dashBtn = document.getElementById('btn-dash');
  if (dashBtn) dashBtn.classList.toggle('ready', seat.dashReady);
  const scoreEl = document.getElementById('my-score');
  if (scoreEl) scoreEl.textContent = seat.downed ? '¡CAÍDO!' : seat.dead ? 'MUERTO' : `${seat.score} pts`;
}

function render(force: boolean): void {
  if (kicked) {
    lastScreen = 'kicked';
    app.innerHTML = `<div class="screen"><div class="box"><div class="title">Te sacaron de la sala</div></div></div>`;
    return;
  }
  if (!shared) {
    lastScreen = 'wait';
    app.innerHTML = `<div class="screen"><div class="box"><div class="title">Boxhead: Horda</div><div style="margin-top:8px;opacity:0.75">${online ? 'Conectando a la sala…' : 'Buscando el proyector…'}</div></div></div>`;
    return;
  }

  const isLead = myId !== null && shared.lead === myId;
  const seat = mySeat();
  const colorHex = seat ? hex(seat.color) : '#2e8bff';

  // Pantalla entre oleadas: elegir 1 de 3 mejoras.
  if (shared.phase === 'perk') {
    lastScreen = 'perk';
    const choices = seat ? seat.perkChoices : [];
    const cards = seat && seat.pickedPerk
      ? `<div class="box" style="text-align:center;font-size:16px">¡Mejora elegida! Esperando al resto… (${shared.perkTime} s)</div>`
      : `<div class="perks">${choices.map((pid: PerkId) => {
          const info = PERKS[pid];
          return `<button class="perk-card" data-perk="${pid}" style="border-color:${info.color}"><b style="color:${info.color}">${info.title}</b><span>${info.desc}</span></button>`;
        }).join('')}</div>`;
    app.innerHTML = `
      <div class="screen">
        <div class="head">
          <div class="title">Oleada ${shared.wave} superada</div>
          <div class="badge">${shared.perkTime} s</div>
        </div>
        ${cards}
      </div>`;
    app.querySelectorAll<HTMLElement>('[data-perk]').forEach((el) => {
      el.onclick = () => cmd({ a: 'perk', perk: el.dataset.perk as PerkId });
    });
    return;
  }

  // Pantalla de juego: stick izquierdo + Disparar + Dash + Barril + selector de arma.
  if (shared.phase === 'play') {
    if (lastScreen === 'play' && !force && !menuOpen) {
      updatePlayHud();
      return;
    }
    lastScreen = 'play';
    const spec = seat ? WEAPON_BY_ID[seat.weapon] : WEAPON_BY_ID.pistol;
    app.innerHTML = `
      <div class="pad">
        <div class="hud-bar">
          <div class="hp-wrap">
            <span id="my-score" style="font-size:13px;font-weight:600;color:${colorHex}">${seat ? seat.score : 0} pts</span>
            <div class="hp-bar"><div class="hp-fill" id="hp-fill" style="width:${seat ? (seat.hp / seat.maxHp) * 100 : 100}%"></div></div>
          </div>
          <div class="wep-bar">
            <button class="wep-btn" id="wep-prev">‹</button>
            <div class="wep-name" id="wep-name">${spec.name}${seat && seat.ammo >= 0 ? ` (${seat.ammo})` : ' ∞'}</div>
            <button class="wep-btn" id="wep-next">›</button>
          </div>
          <button class="wep-btn" id="open-menu">Menú</button>
        </div>
        <div class="controls">
          <div class="zone" id="joy-zone">
            <div class="stick-base" id="stick-base"><div class="stick-knob" id="stick-knob"></div></div>
          </div>
          <div class="actions">
            <div class="side-col">
              <button class="act-btn small ready" id="btn-dash">DASH</button>
              <button class="act-btn small" id="btn-alt">BARRIL</button>
            </div>
            <button class="act-btn fire" id="btn-fire">DISPARAR</button>
          </div>
        </div>
      </div>
      ${menuOpen ? renderMenu(isLead) : ''}`;

    bindPlayControls();
    bindMenu(isLead);
    return;
  }

  // Lobby o Game Over.
  lastScreen = shared.phase;
  const swatches = PLAYER_COLORS.map((c) => `<div class="swatch ${seat && seat.color === c ? 'on' : ''}" data-color="${c}" style="background:${hex(c)}"></div>`).join('');
  const arenaBtns = ARENAS.map((a) => `<button class="btn ${shared!.arena === a.id ? 'on' : ''}" data-arena="${a.id}">${a.name}</button>`).join('');
  const modeBtns = MODES.map((m) => `<button class="btn ${shared!.mode === m.id ? 'on' : ''}" data-mode="${m.id}">${m.name}</button>`).join('');

  app.innerHTML = `
    <div class="screen">
      <div class="head">
        <div class="title">Boxhead: Horda</div>
        <div class="badge" style="color:${colorHex}">${isLead ? 'Líder ★' : online ? 'En sala' : 'Sin conexión'}</div>
      </div>

      ${shared.phase === 'over' ? `
        <div class="box">
          <div class="label">Fin de la horda</div>
          <div style="font-size:19px;font-weight:600;margin-bottom:6px">Oleada ${shared.wave} · Tu puntaje: ${seat ? seat.score : 0}</div>
          ${isLead ? `<button class="btn primary" id="again">Jugar otra vez</button><button class="btn" id="to-lobby" style="width:100%;margin-top:8px">Volver a la sala</button>` : '<div style="opacity:0.75">Esperando al líder…</div>'}
        </div>` : ''}

      <div class="box">
        <div class="label">Tu personaje</div>
        <div class="row" style="margin-bottom:10px">
          <input type="text" id="name-in" maxlength="14" value="${esc(seat ? seat.name : myName)}" placeholder="Tu nombre">
          <button class="btn" id="save-name" style="margin:0 0 0 8px">Guardar</button>
        </div>
        <div class="swatches">${swatches}</div>
      </div>

      ${isLead && shared.phase === 'lobby' ? `
        <div class="box">
          <div class="label">Mapa</div>
          <div class="row">${arenaBtns}</div>
          <div class="label" style="margin-top:6px">Modo</div>
          <div class="row">${modeBtns}<button class="btn ${shared.friendlyFire ? 'on' : ''}" id="toggle-ff">Fuego amigo: ${shared.friendlyFire ? 'Sí' : 'No'}</button></div>
          <button class="btn primary" id="start">Empezar oleada</button>
        </div>
        <button class="btn danger" id="exit-game" style="width:100%">Cerrar juego en el proyector</button>
      ` : shared.phase === 'lobby' ? `
        <div class="box" style="text-align:center;opacity:0.8">Esperando a que el líder arranque la oleada…</div>
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
  app.querySelectorAll<HTMLElement>('[data-arena]').forEach((el) => {
    el.onclick = () => cmd({ a: 'arena', arena: el.dataset.arena as Shared['arena'] });
  });
  app.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
    el.onclick = () => cmd({ a: 'mode', mode: el.dataset.mode as Shared['mode'] });
  });
  const ffBtn = document.getElementById('toggle-ff');
  if (ffBtn) ffBtn.onclick = () => cmd({ a: 'ff', on: !shared!.friendlyFire });
  const startBtn = document.getElementById('start');
  if (startBtn) startBtn.onclick = () => cmd({ a: 'start' });
  const againBtn = document.getElementById('again');
  if (againBtn) againBtn.onclick = () => cmd({ a: 'again' });
  const lobbyBtn = document.getElementById('to-lobby');
  if (lobbyBtn) lobbyBtn.onclick = () => cmd({ a: 'lobby' });
  const exitBtn = document.getElementById('exit-game');
  if (exitBtn) exitBtn.onclick = () => cmd({ a: 'exit' });
}

function bindPlayControls(): void {
  const zone = document.getElementById('joy-zone');
  const knob = document.getElementById('stick-knob');
  const maxR = 46;

  if (zone && knob) {
    const moveStick = (cx: number, cy: number) => {
      const dx = cx - joyCx;
      const dy = cy - joyCy;
      const d = Math.hypot(dx, dy);
      const clamped = Math.min(d, maxR);
      const nx = d > 0.1 ? (dx / d) * clamped : 0;
      const ny = d > 0.1 ? (dy / d) * clamped : 0;
      joyX = nx / maxR;
      joyY = ny / maxR;
      knob.style.transform = `translate(${nx}px, ${ny}px)`;
      sendInput();
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyPid = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const rect = document.getElementById('stick-base')!.getBoundingClientRect();
      joyCx = rect.left + rect.width * 0.5;
      joyCy = rect.top + rect.height * 0.5;
      moveStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyPid) return;
      e.preventDefault();
      moveStick(e.clientX, e.clientY);
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== joyPid) return;
      joyPid = null;
      joyX = 0;
      joyY = 0;
      knob.style.transform = 'translate(0px, 0px)';
      sendInput();
    };
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);
  }

  const fireBtn = document.getElementById('btn-fire');
  if (fireBtn) {
    fireBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      firing = true;
      fireBtn.classList.add('active');
      if (navigator.vibrate) navigator.vibrate(12);
      sendInput();
    });
    const stopFire = () => {
      firing = false;
      fireBtn.classList.remove('active');
      sendInput();
    };
    fireBtn.addEventListener('pointerup', stopFire);
    fireBtn.addEventListener('pointercancel', stopFire);
    fireBtn.addEventListener('pointerleave', stopFire);
  }

  const dashBtn = document.getElementById('btn-dash');
  if (dashBtn) {
    dashBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dashing = true;
      if (navigator.vibrate) navigator.vibrate(20);
      sendInput();
      setTimeout(() => { dashing = false; sendInput(); }, 60);
    });
  }

  const altBtn = document.getElementById('btn-alt');
  if (altBtn) {
    altBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      alting = true;
      if (navigator.vibrate) navigator.vibrate(16);
      sendInput();
      setTimeout(() => { alting = false; sendInput(); }, 60);
    });
  }

  const prev = document.getElementById('wep-prev');
  if (prev) prev.onclick = () => cmd({ a: 'weapon', dir: -1 });
  const next = document.getElementById('wep-next');
  if (next) next.onclick = () => cmd({ a: 'weapon', dir: 1 });
}

function renderMenu(isLead: boolean): string {
  return `
    <div class="modal">
      <div class="modal-card">
        <div class="title" style="margin-bottom:14px">Menú</div>
        <button class="btn on" id="m-resume">Seguir</button>
        ${isLead ? `
          <button class="btn" id="m-again">Reiniciar oleada</button>
          <button class="btn" id="m-lobby">Volver a la sala</button>
          <button class="btn danger" id="m-exit">Cerrar en el proyector</button>
        ` : ''}
      </div>
    </div>`;
}

function bindMenu(isLead: boolean): void {
  const openBtn = document.getElementById('open-menu');
  if (openBtn) openBtn.onclick = () => { menuOpen = true; render(true); };
  const resume = document.getElementById('m-resume');
  if (resume) resume.onclick = () => { menuOpen = false; render(true); };
  if (isLead) {
    const again = document.getElementById('m-again');
    if (again) again.onclick = () => { menuOpen = false; cmd({ a: 'again' }); };
    const lobby = document.getElementById('m-lobby');
    if (lobby) lobby.onclick = () => { menuOpen = false; cmd({ a: 'lobby' }); };
    const exit = document.getElementById('m-exit');
    if (exit) exit.onclick = () => { menuOpen = false; cmd({ a: 'exit' }); };
  }
}

render(true);
