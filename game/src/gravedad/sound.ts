/** Efectos sintéticos livianos por Web Audio (sin archivos externos). */
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

  private tone(freq0: number, freq1: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq1), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  flip(dir: 1 | -1): void {
    this.tone(dir === -1 ? 260 : 520, dir === -1 ? 580 : 210, 0.09, 'triangle', 0.14);
  }

  land(): void {
    this.tone(130, 58, 0.05, 'sine', 0.08);
  }

  power(): void {
    this.tone(440, 880, 0.14, 'triangle', 0.14);
  }

  pulse(): void {
    this.tone(180, 48, 0.24, 'sawtooth', 0.16);
  }

  shield(): void {
    this.tone(520, 980, 0.18, 'sine', 0.16);
  }

  die(): void {
    this.tone(240, 62, 0.22, 'sawtooth', 0.14);
  }

  beep(high: boolean): void {
    this.tone(high ? 880 : 440, high ? 880 : 440, high ? 0.18 : 0.09, 'sine', 0.14);
  }

  win(): void {
    this.tone(523, 784, 0.14, 'triangle', 0.14);
    setTimeout(() => this.tone(659, 1046, 0.22, 'triangle', 0.14), 110);
  }
}
