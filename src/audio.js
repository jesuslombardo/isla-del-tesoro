// Audio del juego, 100% sintetizado con Web Audio API (sin archivos externos).
// Ambiente de isla (mar/viento + pajaritos), pasos, y sonido de abrir el cofre.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._on = false;
    this._noise = null;
    this._birdTimer = null;
  }

  // Debe llamarse desde un gesto del usuario (click en "Explorar").
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this._noise = this._makeNoise(2.0);
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _makeNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startAmbient() {
    if (!this.ctx || this._on) return;
    this._on = true;

    // Base grave de mar/viento
    const sea = this.ctx.createBufferSource();
    sea.buffer = this._noise; sea.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const seaG = this.ctx.createGain(); seaG.gain.value = 0.10;
    sea.connect(lp); lp.connect(seaG); seaG.connect(this.master); sea.start();

    // Capa de olas (bandpass con vaivén lento)
    const waves = this.ctx.createBufferSource();
    waves.buffer = this._noise; waves.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    const wavesG = this.ctx.createGain(); wavesG.gain.value = 0.03;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.028;
    lfo.connect(lfoG); lfoG.connect(wavesG.gain);
    waves.connect(bp); bp.connect(wavesG); wavesG.connect(this.master);
    waves.start(); lfo.start();

    this._scheduleBird();
  }

  _scheduleBird() {
    const delay = 2500 + Math.random() * 5500;
    this._birdTimer = setTimeout(() => { this.bird(); this._scheduleBird(); }, delay);
  }

  // Canto de pajarito: 2-4 notas agudas con vibrato rápido.
  bird() {
    if (!this.ctx || this.muted) return;
    const notes = 2 + Math.floor(Math.random() * 3);
    let start = this.ctx.currentTime + 0.02;
    for (let i = 0; i < notes; i++) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      const base = 2200 + Math.random() * 1600;
      o.frequency.setValueAtTime(base, start);
      o.frequency.exponentialRampToValueAtTime(base * 1.5, start + 0.07);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.05, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      o.connect(g); g.connect(this.master);
      o.start(start); o.stop(start + 0.16);
      start += 0.11 + Math.random() * 0.06;
    }
  }

  // Paso: golpe corto de ruido filtrado.
  footstep() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 320 + Math.random() * 140; bp.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.4, 0.13); src.stop(t + 0.13);
  }

  // Abrir cofre: crujido de madera + campanita de recompensa.
  chestOpen() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    // Crujido: diente de sierra que baja
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.35);
    const olp = this.ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 900;
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(olp); olp.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.45);
    // Campanita: 3 notas que suben
    [660, 880, 1320].forEach((f, i) => {
      const st = t + 0.32 + i * 0.1;
      const s = this.ctx.createOscillator(); s.type = 'sine'; s.frequency.value = f;
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.0001, st);
      sg.gain.exponentialRampToValueAtTime(0.1, st + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, st + 0.4);
      s.connect(sg); sg.connect(this.master); s.start(st); s.stop(st + 0.42);
    });
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }
}
