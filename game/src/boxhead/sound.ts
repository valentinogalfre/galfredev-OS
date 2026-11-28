import type { WeaponId } from './protocol';

/** Sonidos arcade retro para Boxhead por Web Audio (sin archivos externos). */
export class Sound {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, f1), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  shot(w: WeaponId): void {
    if (w === 'uzi') this.tone(360, 120, 0.045, 'square', 0.08);
    else if (w === 'shotgun') this.tone(170, 48, 0.14, 'sawtooth', 0.16);
    else if (w === 'rocket') this.tone(240, 80, 0.18, 'sawtooth', 0.14);
    else if (w === 'railgun') this.tone(980, 190, 0.18, 'triangle', 0.15);
    else if (w === 'barrel' || w === 'wall' || w === 'mine') this.tone(200, 140, 0.06, 'sine', 0.09);
    else this.tone(420, 140, 0.07, 'square', 0.1);
  }

  boom(): void {
    this.tone(130, 32, 0.32, 'sawtooth', 0.2);
  }

  dash(): void {
    this.tone(280, 620, 0.09, 'triangle', 0.09);
  }

  pickup(): void {
    this.tone(520, 920, 0.12, 'triangle', 0.11);
  }

  wave(): void {
    this.tone(440, 660, 0.14, 'triangle', 0.13);
    setTimeout(() => this.tone(660, 880, 0.22, 'triangle', 0.13), 120);
  }
}
