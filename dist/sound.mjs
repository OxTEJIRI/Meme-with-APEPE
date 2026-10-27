// Try music on opening; resume from a real gesture when autoplay is blocked.
export function createGameSound(onStatus = () => {}, onMusicStatus = () => {}) {
  let enabled = true, context, buffer, loading, voice, generation = 0;
  let musicEnabled = true, musicBuffer, musicLoading, musicSource, musicGain, musicOffset = 0, musicStarted = 0;
  let started = false, hidden = false;
  const effects = new Set();
  try { enabled = localStorage.getItem('apepe-sound-v1') !== 'off'; } catch { /* Optional preference. */ }
  try { musicEnabled = localStorage.getItem('apepe-music-v1') !== 'off'; } catch { /* Optional preference. */ }
  function musicVolume(duck = false) {
    if (!musicGain) return;
    musicGain.gain.cancelScheduledValues(context.currentTime);
    musicGain.gain.setTargetAtTime(duck ? .035 : .24, context.currentTime, duck ? .08 : .35);
  }
  function pauseMusic() {
    if (!musicSource) return;
    musicOffset = (musicOffset + context.currentTime - musicStarted) % musicBuffer.duration;
    musicSource.stop(); musicSource.disconnect(); musicSource = null;
  }
  function syncMusic() {
    if (!enabled || !musicEnabled || hidden) {
      pauseMusic(); onMusicStatus(hidden ? 'paused' : 'muted'); return;
    }
    if (!started) { onMusicStatus('waiting'); return; }
    if (context?.state !== 'running') { onMusicStatus('blocked'); return; }
    if (!musicBuffer) { onMusicStatus('loading'); return; }
    if (!musicSource) {
      musicGain ||= context.createGain(); musicGain.disconnect(); musicGain.connect(context.destination);
      musicGain.gain.value = 0; musicVolume(Boolean(voice));
      musicSource = context.createBufferSource(); musicSource.buffer = musicBuffer; musicSource.loop = true;
      musicSource.connect(musicGain); musicStarted = context.currentTime; musicSource.start(0, musicOffset);
    }
    onMusicStatus('playing');
  }
  async function prepareMusic() {
    if (!enabled || !musicEnabled || !context) return;
    try {
      if (!musicBuffer && !musicLoading) {
        onMusicStatus(context.state === 'running' ? 'loading' : 'blocked');
        musicLoading = fetch(new URL('./assets/audio/neon-lily.mp3', import.meta.url))
          .then(response => { if (!response.ok) throw new Error('Music could not load'); return response.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes)).then(decoded => { musicBuffer = decoded; })
          .finally(() => { musicLoading = null; });
      }
      await musicLoading; syncMusic();
    } catch { onMusicStatus('unavailable'); }
  }
  async function prime() {
    if (!enabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio is unavailable');
      if (!context) { context = new AudioContext(); context.onstatechange = syncMusic; }
      started = true;
      // Invoke resume synchronously: subsequent taps can unlock a blocked context.
      const resumed = context.resume();
      // Load even while resume is waiting for permission, so a tap can start promptly.
      void prepareMusic(); syncMusic();
      void resumed.then(syncMusic).catch(() => onMusicStatus(hidden ? 'paused' : 'blocked'));
      if (!buffer && !loading) {
        loading = fetch(new URL('./assets/audio/victory-voice.mp3', import.meta.url))
          .then(response => { if (!response.ok) throw new Error('Voice could not load'); return response.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes)).then(decoded => { buffer = decoded; })
          .finally(() => { loading = null; });
      }
      await Promise.all([resumed, loading]);
      onStatus(enabled ? 'ready' : 'muted');
    } catch { onStatus('unavailable'); }
  }
  function stop() { generation++; if (voice) { voice.stop(); voice = null; } musicVolume(); }
  function stopEffects() {
    for (const effect of effects) { effect.oscillator.stop(); effect.oscillator.disconnect(); effect.gain.disconnect(); }
    effects.clear();
  }
  function startOnOpen() {
    started = true;
    if (enabled && musicEnabled && !hidden) void prime();
    else syncMusic();
  }
  function setEnabled(value) {
    enabled = Boolean(value);
    try { localStorage.setItem('apepe-sound-v1', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (!enabled) { stop(); stopEffects(); syncMusic(); onStatus('muted'); }
    else void prime();
    return enabled;
  }
  function setMusicEnabled(value) {
    musicEnabled = Boolean(value);
    try { localStorage.setItem('apepe-music-v1', musicEnabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (musicEnabled) void prime();
    else syncMusic();
  }
  function setHidden(value) {
    hidden = Boolean(value);
    if (hidden) { stop(); stopEffects(); syncMusic(); if (context) void context.suspend().catch(() => {}); }
    else if (started && enabled) void prime();
  }
  function cue(kind) {
    if (!enabled || hidden) return;
    if (!context && kind === 'button') void prime();
    if (context?.state !== 'running') {
      // The first button can unlock audio without waiting for either MP3 to load.
      if (context && kind === 'button') void context.resume().then(() => cue(kind)).catch(() => {});
      return;
    }
    const profile = {
      button: { notes: [660], wave: 'triangle', volume: .045, duration: .055 },
      countdown: { notes: [880], wave: 'square', volume: .045, duration: .17 },
      go: { notes: [1320], wave: 'square', volume: .05, duration: .48 },
      swap: { notes: [380, 510], wave: 'sine', volume: .025, duration: .09 },
      select: { notes: [480], wave: 'sine', volume: .025, duration: .09 },
    }[kind];
    if (!profile) return;
    profile.notes.forEach((hz, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime + index * .065;
      oscillator.type = profile.wave; oscillator.frequency.setValueAtTime(hz, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(profile.volume, start + .006);
      gain.gain.setValueAtTime(profile.volume, start + profile.duration * .65);
      gain.gain.exponentialRampToValueAtTime(.0001, start + profile.duration);
      const effect = { oscillator, gain }; effects.add(effect);
      oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + profile.duration + .01);
      oscillator.onended = () => { effects.delete(effect); oscillator.disconnect(); gain.disconnect(); };
    });
  }
  async function playVictory() {
    stop(); const current = generation;
    if (!enabled) { onStatus('muted'); return; }
    await prime();
    if (current !== generation || !enabled) return;
    if (!buffer || context?.state !== 'running') { onStatus('unavailable'); return; }
    const source = context.createBufferSource(); source.buffer = buffer;
    const gain = context.createGain(); gain.gain.value = .85;
    source.connect(gain).connect(context.destination); voice = source;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (voice === source) { voice = null; musicVolume(); onStatus('finished'); }
    };
    musicVolume(true); source.start(); onStatus('playing');
  }
  return { prime, startOnOpen, cue, playVictory, stop, setEnabled, setMusicEnabled, setHidden, get enabled() { return enabled; }, get musicEnabled() { return musicEnabled; } };
}
