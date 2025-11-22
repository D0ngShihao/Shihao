
class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private nextNoteTime: number = 0;
  private timerID: number | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;
  private beatCount: number = 0;
  private isEmergency: boolean = false;

  init() {
    if (this.isInitialized) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3; 
    this.masterGain.connect(this.ctx.destination);
    this.isInitialized = true;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : 0.3,
        this.ctx.currentTime,
        0.1
      );
    }
    return this.isMuted;
  }

  setEmergencyMode(enabled: boolean) {
    this.isEmergency = enabled;
  }

  startBGM() {
    if (!this.ctx || !this.masterGain) this.init();
    if (this.timerID) return;

    this.beatCount = 0;
    this.nextNoteTime = this.ctx!.currentTime;
    this.scheduler();
  }

  stopBGM() {
    if (this.timerID) {
      window.clearTimeout(this.timerID);
      this.timerID = null;
    }
    this.isEmergency = false;
  }

  private scheduler() {
    // Lookahead: 0.1s
    while (this.nextNoteTime < this.ctx!.currentTime + 0.1) {
        this.playStep(this.beatCount, this.nextNoteTime);
        this.advanceNote();
    }
    this.timerID = window.setTimeout(() => this.scheduler(), 25);
  }

  private advanceNote() {
      // Dynamic BPM: 140 normally, 175 in emergency
      const bpm = this.isEmergency ? 175 : 140;
      const secondsPerBeat = 60.0 / bpm;
      const stepTime = secondsPerBeat / 2; // Eighth notes
      this.nextNoteTime += stepTime;
      this.beatCount++;
  }

  private playStep(totalBeat: number, time: number) {
      if (!this.ctx || !this.masterGain) return;
      const step = totalBeat % 32; // 4 bars of 8 steps

      // --- Rhythm (Kick / Hi-hat simulation) ---
      if (step % 4 === 0) {
        // Kick on beats
        this.playDrum('kick', time);
      } else if (step % 4 === 2) {
        // Snare/Hat off-beat
        this.playDrum('snare', time);
      }

      // --- Bassline (Simple Walking) ---
      // Progression: C (0-7), G (8-15), Am (16-23), F (24-31)
      let bassFreq = 0;
      if (step < 8) bassFreq = (step % 2 === 0) ? 130.81 : 196.00; // C3 - G3
      else if (step < 16) bassFreq = (step % 2 === 0) ? 98.00 : 146.83; // G2 - D3
      else if (step < 24) bassFreq = (step % 2 === 0) ? 110.00 : 164.81; // A2 - E3
      else bassFreq = (step % 2 === 0) ? 87.31 : 130.81; // F2 - C3

      if (bassFreq > 0) {
        this.playTone('triangle', bassFreq, time, 0.1, 0.15);
      }

      // --- Melody (Staccato & Cheerful) ---
      // Simple pentatonic improvisation pattern
      const melodyMap: {[key: number]: number} = {
         0: 523.25, 2: 659.25, 4: 783.99, 5: 659.25, // C E G E
         8: 392.00, 10: 493.88, 12: 587.33, 14: 392.00, // G B D G
         16: 440.00, 18: 523.25, 20: 659.25, 22: 523.25, // A C E C
         24: 349.23, 26: 440.00, 28: 523.25, 30: 698.46  // F A C F
      };
      
      if (melodyMap[step]) {
         // Add some variation
         const freq = melodyMap[step];
         this.playTone('square', freq, time, 0.08, 0.05); // Very short staccato
      }
  }

  private playDrum(type: 'kick' | 'snare', time: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    if (type === 'kick') {
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        gain.gain.setValueAtTime(0.4, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, time);
        gain.gain.setValueAtTime(0.05, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.5);
  }

  private playTone(type: OscillatorType, freq: number, time: number, duration: number, vol: number) {
     if (!this.ctx || !this.masterGain) return;
     const osc = this.ctx.createOscillator();
     const gain = this.ctx.createGain();
     osc.type = type;
     osc.frequency.value = freq;
     
     gain.gain.setValueAtTime(vol, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
     
     osc.connect(gain);
     gain.connect(this.masterGain);
     osc.start(time);
     osc.stop(time + duration);
  }

  playJump() {
    if (!this.ctx) return;
    this.playTone('square', 150, this.ctx.currentTime, 0.3, 0.1);
  }

  playCheer() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playApplause() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const duration = 1.0;
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.2));
      }
      
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      noise.connect(gain);
      gain.connect(this.masterGain!);
      noise.start(now);
      this.playCheer();
  }

  playCrash() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone('sawtooth', 100, now, 0.4, 0.3);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  playPowerUp(type: 'fish' | 'sunglasses') {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (type === 'fish') {
        this.playTone('sine', 600, now, 0.05, 0.2);
        this.playTone('sine', 400, now + 0.05, 0.05, 0.2);
    } else {
        this.playTone('sine', 523.25, now, 0.1, 0.1);
        this.playTone('sine', 659.25, now + 0.1, 0.1, 0.1);
        this.playTone('sine', 783.99, now + 0.2, 0.4, 0.1);
    }
  }

  playSizzle() {
     if (!this.ctx) return;
     const bufferSize = this.ctx.sampleRate * 0.2;
     const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
     const data = buffer.getChannelData(0);
     for (let i = 0; i < bufferSize; i++) {
       data[i] = Math.random() * 2 - 1;
     }
     const noise = this.ctx.createBufferSource();
     noise.buffer = buffer;
     const gain = this.ctx.createGain();
     gain.gain.value = 0.1;
     noise.connect(gain);
     gain.connect(this.masterGain!);
     noise.start();
  }

  playDelivery() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.playTone('square', 1200, now, 0.1, 0.1);
      this.playTone('square', 1200, now + 0.15, 0.2, 0.1);
  }
}

export const audioService = new AudioService();
