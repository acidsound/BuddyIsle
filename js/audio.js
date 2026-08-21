// Procedural WebAudio: chunky, stylized SFX + ambient bed. No assets.
export function createAudio() {
  let ctx = null, master = null, windGain = null, windSrc = null, muted = false;
  let ambTimer = 0, lastBird = 0;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    startWind();
  }

  function startWind() {
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf; windSrc.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 320;
    windGain = ctx.createGain(); windGain.gain.value = 0.05;
    windSrc.connect(filt); filt.connect(windGain); windGain.connect(master);
    windSrc.start();
  }

  function noiseBurst({ dur = 0.15, freq = 800, q = 1, vol = 0.4, type = 'bandpass', sweep = 0 }) {
    if (!ctx) return;
    const n = Math.max(1, Math.floor(dur * ctx.sampleRate));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) {
      f.frequency.setValueAtTime(freq, ctx.currentTime);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), ctx.currentTime + dur);
    }
    const g = ctx.createGain(); g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  function tone({ f0 = 200, f1 = null, dur = 0.2, vol = 0.3, type = 'sine', delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  const sfx = {
    footstep(surface) {
      const f = surface === 'water' ? 500 : surface === 'sand' ? 900 : 650;
      noiseBurst({ dur: 0.07, freq: f, q: 0.8, vol: 0.16, type: 'lowpass' });
    },
    swing() { noiseBurst({ dur: 0.18, freq: 500, q: 0.6, vol: 0.25, sweep: 900 }); },
    hitDino() { noiseBurst({ dur: 0.1, freq: 300, q: 0.7, vol: 0.5, type: 'lowpass' }); tone({ f0: 110, f1: 55, dur: 0.12, vol: 0.35 }); },
    chop() { noiseBurst({ dur: 0.09, freq: 420, q: 1.2, vol: 0.4 }); tone({ f0: 180, f1: 90, dur: 0.08, vol: 0.3, type: 'triangle' }); },
    mine() { noiseBurst({ dur: 0.08, freq: 1400, q: 2, vol: 0.3 }); tone({ f0: 320, f1: 180, dur: 0.06, vol: 0.2, type: 'square' }); },
    pick() { noiseBurst({ dur: 0.06, freq: 900, q: 1, vol: 0.25, type: 'highpass' }); },
    breakNode() { noiseBurst({ dur: 0.25, freq: 250, q: 0.5, vol: 0.5, type: 'lowpass', sweep: -180 }); tone({ f0: 90, f1: 45, dur: 0.2, vol: 0.4 }); },
    throwFood() { noiseBurst({ dur: 0.12, freq: 700, q: 0.8, vol: 0.2, sweep: 500 }); },
    eat() { for (let i = 0; i < 3; i++) noiseBurst({ dur: 0.05, freq: 500 + i * 120, q: 1, vol: 0.22, type: 'lowpass' }); },
    craft() { tone({ f0: 520, dur: 0.06, vol: 0.2, type: 'triangle' }); tone({ f0: 780, dur: 0.08, vol: 0.2, type: 'triangle', delay: 0.07 }); },
    place() { tone({ f0: 140, f1: 70, dur: 0.12, vol: 0.4 }); noiseBurst({ dur: 0.08, freq: 350, q: 0.6, vol: 0.3, type: 'lowpass' }); },
    hurt() { tone({ f0: 90, f1: 40, dur: 0.25, vol: 0.5 }); noiseBurst({ dur: 0.15, freq: 200, q: 0.5, vol: 0.35, type: 'lowpass' }); },
    heal() { tone({ f0: 440, dur: 0.1, vol: 0.15 }); tone({ f0: 660, dur: 0.14, vol: 0.15, delay: 0.08 }); },
    tame() { [523, 659, 784, 1047].forEach((f, i) => tone({ f0: f, dur: 0.16, vol: 0.22, type: 'triangle', delay: i * 0.09 })); },
    heart() { tone({ f0: 880, dur: 0.08, vol: 0.12, type: 'sine' }); },
    roar(kind) {
      if (kind === 'trex') {
        tone({ f0: 70, f1: 38, dur: 1.1, vol: 0.65, type: 'sawtooth' });
        noiseBurst({ dur: 1.0, freq: 180, q: 0.4, vol: 0.4, type: 'lowpass', sweep: -100 });
      } else if (kind === 'raptor') {
        tone({ f0: 620, f1: 980, dur: 0.12, vol: 0.2, type: 'square' });
        tone({ f0: 700, f1: 1100, dur: 0.1, vol: 0.18, type: 'square', delay: 0.14 });
      } else {
        tone({ f0: 58, f1: 44, dur: 0.9, vol: 0.4 });
        noiseBurst({ dur: 0.8, freq: 120, q: 0.3, vol: 0.2, type: 'lowpass' });
      }
    },
    splash() { noiseBurst({ dur: 0.25, freq: 900, q: 0.4, vol: 0.3, type: 'lowpass', sweep: -500 }); },
    cook() { noiseBurst({ dur: 0.5, freq: 2500, q: 0.3, vol: 0.15, type: 'highpass' }); },
    death() { tone({ f0: 220, f1: 40, dur: 1.4, vol: 0.5, type: 'sawtooth' }); noiseBurst({ dur: 1.2, freq: 200, q: 0.4, vol: 0.4, type: 'lowpass', sweep: -150 }); },
    bird() { tone({ f0: 1800 + Math.random() * 600, f1: 2400, dur: 0.09, vol: 0.05 }); },
    cricket() { tone({ f0: 4200, dur: 0.03, vol: 0.03, type: 'square' }); },
  };

  function update(dt, env) {
    if (!ctx) return;
    ambTimer -= dt;
    if (ambTimer > 0) return;
    ambTimer = 0.5;
    const night = env.night;
    const target = 0.03 + (env.highland ? 0.05 : 0) + night * 0.02;
    windGain.gain.value += (target - windGain.gain.value) * 0.3;
    const now = performance.now();
    if (night < 0.5 && env.jungle && now - lastBird > 4000 && Math.random() < 0.5) {
      lastBird = now; sfx.bird();
    }
    if (night > 0.6 && (env.jungle || env.plains) && Math.random() < 0.8) {
      sfx.cricket(); if (Math.random() < 0.4) sfx.cricket();
    }
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.55;
    return muted;
  }

  return { init, sfx, update, toggleMute, get muted() { return muted; } };
}
