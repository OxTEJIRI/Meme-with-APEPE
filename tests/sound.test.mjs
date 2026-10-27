import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameSound } from '../dist/sound.mjs';

function audioEnvironment(t, deferredMusic = false, autoplayBlocked = false) {
  const sources = [], gains = [], storage = new Map();
  const requests = [], pendingResumes = [];
  let gestureAllowed = !autoplayBlocked;
  let releaseMusic;
  const musicBytes = deferredMusic ? new Promise(resolve => { releaseMusic = () => resolve(new Uint8Array([2]).buffer); }) : Promise.resolve(new Uint8Array([2]).buffer);
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() {
      if (!gestureAllowed) return new Promise(resolve => pendingResumes.push(resolve));
      this.state = 'running'; this.onstatechange?.();
      for (const resolve of pendingResumes.splice(0)) resolve();
      return Promise.resolve();
    }
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
  t.mock.method(globalThis, 'fetch', async url => { requests.push(String(url)); return { ok: true, arrayBuffer: () => String(url).includes('neon-lily') ? musicBytes : Promise.resolve(new Uint8Array([1]).buffer) }; });
  t.after(() => { delete globalThis.window; delete globalThis.localStorage; });
  return { sources, gains, storage, contextInstances, requests, releaseMusic, allowGesture: () => { gestureAllowed = true; }, settle: () => new Promise(resolve => setImmediate(resolve)) };
}

test('opening the game starts music automatically when the browser allows it', async t => {
  const env = audioEnvironment(t), statuses = [];
  const sound = createGameSound(() => {}, value => statuses.push(value));
  sound.startOnOpen(); await env.settle();
  assert.ok(env.sources.find(source => source.loop && source.started));
  assert.equal(statuses.at(-1), 'playing');
});

test('blocked autoplay preloads music and starts on a gesture without generating a puzzle', async t => {
  const env = audioEnvironment(t, false, true), statuses = [];
  const sound = createGameSound(() => {}, value => statuses.push(value));
  sound.startOnOpen(); await env.settle();
  assert.equal(env.sources.length, 0);
  assert.equal(statuses.at(-1), 'blocked');
  assert.equal(env.requests.filter(url => url.includes('neon-lily')).length, 1);
  env.allowGesture(); await sound.prime(); await env.settle();
  assert.ok(env.sources.find(source => source.loop && source.started));
  assert.equal(statuses.at(-1), 'playing');
  assert.equal(env.requests.filter(url => url.includes('neon-lily')).length, 1, 'tap should reuse the preloaded track');
});

test('opening the game respects the player\'s saved music mute', async t => {
  const env = audioEnvironment(t);
  env.storage.set('apepe-music-v1', 'off');
  const sound = createGameSound();
  sound.startOnOpen(); await env.settle();
  assert.equal(env.contextInstances.length, 0);
  assert.equal(env.requests.length, 0);
});

test('opening a background tab waits until the page becomes visible', async t => {
  const env = audioEnvironment(t);
  const sound = createGameSound();
  sound.setHidden(true); sound.startOnOpen(); await env.settle();
  assert.equal(env.contextInstances.length, 0);
  sound.setHidden(false); await env.settle();
  assert.ok(env.sources.find(source => source.loop && source.started));
});

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
