import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GravitySim, TICK, type RosterSeed } from './sim.ts';
import type { MapId } from './protocol.ts';

const TWO: RosterSeed[] = [
  { id: 1, name: 'Ana', color: 0x38e8ff, bot: false },
  { id: 2, name: 'Beto', color: 0xff5577, bot: false },
];

describe('Gravedad — simulación', () => {
  it('invertir en el piso cambia la dirección de gravedad y sube al corredor', () => {
    const sim = new GravitySim('lab', 'rondas', TWO, 42);
    const r = sim.runners[0];
    assert.equal(r.dir, 1);
    assert.equal(sim.flip(1), true);
    assert.equal(r.dir, -1);
    const yBefore = r.y;
    for (let i = 0; i < 15; i++) sim.step(TICK);
    assert.ok(r.y < yBefore - 40, 'tiene que subir al invertir');
  });

  it('en el aire no invierte sin doble salto, pero guarda buffer y dispara al aterrizar', () => {
    const sim = new GravitySim('lab', 'rondas', TWO, 42);
    sim.flip(1); // ahora sube hacia el techo
    for (let i = 0; i < 5; i++) sim.step(TICK);
    const r = sim.runners[0];
    assert.equal(r.grounded, false);
    assert.equal(sim.flip(1), false); // en el aire sin doble salto
    // Cuando llegue al techo, si apretó justo antes (buffer), invierte solo.
    while (!r.grounded && r.alive && sim.time < 2) {
      if (r.y < 185) sim.flip(1);
      sim.step(TICK);
    }
    assert.equal(r.dir, 1, 'el buffer tiene que invertir al tocar el techo');
  });

  it('doble salto deja invertir en pleno aire', () => {
    const sim = new GravitySim('lab', 'rondas', TWO, 42);
    const r = sim.runners[0];
    r.airFlips = 1;
    sim.flip(1);
    for (let i = 0; i < 5; i++) sim.step(TICK);
    assert.equal(r.grounded, false);
    assert.equal(sim.flip(1), true);
    assert.equal(r.dir, 1);
    assert.equal(r.airFlips, 0);
  });

  it('pulso invierte a los rivales y no a quien lo agarró', () => {
    const sim = new GravitySim('lab', 'rondas', TWO, 42);
    const a = sim.runners[0];
    const b = sim.runners[1];
    sim.pickups.push({ id: 999, x: a.x + 8, y: a.y, kind: 'pulso', taken: false });
    sim.step(TICK);
    assert.equal(a.dir, 1, 'quien agarra pulso mantiene su gravedad');
    assert.equal(b.dir, -1, 'el rival se invierte');
  });

  it('escudo rescata al corredor de una caída fuera de pantalla', () => {
    const sim = new GravitySim('lab', 'distancia', [TWO[0]], 42);
    const a = sim.runners[0];
    a.shield = true;
    a.y = 900; // cayó al vacío
    sim.step(TICK);
    assert.equal(a.alive, true, 'escudo evita la eliminación');
    assert.equal(a.shield, false, 'escudo se consume');
    assert.ok(a.y > 0 && a.y < 720, 'vuelve dentro de la pista');
  });

  it('quiebre vuelve frágiles las plataformas bajo el corredor y se rompen', () => {
    const sim = new GravitySim('lab', 'rondas', TWO, 42);
    const a = sim.runners[0];
    sim.pickups.push({ id: 998, x: a.x + 6, y: a.y, kind: 'quiebre', taken: false });
    sim.step(TICK);
    const floor = sim.platforms[0];
    assert.equal(floor.kind, 'crumble');
    for (let i = 0; i < 30; i++) sim.step(TICK);
    assert.equal(floor.broken, true, 'la plataforma frágil se rompe');
  });

  it('los cuatro mapas generan plataformas y permiten correr con bots', () => {
    const maps: MapId[] = ['lab', 'reactor', 'inversor', 'caos'];
    for (const m of maps) {
      const seeds: RosterSeed[] = [
        { id: 1, name: 'Bot1', color: 0x38e8ff, bot: true },
        { id: 2, name: 'Bot2', color: 0xff5577, bot: true },
      ];
      const sim = new GravitySim(m, 'rondas', seeds, 123);
      for (let i = 0; i < 240; i++) sim.step(TICK);
      assert.ok(sim.meters > 20, `mapa ${m} tiene que avanzar metros`);
      assert.ok(sim.platforms.length > 4, `mapa ${m} genera plataformas`);
    }
  });

  it('en modo rondas termina cuando queda un solo corredor vivo', () => {
    const sim = new GravitySim('lab', 'rondas', TWO, 42);
    sim.runners[1].y = 900; // Beto cae
    sim.step(TICK);
    assert.equal(sim.finished, true);
    assert.equal(sim.winnerId, 1);
  });
});
