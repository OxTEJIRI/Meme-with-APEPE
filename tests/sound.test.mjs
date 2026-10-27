import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameSound } from '../dist/sound.mjs';

function audioEnvironment(t, deferredMusic = false) {
  const sources = [], gains = [], storage = new Map();
  let releaseMusic;
  const musicBytes = deferredMusic ? new Promise(resolve => { releaseMusic = () => resolve(new Uint8Array([2]).buffer); }) : Promise.resolve(new Uint8Array([2]).buffer);
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async decodeAudioData(bytes) { return { duration: new Uint8Array(bytes)[0] === 2 ? 48 : 4 }; }
    createGain() {
      const gain = { gain: { value: 0, targets: [], cancelScheduledValues() {}, setTargetAtTime(value) { this.targets.push(value); } }, connect() { return this; }, disconnect() {} };
      gains.push(gain); return gain;
    }
    createBufferSource() {
      const source = { connect() { return this; }, disconnect() {}, start(when, offset = 0) { this.offset = offset; this.started = true; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    }
  }
  const contextInstances = [];
  globalThis.window = { AudioContext: class extends AudioContext { constructor() { super(); contextInstances.push(this); } } };
  globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value) };
  t.mock.method(globalThis, 'fetch', async url => ({ ok: true, arrayBuffer: () => String(url).includes('neon-lily') ? musicBytes : Promise.resolve(new Uint8Array([1]).buffer) }));
  t.after(() => { delete globalThis.window; delete globalThis.localStorage; });
  return { sources, gains, storage, contextInstances, releaseMusic, settle: () => new Promise(resolve => setImmediate(resolve)) };
}

test('music keeps playing between rounds and softens only during the victory voice', async t => {
  const env = audioEnvironment(t), statuses = [];
  const sound = createGameSound(() => {}, value => statuses.push(value));
  await sound.prime(); await env.settle();
  const music = env.sources.find(source => source.loop);
  assert.ok(music?.started);
  sound.stop(); await sound.prime(); await env.settle();
  assert.equal(env.sources.filter(source => source.loop).length, 1, 'new round must not restart the track');
  assert.ok(!music.stopped);
  await sound.playVictory();
  assert.equal(env.gains[0].gain.targets.at(-1), .035);
  const voice = env.sources.find(source => !source.loop);
  voice.onended();
  assert.equal(env.gains[0].gain.targets.at(-1), .24);
  sound.setMusicEnabled(false);
  assert.ok(music.stopped);
  assert.equal(sound.enabled, true, 'turning off music must preserve effects and voice');
  assert.equal(env.storage.get('apepe-music-v1'), 'off');
  assert.ok(statuses.includes('playing'));
});

test('muting while the music downloads prevents a late start', async t => {
  const env = audioEnvironment(t, true);
  const sound = createGameSound();
  await sound.prime();
  sound.setEnabled(false); env.releaseMusic(); await env.settle();
  assert.equal(env.sources.length, 0);
  assert.equal(env.storage.get('apepe-sound-v1'), 'off');
  sound.setEnabled(true); await env.settle();
  assert.equal(env.sources.filter(source => source.loop && source.started).length, 1);
});

test('hidden pages pause the soundtrack and resume at the saved position', async t => {
  const env = audioEnvironment(t);
  const sound = createGameSound();
  await sound.prime(); await env.settle();
  env.contextInstances[0].currentTime = 9;
  sound.setHidden(true); await env.settle();
  assert.ok(env.sources[0].stopped);
  assert.equal(env.contextInstances[0].state, 'suspended');
  sound.setHidden(false); await env.settle();
  assert.equal(env.sources.at(-1).offset, 9);
  assert.equal(env.contextInstances[0].state, 'running');
});
