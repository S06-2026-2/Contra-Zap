// Motor de efeitos sonoros chiptune do Contra Zap.
// Tudo sintetizado na hora (WebAudio) — nenhum arquivo de áudio, mesmo espírito
// dos sprites pixelados: ondas quadradas, envelopes curtos e ruído branco.

const NOTA = (n) => 440 * Math.pow(2, (n - 69) / 12);

export default class Som {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ativo = true;
    this.volume = 0.7;
    this.ruidoBuf = null;
  }

  acordar() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  defVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get t() {
    return this.ctx.currentTime;
  }

  // Onda simples com envelope percussivo e glissando opcional.
  tom({ f, f2, tipo = "square", dur = 0.09, vol = 0.25, atraso = 0, ataque = 0.004, detune = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo;
    o.detune.value = detune;
    const t0 = this.t + atraso;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  ruido({ dur = 0.12, vol = 0.2, atraso = 0, tipo = "highpass", f = 2000, f2 = null, q = 0.8, ataque = 0 }) {
    const ctx = this.ctx;
    if (!this.ruidoBuf) {
      const n = ctx.sampleRate * 1.2;
      this.ruidoBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = this.ruidoBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.ruidoBuf;
    src.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = tipo;
    filtro.Q.value = q;
    const g = ctx.createGain();
    const t0 = this.t + atraso;
    filtro.frequency.setValueAtTime(f, t0);
    if (f2) filtro.frequency.exponentialRampToValueAtTime(Math.max(60, f2), t0 + dur);
    if (ataque > 0) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + ataque);
    } else {
      g.gain.setValueAtTime(vol, t0);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filtro).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  arpejo(notas, { tipo = "square", passo = 0.06, dur = 0.1, vol = 0.2, atraso = 0 } = {}) {
    notas.forEach((n, i) => this.tom({ f: NOTA(n), tipo, dur, vol, atraso: atraso + i * passo }));
  }

  tocar(nome) {
    if (!this.ativo) return;
    if (!this.acordar()) return;
    const f = this["sfx_" + nome];
    if (f) f.call(this);
  }

  // ---- UI ----
  sfx_clique() {
    this.tom({ f: 720, f2: 980, dur: 0.05, vol: 0.13 });
  }
  sfx_aba() {
    this.tom({ f: 520, f2: 760, dur: 0.07, vol: 0.14 });
    this.tom({ f: 1040, dur: 0.04, vol: 0.05, atraso: 0.03 });
  }
  // Carta raspando no feltro: ruído largo (sem ressonância, senão vira zumbido),
  // com pequeno crescendo e queda, terminando num toquinho seco de apoio.
  sfx_carta() {
    this.ruido({ dur: 0.14, vol: 0.12, tipo: "lowpass", f: 5200, f2: 2200, q: 0.25, ataque: 0.05 });
    this.ruido({ dur: 0.15, vol: 0.055, tipo: "highpass", f: 1200, q: 0.25, ataque: 0.06 });
    this.ruido({ dur: 0.04, vol: 0.07, tipo: "lowpass", f: 3200, q: 0.3, atraso: 0.12 });
  }
  sfx_aposta() {
    this.arpejo([76, 83], { passo: 0.055, dur: 0.08, vol: 0.16 });
  }
  sfx_chat() {
    this.tom({ f: 880, f2: 1180, tipo: "triangle", dur: 0.06, vol: 0.12 });
  }
  sfx_tique() {
    this.tom({ f: 1200, dur: 0.04, vol: 0.1 });
  }
  sfx_tiqueFinal() {
    this.tom({ f: 1600, f2: 1200, dur: 0.12, vol: 0.16 });
  }
  sfx_erro() {
    this.tom({ f: 150, f2: 90, dur: 0.28, vol: 0.2 });
    this.tom({ f: 152, f2: 92, dur: 0.28, vol: 0.14, detune: 30 });
  }

  // ---- Rodada ----
  sfx_vaza() {
    this.arpejo([72, 76, 79, 84], { passo: 0.07, dur: 0.14, vol: 0.17 });
    this.ruido({ dur: 0.2, vol: 0.07, tipo: "highpass", f: 4000, atraso: 0.28 });
  }
  sfx_eliminado() {
    this.arpejo([69, 65, 62, 57], { tipo: "square", passo: 0.11, dur: 0.2, vol: 0.2 });
    this.tom({ f: 120, f2: 45, tipo: "triangle", dur: 0.6, vol: 0.22, atraso: 0.42 });
    this.ruido({ dur: 0.45, vol: 0.12, tipo: "lowpass", f: 900, f2: 160, atraso: 0.42 });
  }
  sfx_vitoria() {
    this.arpejo([72, 76, 79, 84, 88], { passo: 0.1, dur: 0.16, vol: 0.18 });
    this.arpejo([84, 88, 91], { tipo: "triangle", passo: 0.06, dur: 0.4, vol: 0.12, atraso: 0.52 });
  }

  // ---- Golpes de manilha ----
  sfx_espada() {
    this.ruido({ dur: 0.22, vol: 0.22, tipo: "bandpass", f: 7000, f2: 1200, q: 1.4 });
    this.tom({ f: 1800, f2: 400, dur: 0.14, vol: 0.14 });
    this.tom({ f: 2600, dur: 0.05, vol: 0.07, atraso: 0.1 });
  }
  sfx_espadaAnula() {
    this.ruido({ dur: 0.16, vol: 0.16, tipo: "bandpass", f: 6000, f2: 2000, q: 1.2 });
    this.ruido({ dur: 0.16, vol: 0.16, tipo: "bandpass", f: 6000, f2: 2000, q: 1.2, atraso: 0.06 });
    this.tom({ f: 2400, dur: 0.5, vol: 0.16, atraso: 0.34 });
    this.tom({ f: 3100, dur: 0.45, vol: 0.1, atraso: 0.35, detune: 12 });
    this.ruido({ dur: 0.3, vol: 0.2, tipo: "highpass", f: 3000, f2: 8000, atraso: 0.34 });
    this.tom({ f: 220, f2: 70, tipo: "triangle", dur: 0.3, vol: 0.2, atraso: 0.34 });
  }
  sfx_copas() {
    this.tom({ f: 220, f2: 660, tipo: "square", dur: 0.22, vol: 0.18 });
    this.arpejo([76, 83, 88], { tipo: "square", passo: 0.05, dur: 0.12, vol: 0.14, atraso: 0.14 });
    this.tom({ f: 90, f2: 50, tipo: "triangle", dur: 0.4, vol: 0.2, atraso: 0.16 });
  }
  sfx_copasAnula() {
    this.tom({ f: 300, f2: 720, dur: 0.3, vol: 0.16 });
    this.tom({ f: 300, f2: 720, dur: 0.3, vol: 0.16, detune: -25 });
    this.tom({ f: 120, f2: 40, tipo: "triangle", dur: 0.35, vol: 0.24, atraso: 0.34 });
    this.ruido({ dur: 0.3, vol: 0.16, tipo: "bandpass", f: 2600, f2: 500, q: 1.1, atraso: 0.62 });
    this.arpejo([60, 55], { tipo: "square", passo: 0.09, dur: 0.22, vol: 0.16, atraso: 0.64 });
  }
  sfx_paus() {
    this.tom({ f: 190, f2: 42, tipo: "triangle", dur: 0.3, vol: 0.3, atraso: 0.3 });
    this.ruido({ dur: 0.22, vol: 0.24, tipo: "lowpass", f: 1400, f2: 180, atraso: 0.3 });
    this.tom({ f: 620, f2: 180, tipo: "square", dur: 0.08, vol: 0.12, atraso: 0.3 });
    this.ruido({ dur: 0.14, vol: 0.06, tipo: "highpass", f: 3000, atraso: 0.06 });
  }
  sfx_pausAnula() {
    this.ruido({ dur: 0.1, vol: 0.1, tipo: "lowpass", f: 2000, atraso: 0.12 });
    this.tom({ f: 160, f2: 36, tipo: "triangle", dur: 0.4, vol: 0.32, atraso: 0.36 });
    this.tom({ f: 165, f2: 38, tipo: "square", dur: 0.16, vol: 0.16, atraso: 0.36 });
    this.ruido({ dur: 0.35, vol: 0.26, tipo: "lowpass", f: 1600, f2: 120, atraso: 0.36 });
    this.tom({ f: 480, f2: 120, dur: 0.14, vol: 0.12, atraso: 0.5 });
  }
  sfx_ouros() {
    this.arpejo([84, 88, 91, 96], { tipo: "square", passo: 0.045, dur: 0.1, vol: 0.13 });
    this.ruido({ dur: 0.3, vol: 0.09, tipo: "highpass", f: 6000, atraso: 0.16 });
    this.tom({ f: 1320, dur: 0.3, vol: 0.09, atraso: 0.2 });
  }
  sfx_ourosAnula() {
    this.arpejo([84, 91], { passo: 0.06, dur: 0.14, vol: 0.13 });
    this.tom({ f: 2800, dur: 0.1, vol: 0.14, atraso: 0.34 });
    this.ruido({ dur: 0.35, vol: 0.2, tipo: "highpass", f: 7000, f2: 2000, atraso: 0.34 });
    [0, 0.07, 0.13, 0.2].forEach((a, i) =>
      this.tom({ f: 2400 - i * 400, f2: 900 - i * 200, dur: 0.09, vol: 0.1, atraso: 0.4 + a })
    );
  }
  // Duelo ♠ sobre ♦: lâmina cortando o ar, estalo do cristal partindo e cacos.
  sfx_duelo_espada_ouros() {
    this.tom({ f: 1500, dur: 0.3, vol: 0.07, atraso: 0.06 });
    this.ruido({ dur: 0.34, vol: 0.2, tipo: "bandpass", f: 7800, f2: 1400, q: 1.3, atraso: 0.18 });
    this.tom({ f: 2400, f2: 520, dur: 0.16, vol: 0.14, atraso: 0.38 });
    this.tom({ f: 3200, dur: 0.09, vol: 0.16, atraso: 0.5 });
    this.ruido({ dur: 0.1, vol: 0.22, tipo: "highpass", f: 4200, f2: 9000, atraso: 0.5 });
    this.tom({ f: 170, f2: 55, tipo: "triangle", dur: 0.3, vol: 0.2, atraso: 0.5 });
    [0, 0.06, 0.11, 0.17, 0.24].forEach((a, i) =>
      this.tom({ f: 2600 - i * 380, f2: 1100 - i * 160, dur: 0.08, vol: 0.09, atraso: 0.56 + a })
    );
  }

  // ♥ sobre ♦: pulso grave crescendo e a onda desintegrando o cristal.
  sfx_duelo_copas_ouros() {
    this.tom({ f: 160, f2: 480, tipo: "square", dur: 0.34, vol: 0.18 });
    this.arpejo([71, 78, 83], { passo: 0.05, dur: 0.11, vol: 0.12, atraso: 0.16 });
    this.tom({ f: 70, f2: 40, tipo: "triangle", dur: 0.45, vol: 0.24, atraso: 0.4 });
    this.ruido({ dur: 0.4, vol: 0.2, tipo: "highpass", f: 1800, f2: 7000, atraso: 0.4 });
    [0, 0.05, 0.1, 0.16, 0.22].forEach((a, i) =>
      this.tom({ f: 2200 - i * 320, f2: 900, dur: 0.07, vol: 0.08, atraso: 0.48 + a })
    );
  }

  // ♥ sobre ♠: a lâmina é travada no ar e estala ao partir.
  sfx_duelo_copas_espada() {
    this.ruido({ dur: 0.3, vol: 0.16, tipo: "bandpass", f: 6500, f2: 2200, q: 1.2 });
    this.tom({ f: 900, f2: 300, dur: 0.16, vol: 0.1, atraso: 0.3 });
    this.tom({ f: 200, f2: 560, tipo: "square", dur: 0.3, vol: 0.16, atraso: 0.26 });
    this.tom({ f: 2900, dur: 0.12, vol: 0.18, atraso: 0.56 });
    this.ruido({ dur: 0.16, vol: 0.22, tipo: "highpass", f: 3600, f2: 8000, atraso: 0.56 });
    this.tom({ f: 150, f2: 48, tipo: "triangle", dur: 0.38, vol: 0.22, atraso: 0.56 });
    this.arpejo([64, 59], { tipo: "square", passo: 0.1, dur: 0.2, vol: 0.12, atraso: 0.68 });
  }

  // ♣ sobre ♦: madeira descendo, impacto seco e cristal estourando.
  sfx_duelo_paus_ouros() {
    this.ruido({ dur: 0.18, vol: 0.07, tipo: "lowpass", f: 1800, atraso: 0.18 });
    this.tom({ f: 175, f2: 38, tipo: "triangle", dur: 0.36, vol: 0.32, atraso: 0.47 });
    this.ruido({ dur: 0.26, vol: 0.24, tipo: "lowpass", f: 1500, f2: 150, atraso: 0.47 });
    this.tom({ f: 2800, dur: 0.1, vol: 0.16, atraso: 0.49 });
    this.ruido({ dur: 0.3, vol: 0.18, tipo: "highpass", f: 4000, f2: 9000, atraso: 0.5 });
    [0, 0.07, 0.13, 0.2].forEach((a, i) =>
      this.tom({ f: 2500 - i * 400, f2: 1000 - i * 180, dur: 0.08, vol: 0.09, atraso: 0.62 + a })
    );
  }

  // ♣ sobre ♠: pancada lateral e a espada girando pelo ar.
  sfx_duelo_paus_espada() {
    this.ruido({ dur: 0.22, vol: 0.08, tipo: "lowpass", f: 2200, atraso: 0.2 });
    this.tom({ f: 210, f2: 52, tipo: "triangle", dur: 0.3, vol: 0.3, atraso: 0.52 });
    this.tom({ f: 3100, dur: 0.5, vol: 0.14, atraso: 0.52 });
    this.tom({ f: 3700, dur: 0.45, vol: 0.08, atraso: 0.53, detune: 15 });
    this.ruido({ dur: 0.24, vol: 0.2, tipo: "bandpass", f: 5000, f2: 1500, q: 1.1, atraso: 0.52 });
    [0, 0.11, 0.22, 0.33].forEach((a) =>
      this.ruido({ dur: 0.09, vol: 0.07, tipo: "bandpass", f: 6000, f2: 3000, q: 1.4, atraso: 0.62 + a })
    );
  }

  // ♣ sobre ♥: pancada abafada, o coração achata e racha.
  sfx_duelo_paus_copas() {
    this.ruido({ dur: 0.18, vol: 0.07, tipo: "lowpass", f: 1600, atraso: 0.18 });
    this.tom({ f: 150, f2: 34, tipo: "triangle", dur: 0.42, vol: 0.34, atraso: 0.47 });
    this.ruido({ dur: 0.3, vol: 0.22, tipo: "lowpass", f: 1100, f2: 130, atraso: 0.47 });
    this.tom({ f: 420, f2: 110, tipo: "square", dur: 0.14, vol: 0.12, atraso: 0.47 });
    this.ruido({ dur: 0.2, vol: 0.14, tipo: "bandpass", f: 2400, f2: 600, q: 1.1, atraso: 0.66 });
    this.arpejo([57, 52], { tipo: "square", passo: 0.1, dur: 0.24, vol: 0.14, atraso: 0.68 });
  }

  sfx_supera() {
    this.tom({ f: 1400, f2: 260, dur: 0.12, vol: 0.16 });
    this.ruido({ dur: 0.14, vol: 0.14, tipo: "highpass", f: 5000, f2: 1200 });
  }
}
