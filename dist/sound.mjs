// Prepare audio during a real click so a later victory can speak on mobile.
export function createGameSound(onStatus = () => {}) {
  let enabled = true, context, buffer, loading, voice, generation = 0;
  try { enabled = localStorage.getItem('apepe-sound-v1') !== 'off'; } catch { /* Optional preference. */ }
  async function prime() {
    if (!enabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio is unavailable');
      context ||= new AudioContext();
      // resume must be invoked before the first await while inside the click.
      const resumed = context.resume();
      if (!buffer && !loading) {
        loading = fetch(new URL('./assets/audio/victory-voice.mp3', import.meta.url))
          .then(response => { if (!response.ok) throw new Error('Voice could not load'); return response.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes)).then(decoded => { buffer = decoded; })
          .finally(() => { loading = null; });
      }
      await Promise.all([resumed, loading]);
      onStatus('ready');
    } catch { onStatus('unavailable'); }
  }
  function stop() { generation++; if (voice) { voice.stop(); voice = null; } }
  function setEnabled(value) {
    enabled = Boolean(value);
    try { localStorage.setItem('apepe-sound-v1', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (!enabled) { stop(); onStatus('muted'); }
    else void prime();
    return enabled;
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
      if (voice === source) { voice = null; onStatus('finished'); }
    };
    source.start(); onStatus('playing');
  }
  return { prime, cue, playVictory, stop, setEnabled, get enabled() { return enabled; } };
}
