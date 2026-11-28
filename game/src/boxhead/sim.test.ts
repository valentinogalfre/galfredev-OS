import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BoxheadSim, buildArenaWalls, TICK, type PlayerSeed } from './sim.ts';
import type { ArenaId } from './protocol.ts';

const TWO: PlayerSeed[] = [
  { id: 1, name: 'Ana', color: 0x2e8bff },
  { id: 2, name: 'Beto', color: 0xe63946 },
];

describe('Boxhead — simulación', () => {
  it('apunta hacia donde camina el jugador y dispara en esa dirección', () => {
    const sim = new BoxheadSim('plaza', 'coop', false, TWO, 10);
    sim.setInput(1, 0, -1, true, false, false);
    sim.step(TICK);
    const p = sim.players[0];
    assert.ok(p.aimY < -0.9, 'mira hacia arriba al moverse hacia arriba');
    assert.ok(sim.projectiles.length >= 1, 'disparó un proyectil');
    assert.ok(sim.projectiles[0].vy < -400, 'la bala viaja hacia arriba');
  });

  it('el auto-apuntado delantero corrige un ángulo chico pero nunca gira hacia atrás', () => {
    const sim = new BoxheadSim('plaza', 'coop', false, [TWO[0]], 10);
    const p = sim.players[0];
    p.x = 500;
    p.y = 360;
    // Zombie detrás del jugador (izquierda) y zombie ligeramente arriba a la derecha.
    sim.enemies = [
      { id: 100, kind: 'zombie', x: 420, y: 360, vx: 0, vy: 0, r: 15, hp: 50, maxHp: 50, speed: 0, damage: 10, atkCd: 1, hitFlash: 0, aimX: 1, aimY: 0 },
      { id: 101, kind: 'zombie', x: 640, y: 340, vx: 0, vy: 0, r: 15, hp: 50, maxHp: 50, speed: 0, damage: 10, atkCd: 1, hitFlash: 0, aimX: -1, aimY: 0 },
    ];
    sim.setInput(1, 1, 0, true, false, false);
    sim.step(TICK);
    const b = sim.projectiles[0];
    assert.ok(b.vx > 0, 'nunca dispara hacia atrás');
    assert.ok(b.vy < 0, 'ajusta levemente hacia el zombie dentro del cono delantero');
  });

  it('matar zombies suma puntaje y sube el multiplicador de combo', () => {
    const sim = new BoxheadSim('plaza', 'coop', false, [TWO[0]], 10);
    const p = sim.players[0];
    p.x = 500;
    p.y = 360;
    sim.enemies = [
      { id: 100, kind: 'zombie', x: 560, y: 360, vx: 0, vy: 0, r: 15, hp: 20, maxHp: 50, speed: 0, damage: 10, atkCd: 1, hitFlash: 0, aimX: -1, aimY: 0 },
    ];
    sim.setInput(1, 1, 0, true, false, false);
    for (let i = 0; i < 15; i++) sim.step(TICK);
    assert.equal(sim.enemies.length, 0, 'el zombie muere');
    assert.equal(p.kills, 1);
    assert.ok(p.score > 0);
    assert.equal(sim.combo, 1);
  });

  it('explotar un barril detona en cadena otros barriles cercanos y mata zombies', () => {
    const sim = new BoxheadSim('plaza', 'coop', false, [TWO[0]], 10);
    sim.props = [
      { id: 200, kind: 'barrel', ownerId: 1, x: 520, y: 360, hp: 20, maxHp: 25, fireCd: 0, aimX: 1, aimY: 0 },
      { id: 201, kind: 'barrel', ownerId: 1, x: 590, y: 360, hp: 25, maxHp: 25, fireCd: 0, aimX: 1, aimY: 0 },
    ];
    sim.enemies = [
      { id: 300, kind: 'zombie', x: 650, y: 360, vx: 0, vy: 0, r: 15, hp: 60, maxHp: 60, speed: 0, damage: 10, atkCd: 1, hitFlash: 0, aimX: -1, aimY: 0 },
    ];
    sim.explode(520, 360, 125, 150, 1);
    assert.equal(sim.props.length, 0, 'el segundo barril detonó en cadena');
    assert.equal(sim.enemies.length, 0, 'la explosión en cadena mató al zombie');
  });

  it('dash da impulso y protege de daño durante el esquive', () => {
    const sim = new BoxheadSim('plaza', 'coop', false, [TWO[0]], 10);
    const p = sim.players[0];
    const x0 = p.x;
    sim.setInput(1, 1, 0, false, true, false);
    sim.step(TICK);
    assert.ok(p.dashT > 0);
    assert.ok(p.x > x0 + 6, 'el dash empuja más rápido');
    // Un proyectil enemigo no daña durante el dash.
    sim.projectiles.push({
      id: 900, ownerId: -1, x: p.x, y: p.y, vx: 0, vy: 0, damage: 40, r: 10,
      life: 1, blast: 0, pierce: false, bounces: 0, grenade: false, enemyShot: true, color: '#f00', hitIds: [],
    });
    sim.step(TICK);
    assert.equal(p.hp, 100, 'inmune durante el dash');
  });

  it('un compañero cercano reanima a un jugador caído', () => {
    const sim = new BoxheadSim('plaza', 'coop', false, TWO, 10);
    const a = sim.players[0];
    const b = sim.players[1];
    a.x = 600; a.y = 360; a.downed = true; a.hp = 0; a.bleedT = 10;
    b.x = 620; b.y = 360;
    for (let i = 0; i < 110; i++) sim.step(TICK);
    assert.equal(a.downed, false, 'Ana fue reanimada');
    assert.ok(a.hp >= 50);
  });

  it('limpiar la oleada abre elección de mejoras y elegir torreta la planta en el mapa', () => {
    const sim = new BoxheadSim('plaza', 'coop', false, [TWO[0]], 10);
    sim.enemies = [];
    // Fuerza que no falten spawns agotando el contador interno con un paso de oleada vacía:
    sim.preparePerks();
    sim.players[0].perkChoices = ['torreta', 'cadencia', 'rebote'];
    const beforeProps = sim.props.length;
    assert.equal(sim.pickPerk(1, 'torreta'), true);
    assert.equal(sim.props.length, beforeProps + 1);
    assert.equal(sim.props[sim.props.length - 1].kind, 'turret');
  });

  it('las tres arenas tienen paredes válidas', () => {
    const arenas: ArenaId[] = ['plaza', 'laberinto', 'estacion'];
    for (const a of arenas) {
      assert.ok(buildArenaWalls(a).length >= 12, `arena ${a} armada`);
    }
  });
});
