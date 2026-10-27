// Prepare audio during a real click so a later victory can speak on mobile.
export function createGameSound(onStatus = () => {}, onMusicStatus = () => {}) {
  let enabled = true, context, buffer, loading, voice, generation = 0;
  let musicEnabled = true, musicBuffer, musicLoading, musicSource, musicGain, musicOffset = 0, musicStarted = 0;
  let started = false, hidden = false;
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
    if (!musicBuffer || context?.state !== 'running') return;
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
        onMusicStatus('loading');
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
      context ||= new AudioContext();
      started = true;
      // resume must be invoked before the first await while inside the click.
      const resumed = context.resume();
      // Music loads independently, so the board and victory voice never wait for it.
      void resumed.then(() => prepareMusic()).catch(() => onMusicStatus('paused'));
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
  function setEnabled(value) {
    enabled = Boolean(value);
    try { localStorage.setItem('apepe-sound-v1', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (!enabled) { stop(); syncMusic(); onStatus('muted'); }
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
    if (hidden) { stop(); syncMusic(); if (context) void context.suspend().catch(() => {}); }
    else if (started && enabled && context) void context.resume().then(syncMusic).catch(() => onMusicStatus('paused'));
  }
  function cue(kind) {
    if (!enabled || context?.state !== 'running') return;
    const frequencies = kind === 'shuffle' ? [180, 270, 360] : kind === 'swap' ? [380, 510] : [480];
    frequencies.forEach((hz, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime + index * .065;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(hz, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.025, start + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .09);
      oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + .1);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
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
  return { prime, cue, playVictory, stop, setEnabled, setMusicEnabled, setHidden, get enabled() { return enabled; }, get musicEnabled() { return musicEnabled; } };
}
