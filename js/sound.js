'use strict';
const Sound = {
  ac: null, muted: false, musicOff: false, _musicTimer: null, _nextNote: 0, _degree: 4,

  ensure() {
    if (!this.ac) {
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
      if (this.ac && !this.musicOff) this.startMusic();
    }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },

  // ---- generative ambient music: slow pentatonic wander over a soft drone ----
  SCALE: [220, 246.9, 293.7, 329.6, 392, 440, 493.9, 587.3, 659.3], // A minor pentatonic-ish, 2 octaves

  startMusic() {
    if (this._musicTimer || !this.ac) return;
    this.musicOff = false;
    this._nextNote = this.ac.currentTime + 0.3;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 400);
  },

  stopMusic() {
    this.musicOff = true;
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  },

  _scheduleMusic() {
    if (!this.ac || this.muted) return;
    const ahead = this.ac.currentTime + 1.2;
    while (this._nextNote < ahead) {
      const t = this._nextNote;
      // melody: random walk on the scale, occasional rests
      if (Math.random() < 0.78) {
        this._degree += [-2, -1, -1, 0, 1, 1, 2][Math.random() * 7 | 0];
        this._degree = Math.max(0, Math.min(this.SCALE.length - 1, this._degree));
        this._note(this.SCALE[this._degree], t, 0.9, 'triangle', 0.035);
        if (Math.random() < 0.25) this._note(this.SCALE[Math.max(0, this._degree - 2)], t + 0.05, 0.7, 'sine', 0.02);
      }
      // bass drone every 4th note
      if (Math.random() < 0.3) this._note(this.SCALE[0] / 2, t, 2.4, 'sine', 0.03);
      this._nextNote += 0.75 + (Math.random() < 0.3 ? 0.75 : 0);
    }
  },

  _note(freq, when, len, type, vol) {
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);
    o.connect(g); g.connect(this.ac.destination);
    o.start(when); o.stop(when + len + 0.05);
  },

  // [freq, startOffset, length]
  SEQS: {
    success: [[440, 0, 0.08], [660, 0.09, 0.12]],
    fail:    [[220, 0, 0.15]],
    hit:     [[110, 0, 0.1]],
    miss:    [[75, 0, 0.06]],
    eat:     [[330, 0, 0.05], [220, 0.06, 0.09]],
    coins:   [[880, 0, 0.05], [1100, 0.06, 0.05], [1320, 0.12, 0.09]],
    levelup: [[523, 0, 0.12], [659, 0.13, 0.12], [784, 0.26, 0.22]],
    climb:   [[300, 0, 0.09], [220, 0.1, 0.09], [160, 0.2, 0.12]],
    cast:    [[700, 0, 0.06], [520, 0.07, 0.13]],
    fire:    [[150, 0, 0.2], [180, 0.1, 0.15]],
    pray:    [[392, 0, 0.15], [523, 0.16, 0.2]]
  },

  play(name) {
    if (this.muted) return;
    this.ensure();
    if (!this.ac) return;
    const t = this.ac.currentTime;
    for (const [f, off, len] of (this.SEQS[name] || [])) this.beep(f, t + off, len);
  },

  beep(freq, when, len) {
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.05, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + len);
    o.connect(g); g.connect(this.ac.destination);
    o.start(when); o.stop(when + len);
  }
};
