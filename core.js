/* Note Block Song Builder – core logic (no DOM). */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- instruments
  const INST_ORDER = ['harp', 'bass', 'basedrum', 'snare', 'hat', 'guitar', 'flute', 'bell', 'chime',
    'xylophone', 'iron_xylophone', 'cow_bell', 'didgeridoo', 'bit', 'banjo', 'pling'];

  // low = MIDI pitch played at 0 clicks. cond = block can be powered (so it can sit under a "top" note block).
  const INST = {
    harp:           { vi: 'Harp / Piano',   block: 'minecraft:dirt',          low: 54, cond: true,  color: '#8d6e4a' },
    bass:           { vi: 'Bass',           block: 'minecraft:oak_planks',    low: 30, cond: true,  color: '#b8945f' },
    basedrum:       { vi: 'Trống bass',     block: 'minecraft:stone',         low: 54, cond: true,  color: '#8a8a8a', perc: true },
    snare:          { vi: 'Trống snare',    block: 'minecraft:sand',          low: 54, cond: true,  color: '#e3d59b', perc: true, gravity: true },
    hat:            { vi: 'Hi-hat (click)', block: 'minecraft:glass',         low: 54, cond: false, color: '#bfe6f5', perc: true },
    guitar:         { vi: 'Guitar',         block: 'minecraft:white_wool',    low: 42, cond: true,  color: '#f2f2f2' },
    flute:          { vi: 'Sáo (flute)',    block: 'minecraft:clay',          low: 66, cond: true,  color: '#a3aab8' },
    bell:           { vi: 'Chuông (bell)',  block: 'minecraft:gold_block',    low: 78, cond: true,  color: '#f6d33c' },
    chime:          { vi: 'Chime',          block: 'minecraft:packed_ice',    low: 78, cond: true,  color: '#8fb8ee' },
    xylophone:      { vi: 'Xylophone',      block: 'minecraft:bone_block',    low: 78, cond: true,  color: '#e6dfc4' },
    iron_xylophone: { vi: 'Iron xylophone', block: 'minecraft:iron_block',    low: 54, cond: true,  color: '#d8d8d8' },
    cow_bell:       { vi: 'Cow bell',       block: 'minecraft:soul_sand',     low: 66, cond: true,  color: '#5b4436' },
    didgeridoo:     { vi: 'Didgeridoo',     block: 'minecraft:pumpkin',       low: 30, cond: true,  color: '#e08a1e' },
    bit:            { vi: 'Bit (8-bit)',    block: 'minecraft:emerald_block', low: 54, cond: true,  color: '#2fbf5b' },
    banjo:          { vi: 'Banjo',          block: 'minecraft:hay_block',     low: 54, cond: true,  color: '#c9a227' },
    pling:          { vi: 'Pling',          block: 'minecraft:glowstone',     low: 54, cond: false, color: '#ffe27a' },
  };

  const FLOOR = 'minecraft:smooth_stone';
  const LINE = 'minecraft:stone_bricks';

  const GM_FAMILY = ['Piano', 'Chromatic perc.', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass',
    'Reed', 'Pipe', 'Synth lead', 'Synth pad', 'Synth FX', 'Ethnic', 'Percussive', 'Sound FX'];

  function gmToInst(prog) {
    const f = prog >> 3;
    switch (f) {
      case 0: return 'harp';
      case 1: return [8, 9, 10].includes(prog) ? 'bell' : prog === 11 ? 'iron_xylophone' : (prog === 12 || prog === 13) ? 'xylophone' : prog === 14 ? 'chime' : 'harp';
      case 2: return 'harp';
      case 3: return 'guitar';
      case 4: return 'bass';
      case 5: return prog === 45 ? 'banjo' : prog === 47 ? 'basedrum' : 'harp';
      case 6: return 'harp';
      case 7: return 'bit';
      case 8: return 'flute';
      case 9: return 'flute';
      case 10: return 'bit';
      case 11: return 'pling';
      case 12: return 'pling';
      case 13: return prog === 108 ? 'bell' : 'banjo';
      case 14: return prog === 112 ? 'bell' : prog === 113 ? 'cow_bell' : prog === 114 ? 'iron_xylophone' : prog === 115 ? 'hat' : prog === 119 ? 'snare' : 'basedrum';
      default: return 'hat';
    }
  }

  // General MIDI drum key -> [instrument, clicks]
  function drumMap(k) {
    if (k === 35 || k === 36) return ['basedrum', 0];
    if (k === 37) return ['hat', 10];
    if (k === 38 || k === 40) return ['snare', 12];
    if (k === 39) return ['snare', 17];
    if ([41, 43, 45, 47, 48, 50].includes(k)) return ['basedrum', { 41: 4, 43: 7, 45: 10, 47: 13, 48: 16, 50: 19 }[k]];
    if (k === 42 || k === 44) return ['hat', 20];
    if (k === 46) return ['hat', 15];
    if (k === 49 || k === 57 || k === 52 || k === 55) return ['snare', 22];
    if (k === 51 || k === 59 || k === 53) return ['hat', 24];
    if (k === 54) return ['hat', 18];
    if (k === 56) return ['cow_bell', 12];
    if (k >= 60 && k <= 66) return ['basedrum', 8 + (k - 60) * 2];
    if (k === 75 || k === 76 || k === 77) return ['hat', 14 + (k - 75) * 3];
    return ['hat', 12];
  }

  // ---------------------------------------------------------------- MIDI parser
  function parseMidi(buf) {
    const d = new DataView(buf);
    let p = 0;
    const u8 = () => d.getUint8(p++);
    const str4 = () => String.fromCharCode(d.getUint8(p), d.getUint8(p + 1), d.getUint8(p + 2), d.getUint8(p + 3));
    const vlq = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

    // RIFF-wrapped MIDI (.rmi)
    if (str4() === 'RIFF') {
      p = 12;
      while (p + 8 <= d.byteLength) { const id = str4(); const len = d.getUint32(p + 4, true); if (id === 'data') { p += 8; break; } p += 8 + len; }
    }
    if (str4() !== 'MThd') throw new Error('File không phải MIDI hợp lệ.');
    p += 4;
    const hl = d.getUint32(p); p += 4;
    const ntrk = d.getUint16(p + 2), div = d.getUint16(p + 4);
    p += hl;
    let tpq = div, smpteTicksPerSec = 0;
    if (div & 0x8000) { const fps = 256 - (div >> 8); smpteTicksPerSec = fps * (div & 0xff); tpq = 0; }

    const tempos = [];
    const progs = [];
    const notes = [];
    const trackNames = [];
    for (let t = 0; t < ntrk && p + 8 <= d.byteLength; t++) {
      let id = str4(); let len = d.getUint32(p + 4); p += 8;
      while (id !== 'MTrk' && p + 8 <= d.byteLength) { p += len; id = str4(); len = d.getUint32(p + 4); p += 8; }
      const end = Math.min(p + len, d.byteLength);
      let tick = 0, status = 0;
      trackNames[t] = '';
      while (p < end) {
        tick += vlq();
        let b = d.getUint8(p);
        if (b & 0x80) { status = b; p++; } else if (!status) break;
        if (status === 0xff) {
          const type = u8(); const l = vlq();
          if (type === 0x51 && l === 3) tempos.push({ tick, us: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2) });
          if (type === 0x03 && !trackNames[t]) { let s = ''; for (let i = 0; i < l; i++) s += String.fromCharCode(d.getUint8(p + i)); trackNames[t] = s.trim(); }
          p += l; status = 0;
          if (type === 0x2f) { p = end; }
        } else if (status === 0xf0 || status === 0xf7) {
          p += vlq(); status = 0;
        } else {
          const hi = status & 0xf0, ch = status & 15;
          if (hi === 0x90) { const n = u8(), v = u8(); if (v > 0) notes.push({ tick, ch, n, v, t }); }
          else if (hi === 0xc0) { progs.push({ tick, ch, prog: u8() }); }
          else if (hi === 0xd0) { p += 1; }
          else { p += 2; }
        }
      }
      p = end;
    }

    // tempo map
    tempos.sort((a, b) => a.tick - b.tick);
    const tm = [{ tick: 0, us: 500000, sec: 0 }];
    for (const tp of tempos) {
      const last = tm[tm.length - 1];
      const sec = last.sec + (tp.tick - last.tick) * last.us / 1e6 / (tpq || 1);
      if (tp.tick === last.tick) { last.us = tp.us; } else tm.push({ tick: tp.tick, us: tp.us, sec });
    }
    const toSec = (tick) => {
      if (!tpq) return tick / smpteTicksPerSec;
      let lo = 0, hi = tm.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tm[mid].tick <= tick) lo = mid; else hi = mid - 1; }
      const s = tm[lo];
      return s.sec + (tick - s.tick) * s.us / 1e6 / tpq;
    };

    progs.sort((a, b) => a.tick - b.tick);
    const progAt = (ch, tick) => { let pr = 0; for (const x of progs) { if (x.tick > tick) break; if (x.ch === ch) pr = x.prog; } return pr; };

    const parts = new Map();
    for (const nt of notes) {
      const drum = nt.ch === 9;
      const prog = drum ? -1 : progAt(nt.ch, nt.tick);
      const key = nt.t + ':' + nt.ch + ':' + prog;
      if (!parts.has(key)) {
        const nm = trackNames[nt.t] || ('Track ' + (nt.t + 1));
        parts.set(key, {
          id: 'p' + parts.size, kind: 'midi', name: nm, sub: drum ? 'Trống (kênh 10)' : ('Kênh ' + (nt.ch + 1) + ' · ' + GM_FAMILY[prog >> 3] + ' #' + prog),
          isDrum: drum, program: prog, notes: [], enabled: true,
          instrument: drum ? 'auto' : gmToInst(prog), octave: 0, rangeMode: 'swap',
        });
      }
      parts.get(key).notes.push({ t: toSec(nt.tick), pitch: nt.n, vel: nt.v });
    }
    const list = [...parts.values()];
    list.forEach((pt) => { if (!pt.isDrum) pt.octave = bestOctave(pt, pt.instrument); });
    return { kind: 'midi', title: '', parts: list };
  }

  // ---------------------------------------------------------------- NBS parser
  function parseNbs(buf) {
    const d = new DataView(buf);
    let p = 0;
    const u8 = () => d.getUint8(p++);
    const i16 = () => { const v = d.getInt16(p, true); p += 2; return v; };
    const i32 = () => { const v = d.getInt32(p, true); p += 4; return v; };
    const str = () => { const l = i32(); const bytes = new Uint8Array(buf, p, l); p += l; return new TextDecoder('utf-8').decode(bytes); };

    let version = 0;
    const first = i16();
    if (first === 0) { version = u8(); u8(); if (version >= 3) i16(); }
    const layerCount = i16();
    const title = str(); const author = str(); str(); str();
    const tempo = i16() / 100 || 10;
    u8(); u8(); u8();
    i32(); i32(); i32(); i32(); i32();
    str();
    if (version >= 4) { u8(); u8(); i16(); }

    const raw = [];
    let tick = -1;
    for (;;) {
      const jt = i16(); if (jt === 0) break; tick += jt;
      let layer = -1;
      for (;;) {
        const jl = i16(); if (jl === 0) break; layer += jl;
        const ins = u8(), key = u8();
        let vel = 100, pitch = 0;
        if (version >= 4) { vel = u8(); u8(); pitch = i16(); }
        raw.push({ tick, layer, ins, key, vel, pitch });
      }
    }
    const layers = [];
    const maxLayer = Math.max(layerCount, raw.reduce((m, n) => Math.max(m, n.layer + 1), 0));
    for (let i = 0; i < maxLayer; i++) {
      let name = '', vol = 100;
      if (p < d.byteLength && i < layerCount) {
        try { name = str(); if (version >= 4) u8(); vol = u8(); if (version >= 2) u8(); } catch (e) { /* tolerate */ }
      }
      layers.push({ name, vol });
    }
    const parts = layers.map((l, i) => ({
      id: 'p' + i, kind: 'nbs', name: l.name || ('Layer ' + (i + 1)), sub: '', isDrum: false, program: -1,
      notes: [], enabled: l.vol > 0, instrument: 'file', octave: 0, rangeMode: 'fold',
    }));
    for (const n of raw) {
      if (n.vel === 0) continue;
      const inst = INST_ORDER[n.ins] || 'harp';
      parts[n.layer].notes.push({ t: n.tick / tempo, key: n.key + Math.round(n.pitch / 100), inst, vel: n.vel });
    }
    parts.forEach((pt) => {
      const c = {};
      pt.notes.forEach((n) => { c[n.inst] = (c[n.inst] || 0) + 1; });
      pt.sub = Object.keys(c).map((k) => INST[k].vi).join(', ');
    });
    return { kind: 'nbs', title: title || '', author, tempo, parts: parts.filter((pt) => pt.notes.length) };
  }

  // ---------------------------------------------------------------- balancing
  function bestOctave(part, inst) {
    if (!INST[inst] || INST[inst].perc) return 0;
    const lo = INST[inst].low;
    let best = 0, bestBad = Infinity;
    for (const s of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      let bad = 0;
      for (const n of part.notes) { const q = n.pitch + 12 * s; if (q < lo || q > lo + 24) bad++; }
      if (bad < bestBad) { bestBad = bad; best = s; }
    }
    return best;
  }

  function outOfRangeCount(part) {
    if (part.kind !== 'midi' || part.isDrum) return 0;
    const inst = part.instrument;
    if (!INST[inst] || INST[inst].perc) return 0;
    const lo = INST[inst].low;
    let bad = 0;
    for (const n of part.notes) { const q = n.pitch + 12 * part.octave; if (q < lo || q > lo + 24) bad++; }
    return bad;
  }

  const ALT_LOW = ['harp', 'guitar', 'bass', 'didgeridoo'];
  const ALT_HIGH = ['harp', 'flute', 'bell', 'chime'];
  function pickAlt(p, inst) {
    const lo = INST[inst].low;
    const list = p < lo ? ALT_LOW.filter((k) => INST[k].low < lo) : ALT_HIGH.filter((k) => INST[k].low > lo);
    for (const k of list) if (p >= INST[k].low && p <= INST[k].low + 24) return k;
    return null;
  }

  // Song -> list of time slots (1 slot = 1 redstone tick = 0.1 s)
  function buildSlots(song, o) {
    const factor = 100 / (o.tempo || 100);
    const raw = [];
    let folded = 0, swapped = 0;
    for (const part of song.parts) {
      if (!part.enabled) continue;
      for (const n of part.notes) {
        let inst, click;
        if (part.kind === 'nbs') {
          inst = part.instrument === 'file' ? n.inst : part.instrument;
          click = n.key - 33 + 12 * part.octave + (INST[inst].perc ? 0 : (o.transpose || 0));
        } else if (part.isDrum && part.instrument === 'auto') {
          [inst, click] = drumMap(n.pitch);
        } else {
          inst = part.instrument === 'auto' ? 'harp' : part.instrument;
          const perc = INST[inst].perc;
          const pitch = n.pitch + 12 * part.octave + (perc ? 0 : (o.transpose || 0));
          click = pitch - INST[inst].low;
          if ((click < 0 || click > 24) && part.rangeMode === 'swap' && !perc) {
            const alt = pickAlt(pitch, inst);
            if (alt) { inst = alt; click = pitch - INST[alt].low; swapped++; }
          }
        }
        if (click < 0 || click > 24) { folded++; while (click < 0) click += 12; while (click > 24) click -= 12; }
        raw.push({ rt: Math.round(n.t * 10 * factor), inst, click, vel: n.vel || 100, part: part.id });
      }
    }
    if (!raw.length) return { slots: [], folded, swapped, totalNotes: 0 };
    raw.sort((a, b) => a.rt - b.rt);
    const t0 = raw[0].rt;
    const slots = [];
    let cur = null;
    for (const r of raw) {
      const rt = r.rt - t0;
      if (!cur || cur.rt !== rt) { cur = { rt, notes: [], map: new Map() }; slots.push(cur); }
      const k = r.inst + ':' + r.click;
      const ex = cur.map.get(k);
      if (ex) { if (r.vel > ex.vel) ex.vel = r.vel; } else { const nn = { inst: r.inst, click: r.click, vel: r.vel, part: r.part }; cur.map.set(k, nn); cur.notes.push(nn); }
    }
    slots.forEach((s) => delete s.map);
    return { slots, folded, swapped, totalNotes: raw.length };
  }

  function lanesNeeded(notes, top) {
    let cond = 0, non = 0;
    notes.forEach((n) => { if (INST[n.inst].cond) cond++; else non++; });
    for (let n = 1; n <= 99; n++) {
      if (non <= 2 * n && non + cond <= 2 * n + Math.min(top ? n : 0, cond)) return n;
    }
    return 99;
  }

  // Decide which notes are kept and where they go in each lane.
  function assignSlot(slot, n, top) {
    const melodic = slot.notes.filter((x) => !INST[x.inst].perc);
    let hiN = null, loN = null;
    melodic.forEach((x) => {
      const p = INST[x.inst].low + x.click;
      if (!hiN || p > INST[hiN.inst].low + hiN.click) hiN = x;
      if (!loN || p < INST[loN.inst].low + loN.click) loN = x;
    });
    const prio = (x) => x.vel + (x === hiN ? 1000 : 0) + (x === loN ? 500 : 0) + ((x.inst === 'basedrum' || x.inst === 'snare') ? 300 : 0);
    const sorted = slot.notes.slice().sort((a, b) => prio(b) - prio(a));
    const sidesCap = 2 * n, topCap = top ? n : 0;
    let cond = 0, non = 0;
    const kept = [];
    let dropped = 0;
    for (const x of sorted) {
      const c = INST[x.inst].cond;
      const n2 = non + (c ? 0 : 1), c2 = cond + (c ? 1 : 0);
      if (n2 <= sidesCap && n2 + c2 <= sidesCap + Math.min(topCap, c2)) { kept.push(x); non = n2; cond = c2; } else dropped++;
    }
    const sides = kept.filter((x) => !INST[x.inst].cond);
    const condList = kept.filter((x) => INST[x.inst].cond).sort((a, b) => (b.inst === 'snare') - (a.inst === 'snare'));
    const tops = [];
    for (const x of condList) {
      if (x.inst === 'snare' && tops.length < topCap) tops.push(x);
      else if (sides.length < sidesCap) sides.push(x);
      else tops.push(x);
    }
    const lanes = [];
    for (let i = 0; i < n; i++) lanes.push({ top: tops[i] || null, a: sides[2 * i] || null, b: sides[2 * i + 1] || null });
    return { lanes, dropped };
  }

  // ---------------------------------------------------------------- layout
  // Each lane: repeater line along X. Slot block B strongly powered by a repeater; note blocks on its
  // two sides (Z±1) and optionally on top. Lanes are 3 apart in Z. Rows snake: east, U-turn (dust), west...
  const uExtra = (n) => (n >= 3 ? 2 : 0);
  const offFor = (n, top) => Math.max(2 * n - 1 + uExtra(n), top === false ? 3 : 2);
  function refreshCount(n) { return Math.max(0, Math.ceil(uturnLocal(n, 0).length / 15) - 1); }

  // U-turn path for lane i (cells in order) in a local frame: [s, dz, kind]
  function uturnLocal(n, i) {
    const path = [];
    const w = 2 * (n - 1 - i) + uExtra(n);
    const dzEnd = 6 * n - 3 - 6 * i;
    for (let s = 0; s <= w; s++) path.push([s, 0, 'h']);
    for (let z = 1; z < dzEnd; z++) path.push([w, z, 'v']);
    for (let s = w; s >= 0; s--) path.push([s, dzEnd, 'h']);
    return path;
  }
  // Pick refresh repeater indices so every dust run is <= 15. pad = dust cells already before the U-turn.
  function pickRefresh(n, i, pad) {
    const k = refreshCount(n);
    const path = uturnLocal(n, i);
    if (k === 0) return pad + path.length <= 15 ? [] : null;
    let best = null, bestScore = Infinity;
    path.forEach((pp, idx) => {
      if (pp[2] !== 'v') return;
      const r1 = pad + idx, r2 = path.length - idx - 1;
      if (r1 > 15 || r2 > 15) return;
      const sc = Math.max(r1, r2);
      if (sc < bestScore) { bestScore = sc; best = [idx]; }
    });
    return best;
  }
  function maxPadB(n) {
    let pad = -1;
    for (let p = 0; p <= 15; p++) { let ok = true; for (let i = 0; i < n; i++) if (!pickRefresh(n, i, p)) ok = false; if (ok) pad = p; }
    return pad;
  }

  function endSegFeasible(T, E, atStart) {
    if (T < 1 || E < 1) return false;
    if (Math.ceil(T / 4) > E) return false;
    const cnt = Math.min(T, E);
    const maxCells = atStart ? cnt + 15 * (cnt - 1) : 16 * cnt;
    return maxCells >= E;
  }

  // Geometry constants for one configuration.
  // side  = chord lanes side by side along Z (one layer per floor)
  // stack = chord lanes stacked in Y (each lane its own layer, 4 blocks apart)
  function geomInfo(n, top, stack) {
    const nz = stack ? 1 : n, ny = stack ? n : 1;
    const floorH = stack ? 4 * n : 4;
    return {
      n, nz, ny, top, stack, W: 3 * nz, k: refreshCount(nz), padB: maxPadB(nz), floorH, kR: floorH / 2,
      hOne: stack ? 4 * (n - 1) + (top ? 3 : 2) : (top ? 3 : 2),
      off: stack ? 2 : offFor(nz, top),
      firstCells: stack && n > 1 ? 2 : 1,
    };
  }

  // Pack the stream of runs (delays) and B's into rows of exactly L cells (last row may be shorter).
  // Every Rmax-th break climbs to the next floor (riser) instead of a U-turn.
  function packRows(slots, L, g, Rmax) {
    const k = g.k;
    const items = [{ type: 'run', D: 1, cells: g.firstCells }];
    slots.forEach((s, i) => {
      if (i > 0) items.push({ type: 'run', D: s.rt - slots[i - 1].rt });
      items.push({ type: 'B', slot: i });
    });
    const rows = [];
    let idx = 0, carry = null, guard = 0;
    while (idx < items.length) {
      if (++guard > 200000) return null;
      const riser = !!Rmax && Rmax !== Infinity && (rows.length + 1) % Rmax === 0;
      const row = [];
      let c = 0, best = null, bestStretch = null, i = idx;
      let finished = false;
      for (;;) {
        if (i >= items.length) { finished = true; break; }
        const it = items[i];
        if (it.type === 'run') {
          const D = (i === idx && carry != null) ? carry : it.D;
          const E = L - c;
          if (!it.cells || i === idx && carry != null) {
            if (riser) {
              const kk = g.kR;
              if (D - kk >= 2) {
                const T1 = Math.min(D - kk - 1, 4 * E);
                if (endSegFeasible(T1, E, c === 0)) best = { i, c, rowLen: row.length, D, T1, type: 'R', stretch: 0 };
              }
              if (D >= 1) {
                const T1 = Math.max(1, Math.ceil(E / 16));
                if (endSegFeasible(T1, E, c === 0)) {
                  const Deff = Math.max(D, T1 + kk + 1);
                  bestStretch = { i, c, rowLen: row.length, D: Deff, T1, type: 'R', stretch: Deff - D };
                }
              }
            } else {
              let opt = null;
              if (D - k >= 2) {
                const T1 = Math.min(D - k - 1, 4 * E);
                if (endSegFeasible(T1, E, c === 0)) opt = { i, c, rowLen: row.length, D, T1, type: 'R' };
              }
              if (!opt && D - k >= 1 && c > 0 && row.length && row[row.length - 1].type === 'B' && E <= g.padB) {
                opt = { i, c, rowLen: row.length, D, T1: 0, type: 'B' };
              }
              if (!opt && k > 0 && D >= 1 && D <= 4 * k && c > 0 && row.length && row[row.length - 1].type === 'B' && E <= g.padB) {
                opt = { i, c, rowLen: row.length, D, T1: 0, type: 'BW' };
              }
              if (opt) best = opt;
            }
          }
          const cells = (it.cells && !(i === idx && carry != null)) ? it.cells : Math.ceil(D / 4);
          if (c + cells > L) break;
          row.push({ type: 'run', D, cells }); c += cells; i++;
        } else {
          if (c + 1 > L) break;
          row.push({ type: 'B', slot: it.slot }); c += 1; i++;
        }
      }
      if (finished) { rows.push({ items: row, len: c, last: true }); break; }
      const pick = best || bestStretch;
      if (!pick) return null;
      const r = row.slice(0, pick.rowLen);
      if (pick.type === 'R') r.push({ type: 'end', T: pick.T1, E: L - pick.c, atStart: pick.c === 0 });
      else r.push({ type: 'endB', E: L - pick.c });
      rows.push({
        items: r, len: L, last: false, riser, stretch: pick.stretch || 0,
        pad: pick.type === 'R' ? 0 : L - pick.c, refreshDelay: pick.type === 'BW' ? pick.D : 1,
      });
      if (pick.type === 'BW') { idx = pick.i + 1; carry = null; }
      else { idx = pick.i; carry = pick.D - (riser ? g.kR : k) - pick.T1; }
    }
    return rows;
  }

  function splitDelay(D, cnt) {
    const out = []; let rem = D;
    for (let j = 0; j < cnt; j++) { const left = cnt - j; const v = Math.max(1, Math.min(4, Math.ceil(rem / left))); out.push(v); rem -= v; }
    return out;
  }

  function layout(slotsIn, cfg) {
    const n = cfg.lanes, top = cfg.top, stack = !!cfg.stack;
    const g = geomInfo(n, top, stack);
    const Rmax = cfg.rowsPerFloor || Infinity;
    const assigned = slotsIn.map((s) => assignSlot(s, n, top));
    const dropped = assigned.reduce((a, s) => a + s.dropped, 0);
    const L = cfg.L;
    const rows = packRows(slotsIn, L, g, Rmax);
    if (!rows) return null;
    const { nz, ny, W, off, floorH } = g;

    const cells = new Map();
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const set = (x, y, z, b) => { cells.set(key(x, y, z), b); };
    const notePos = [];

    const rep = (dir, delay) => ({ name: 'minecraft:repeater', props: { delay: String(delay), facing: dir, locked: 'false', powered: 'false' } });
    const opp = { east: 'west', west: 'east', north: 'south', south: 'north' };
    const DUST = () => ({ name: 'minecraft:redstone_wire', props: null });
    const block = (nm) => ({ name: nm, props: null });
    const torch = (lit) => ({ name: 'minecraft:redstone_torch', props: { lit: lit ? 'true' : 'false' } });
    const noteB = (nt) => ({ name: 'minecraft:note_block', props: { instrument: nt.inst, note: String(nt.click), powered: 'false' } });
    const zLane = (b, i) => b * W + 3 * i + 1;
    // vertical tower: block at y0 (input), torches/blocks alternating, ends with block at y0+h
    const tower = (x, y0, z, h) => {
      set(x, y0, z, block(LINE));
      for (let q = 1; q < h; q++) set(x, y0 + q, z, q % 2 ? torch(((q - 1) / 2) % 2 === 0) : block(LINE));
      set(x, y0 + h, z, block(LINE));
    };

    const shifts = new Array(slotsIn.length).fill(0);
    let shiftAcc = 0, stretches = 0, stretchTicks = 0;
    let floorsUsed = 1;

    rows.forEach((row, r) => {
      const f = Rmax === Infinity ? 0 : Math.floor(r / Rmax);
      floorsUsed = Math.max(floorsUsed, f + 1);
      const rl = Rmax === Infinity ? r : r - f * Rmax;
      const b = f % 2 === 0 ? rl : Rmax - 1 - rl;
      const sgn = f % 2 === 0 ? 1 : -1;
      const east = r % 2 === 0;
      const ux = (u) => east ? off + u : off + L - 1 - u;
      const repDir = opp[east ? 'east' : 'west'];
      row.items.forEach((it) => { if (it.type === 'B') shifts[it.slot] = shiftAcc; });

      for (let j = 0; j < ny; j++) {
        const yb = f * floorH + (stack ? 4 * j : 0);
        const seq = [];
        row.items.forEach((it, ii) => {
          if (it.type === 'run') {
            let D = it.D;
            const cnt = it.cells || Math.ceil(D / 4);
            if (r === 0 && ii === 0 && stack) D = it.D + (g.firstCells > 1 ? 1 : 0) + 2 * (n - 1 - j);
            splitDelay(D, cnt).forEach((d) => seq.push({ t: 'R', d }));
          } else if (it.type === 'B') seq.push({ t: 'B', slot: it.slot });
          else if (it.type === 'endB') { for (let q = 0; q < it.E; q++) seq.push({ t: 'D' }); }
          else {
            const cnt = Math.max(Math.ceil(it.T / 4), it.atStart ? Math.ceil((it.E + 15) / 16) : Math.ceil(it.E / 16));
            const delays = splitDelay(it.T, cnt);
            let dust = it.E - cnt;
            const runs = new Array(cnt).fill(0);
            for (let q = it.atStart ? 1 : 0; q < cnt && dust > 0; q++) { const v = Math.min(15, dust); runs[q] = v; dust -= v; }
            for (let q = 0; q < cnt; q++) { for (let w = 0; w < runs[q]; w++) seq.push({ t: 'D' }); seq.push({ t: 'R', d: delays[q] }); }
          }
        });
        for (let i = 0; i < nz; i++) {
          const z = zLane(b, i);
          const lane = stack ? j : i;
          seq.forEach((c, u) => {
            const x = ux(u);
            set(x, yb, z, block(FLOOR));
            if (c.t === 'R') set(x, yb + 1, z, rep(repDir, c.d));
            else if (c.t === 'D') set(x, yb + 1, z, DUST());
            else {
              const ln = assigned[c.slot].lanes[lane];
              set(x, yb + 1, z, block(ln.top ? INST[ln.top.inst].block : LINE));
              if (ln.top) { set(x, yb + 2, z, noteB(ln.top)); notePos.push({ x, y: yb + 2, z, slot: c.slot, nt: ln.top }); }
              [[ln.a, -1], [ln.b, 1]].forEach(([nt, dz]) => {
                if (!nt) return;
                set(x, yb, z + dz, block(INST[nt.inst].block));
                set(x, yb + 1, z + dz, noteB(nt));
                notePos.push({ x, y: yb + 1, z: z + dz, slot: c.slot, nt });
              });
            }
          });
        }
        if (row.last) continue;
        const dirX = east ? 1 : -1;
        const xExit = east ? off + L : off - 1;
        if (!row.riser) {
          for (let i = 0; i < nz; i++) {
            const ie = sgn > 0 ? i : nz - 1 - i;
            const z1 = zLane(b, i), z2 = zLane(b + sgn, nz - 1 - i);
            const path = uturnLocal(nz, ie).map(([s, dz, kind]) => [xExit + dirX * s, z1 + sgn * dz, kind]);
            if (path[path.length - 1][1] !== z2) throw new Error('uturn mismatch');
            const repIdx = new Set(pickRefresh(nz, ie, row.pad || 0) || []);
            path.forEach(([x, z], ii) => {
              set(x, yb, z, block(FLOOR));
              set(x, yb + 1, z, repIdx.has(ii) ? rep(sgn > 0 ? 'north' : 'south', row.refreshDelay || 1) : DUST());
            });
          }
        } else if (!stack) {
          for (let i = 0; i < nz; i++) {
            const z = zLane(b, i);
            set(xExit, yb, z, block(FLOOR));
            tower(xExit, yb + 1, z, floorH);
          }
        } else {
          // stacked lanes: each lane climbs in its own column, offset outwards so the towers never touch another lane
          const z0 = zLane(b, 0);
          const zt = z0 + sgn * (3 + 2 * j), xt = xExit + dirX * (2 + 2 * j);
          const yUp = yb + floorH;
          const pathOut = [];
          for (let q = 0; q <= 3 + 2 * j; q++) pathOut.push([xExit, z0 + sgn * q]);
          for (let q = 1; q <= 1 + 2 * j; q++) pathOut.push([xExit + dirX * q, zt]);
          pathOut.forEach(([x, z]) => { set(x, yb, z, block(FLOOR)); set(x, yb + 1, z, DUST()); });
          pathOut.forEach(([x, z]) => { set(x, yUp, z, block(FLOOR)); set(x, yUp + 1, z, DUST()); });
          tower(xt, yb + 1, zt, floorH);
        }
      }
      if (!row.last && row.stretch) { shiftAcc += row.stretch; stretches++; stretchTicks += row.stretch; }
    });

    // start
    const z0 = zLane(0, 0);
    let start, button;
    if (stack) {
      start = { x: off - 1, y: 1, z: z0 };
      set(off - 1, 0, z0, block(FLOOR));
      tower(off - 1, 1, z0, 4 * (n - 1));
      button = { x: off - 2, y: 1, z: z0 };
      set(off - 2, 0, z0, block(FLOOR));
      set(off - 2, 1, z0, { name: 'minecraft:stone_button', props: { face: 'wall', facing: 'west', powered: 'false' } });
    } else {
      const sx = off - 1;
      for (let z = zLane(0, 0); z <= zLane(0, nz - 1); z++) { set(sx, 0, z, block(FLOOR)); set(sx, 1, z, DUST()); }
      set(off - 2, 0, z0, block(FLOOR));
      set(off - 2, 1, z0, block(LINE));
      start = { x: off - 2, y: 1, z: z0 };
      if (top) { button = { x: off - 2, y: 2, z: z0 }; set(button.x, 2, button.z, { name: 'minecraft:stone_button', props: { face: 'floor', facing: 'east', powered: 'false' } }); }
      else { button = { x: off - 3, y: 1, z: z0 }; set(off - 3, 0, z0, block(FLOOR)); set(button.x, 1, button.z, { name: 'minecraft:stone_button', props: { face: 'wall', facing: 'west', powered: 'false' } }); }
    }

    // normalise coordinates to start at 0
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    cells.forEach((_, kk) => { const [x, y, z] = kk.split(',').map(Number); if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; });
    let finalCells = cells;
    if (mnx || mny || mnz) {
      finalCells = new Map();
      cells.forEach((b, kk) => { const [x, y, z] = kk.split(',').map(Number); finalCells.set((x - mnx) + ',' + (y - mny) + ',' + (z - mnz), b); });
      notePos.forEach((p) => { p.x -= mnx; p.y -= mny; p.z -= mnz; });
      [start, button].forEach((p) => { p.x -= mnx; p.y -= mny; p.z -= mnz; });
    }
    const get = (x, y, z) => finalCells.get(x + ',' + y + ',' + z);

    // dust shapes
    const dirs = [['north', 0, -1], ['south', 0, 1], ['west', -1, 0], ['east', 1, 0]];
    finalCells.forEach((b, kk) => {
      if (b.name !== 'minecraft:redstone_wire') return;
      const [x, y, z] = kk.split(',').map(Number);
      const con = {};
      for (const [dn, dx, dz] of dirs) {
        const nb = get(x + dx, y, z + dz);
        let c = false;
        if (nb && (nb.name === 'minecraft:redstone_wire' || nb.name === 'minecraft:redstone_torch')) c = true;
        if (nb && nb.name === 'minecraft:repeater') { const f = nb.props.facing; c = dx !== 0 ? (f === 'east' || f === 'west') : (f === 'north' || f === 'south'); }
        con[dn] = c;
      }
      const cnt = Object.values(con).filter(Boolean).length;
      if (cnt === 1) { if (con.north || con.south) { con.north = con.south = true; } else { con.east = con.west = true; } }
      b.props = { east: con.east ? 'side' : 'none', north: con.north ? 'side' : 'none', power: '0', south: con.south ? 'side' : 'none', west: con.west ? 'side' : 'none' };
    });

    let maxX = 0, maxY = 0, maxZ = 0;
    finalCells.forEach((_, kk) => { const [x, y, z] = kk.split(',').map(Number); if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z; });
    const size = { x: maxX + 1, y: maxY + 1, z: maxZ + 1 };
    const mats = {};
    finalCells.forEach((b) => { const nm = b.name.replace('minecraft:', ''); mats[nm] = (mats[nm] || 0) + 1; });

    return { cells: finalCells, size, rows: rows.length, floors: floorsUsed, lanes: n, stack, k: g.k, dropped, notePos, mats, off, L, start, button, assigned, shifts, stretches, stretchTicks };
  }

  // Try several row lengths and pick the best one that fits the limits.
  function autoLayout(slots, o) {
    const n = o.lanes, top = o.top, stack = !!o.stack;
    const g = geomInfo(n, top, stack);
    const minL = 12;
    let need = 2 + g.firstCells + slots.length;
    for (let i = 1; i < slots.length; i++) need += Math.ceil((slots[i].rt - slots[i - 1].rt) / 4);
    const base = { lanes: n, top, stack };
    if (o.mode === 'line') {
      const lay = layout(slots, { ...base, L: need + 4 });
      if (lay) lay.fits = true;
      return lay;
    }
    const extraX = g.off + 2 * g.nz - 1 + uExtra(g.nz);
    const cands = [];
    if (o.mode === 'square') {
      const maxL = Math.max(minL, need + 4);
      const step = Math.max(1, Math.floor((maxL - minL) / 300));
      for (let L = minL; L <= maxL; L += step) {
        const rows = packRows(slots, L, g, Infinity);
        if (!rows) continue;
        const X = rows.length === 1 ? g.off + rows[0].len : L + extraX, Z = rows.length * g.W;
        cands.push({ L, R: Infinity, score: Math.max(X, Z) * 1e6 + X * Z });
      }
    } else {
      const maxX = o.maxX || 64, maxZ = o.maxZ || 64, maxY = o.maxY || 64;
      if (maxY < g.hOne) return { error: `Chiều cao tối thiểu cho kiểu mạch này là ${g.hOne} khối.` };
      const F = 1 + Math.floor((maxY - g.hOne) / g.floorH);
      const riserZ = stack ? 2 * n + 1 : 0;
      const maxL = Math.max(minL, Math.min(need + 4, maxX - extraX));
      if (maxX - extraX < minL) return { error: `Chiều dài tối thiểu là ${minL + extraX} khối.` };
      const step = Math.max(1, Math.floor((maxL - minL) / 200));
      for (let L = minL; L <= maxL; L += step) {
        for (const R of new Set([Math.floor((maxZ - riserZ * 2) / g.W), Math.floor((maxZ - riserZ) / g.W), Math.floor(maxZ / g.W)])) {
          if (R < 1) continue;
          const rows = packRows(slots, L, g, F > 1 ? R : Infinity);
          if (!rows) continue;
          const fl = F > 1 ? Math.ceil(rows.length / R) : 1;
          if (fl > F || (F === 1 && rows.length > R)) continue;
          const stretch = rows.reduce((a, r) => a + (r.stretch || 0), 0);
          const sides = stack ? (fl >= 3 ? 2 : fl - 1) : 0;
          const X = (rows.length === 1 ? g.off + rows[0].len : L + extraX) + sides * 2 * n;
          const Z = Math.min(rows.length, R) * g.W + sides * (2 * n + 1);
          const Y = (fl - 1) * g.floorH + g.hOne;
          if (X > maxX || Z > maxZ || Y > maxY) continue;
          cands.push({ L, R: F > 1 ? R : Infinity, score: fl * 1e12 + stretch * 1e9 + X * Z });
        }
      }
    }
    cands.sort((a, b) => a.score - b.score);
    const seen = new Set();
    for (const c of cands.slice(0, 60)) {
      const kk = c.L + ':' + c.R; if (seen.has(kk)) continue; seen.add(kk);
      const lay = layout(slots, { ...base, L: c.L, rowsPerFloor: c.R });
      if (!lay) continue;
      if (o.mode === 'limit' && (lay.size.x > (o.maxX || 64) || lay.size.z > (o.maxZ || 64) || lay.size.y > (o.maxY || 64))) continue;
      lay.fits = true;
      return lay;
    }
    return o.mode === 'limit' ? { error: 'Bài quá dài so với khu vực này. Hãy tăng dài, rộng hoặc cao.' } : null;
  }

  // ---------------------------------------------------------------- simulator (verification)
  function simulate(lay) {
    const { cells } = lay;
    const get = (x, y, z) => cells.get(x + ',' + y + ',' + z);
    const DIR = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] };
    const NONSOLID = ['minecraft:redstone_wire', 'minecraft:repeater', 'minecraft:note_block', 'minecraft:stone_button', 'minecraft:glass', 'minecraft:glowstone', 'minecraft:redstone_torch'];
    const isSolid = (b) => b && !NONSOLID.includes(b.name);
    const hits = new Map();
    const times = new Map();
    const errors = [];
    const buckets = [];
    const done = { strong: new Set(), weak: new Set(), dust: new Set(), repin: new Set(), toff: new Set(), ton: new Set() };
    const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const push = (t, kind, x, y, z, extra) => { (buckets[t] || (buckets[t] = [])).push({ t, kind, x, y, z, extra }); };
    const hit = (id, t) => { if (!hits.has(id)) hits.set(id, []); hits.get(id).push(t); };
    push(0, 'strong', lay.start.x, lay.start.y, lay.start.z);
    let guard = 0;
    for (let bt = 0; bt < buckets.length; bt++) {
      const bucket = buckets[bt];
      if (!bucket) continue;
      for (let bi = 0; bi < bucket.length; bi++) {
        if (++guard > 5e6) { errors.push('loop'); break; }
        const e = bucket[bi];
        const { x, y, z, t } = e;
        const id = x + ',' + y + ',' + z;
        const b = get(x, y, z);
        if (done[e.kind].has(id)) continue; done[e.kind].add(id);
        if (e.kind === 'strong' || e.kind === 'weak') {
          for (const [dx, dy, dz] of N6) {
            const nb = get(x + dx, y + dy, z + dz);
            if (!nb) continue;
            const nid = (x + dx) + ',' + (y + dy) + ',' + (z + dz);
            if (nb.name === 'minecraft:note_block') hit(nid, t);
            if (nb.name === 'minecraft:redstone_wire' && e.kind === 'strong') push(t, 'dust', x + dx, y + dy, z + dz, 15);
            if (nb.name === 'minecraft:repeater' && dy === 0) { const f = DIR[nb.props.facing]; if (f[0] === -dx && f[2] === -dz) push(t, 'repin', x + dx, y, z + dz); }
            if (nb.name === 'minecraft:redstone_torch' && dy === 1) { if (nb.props.lit === 'true') push(t + 1, 'toff', x, y + 1, z); else errors.push('unlit torch on powered block ' + nid); }
          }
        } else if (e.kind === 'toff') {
          times.set(id, t);
          // the block above loses power -> a torch on top of it turns on
          const ab = get(x, y + 1, z), tt = get(x, y + 2, z);
          if (isSolid(ab) && tt && tt.name === 'minecraft:redstone_torch' && tt.props.lit === 'false') push(t + 1, 'ton', x, y + 2, z);
        } else if (e.kind === 'ton') {
          times.set(id, t);
          if (isSolid(get(x, y + 1, z))) push(t, 'strong', x, y + 1, z);
          for (const [dx, dy, dz] of N6) {
            if (dy !== 0) continue;
            const nb = get(x + dx, y, z + dz);
            if (nb && ['minecraft:redstone_wire', 'minecraft:repeater', 'minecraft:note_block'].includes(nb.name)) errors.push('torch next to component ' + id);
          }
        } else if (e.kind === 'dust') {
          if (!b || b.name !== 'minecraft:redstone_wire') continue;
          times.set(id, t);
          const s = e.extra; if (s <= 0) { errors.push('dust too long at ' + id); continue; }
          if (isSolid(get(x, y - 1, z))) push(t, 'weak', x, y - 1, z);
          const pr = b.props;
          for (const dn of ['north', 'south', 'east', 'west']) {
            if (pr[dn] !== 'side') continue;
            const [dx, , dz] = DIR[dn];
            const nb = get(x + dx, y, z + dz);
            if (!nb) continue;
            if (nb.name === 'minecraft:redstone_wire') push(t, 'dust', x + dx, y, z + dz, s - 1);
            else if (nb.name === 'minecraft:repeater') { const f = DIR[nb.props.facing]; if (f[0] === -dx && f[2] === -dz) push(t, 'repin', x + dx, y, z + dz); }
            else if (isSolid(nb)) push(t, 'weak', x + dx, y, z + dz);
            else if (nb.name === 'minecraft:note_block') hit((x + dx) + ',' + y + ',' + (z + dz), t);
          }
        } else if (e.kind === 'repin') {
          const f = DIR[b.props.facing];
          const ox = x - f[0], oz = z - f[2];
          const nb = get(ox, y, oz);
          const tt = t + Number(b.props.delay);
          times.set(id, tt);
          if (!nb) { errors.push('repeater into air ' + id); continue; }
          if (nb.name === 'minecraft:redstone_wire') push(tt, 'dust', ox, y, oz, 15);
          else if (nb.name === 'minecraft:repeater') { const g2 = DIR[nb.props.facing]; if (g2[0] === f[0] && g2[2] === f[2]) push(tt, 'repin', ox, y, oz); }
          else if (nb.name === 'minecraft:note_block') hit(ox + ',' + y + ',' + oz, tt);
          else if (isSolid(nb)) push(tt, 'strong', ox, y, oz);
        }
      }
    }
    // rest state: lit torches power the block above them; nothing sensitive may touch that block or the torch
    cells.forEach((b, kk) => {
      if (b.name !== 'minecraft:redstone_torch' || b.props.lit !== 'true') return;
      const [x, y, z] = kk.split(',').map(Number);
      for (const [dx, dy, dz] of N6) {
        if (dy === -1) continue;
        const nb = get(x + dx, y + dy, z + dz);
        if (nb && ['minecraft:redstone_wire', 'minecraft:repeater', 'minecraft:note_block'].includes(nb.name)) errors.push('lit torch touches component ' + kk);
      }
      for (const [dx, dy, dz] of N6) {
        const nb = get(x + dx, y + 1 + dy, z + dz);
        if (dy === -1) continue;
        if (nb && ['minecraft:redstone_wire', 'minecraft:repeater', 'minecraft:note_block'].includes(nb.name)) errors.push('block over lit torch touches component ' + kk);
      }
    });
    return { hits, errors, times };
  }

  function verify(lay, slots) {
    const sim = simulate(lay);
    const { hits, errors } = sim;
    let offset = null, bad = 0, missing = 0, multi = 0, blocked = 0;
    const sh = lay.shifts || [];
    for (const np of lay.notePos) {
      const id = np.x + ',' + np.y + ',' + np.z;
      const h = hits.get(id);
      if (!h || !h.length) { missing++; continue; }
      const uniq = [...new Set(h)];
      if (uniq.length > 1) multi++;
      const want = slots[np.slot].rt + (sh[np.slot] || 0);
      if (offset == null) offset = uniq[0] - want;
      if (uniq[0] - want !== offset) bad++;
      if (lay.cells.get(np.x + ',' + (np.y + 1) + ',' + np.z)) blocked++;
    }
    const placed = new Set(lay.notePos.map((np) => np.x + ',' + np.y + ',' + np.z));
    const extraHits = [...hits.keys()].filter((id) => !placed.has(id)).length;
    return { ok: !errors.length && !bad && !missing && !multi && !blocked && !extraHits, errors, bad, missing, multi, blocked, extraHits, offset, sim };
  }

  // ---------------------------------------------------------------- NBT writer
  class W {
    constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
    ensure(k) { if (this.n + k > this.buf.length) { let m = this.buf.length * 2; while (m < this.n + k) m *= 2; const nb = new Uint8Array(m); nb.set(this.buf.subarray(0, this.n)); this.buf = nb; } }
    u8(v) { this.ensure(1); this.buf[this.n++] = v & 255; }
    i16(v) { this.u8(v >> 8); this.u8(v); }
    i32(v) { this.u8(v >>> 24); this.u8(v >>> 16); this.u8(v >>> 8); this.u8(v); }
    str(s) { const b = new TextEncoder().encode(s); this.i16(b.length); this.bytes(b); }
    bytes(b) { this.ensure(b.length); this.buf.set(b, this.n); this.n += b.length; }
    out() { return this.buf.slice(0, this.n); }
  }
  // tagged values
  const T = {
    byte: (v) => ({ t: 1, v }), short: (v) => ({ t: 2, v }), int: (v) => ({ t: 3, v }),
    long: (hi, lo) => ({ t: 4, v: [hi, lo] }), bytes: (v) => ({ t: 7, v }), str: (v) => ({ t: 8, v }),
    list: (et, v) => ({ t: 9, et, v }), comp: (v) => ({ t: 10, v }), ints: (v) => ({ t: 11, v }), longs: (v) => ({ t: 12, v }),
  };
  function writePayload(w, tag) {
    switch (tag.t) {
      case 1: w.u8(tag.v); break;
      case 2: w.i16(tag.v); break;
      case 3: w.i32(tag.v); break;
      case 4: w.i32(tag.v[0]); w.i32(tag.v[1]); break;
      case 7: w.i32(tag.v.length); w.bytes(tag.v); break;
      case 8: w.str(tag.v); break;
      case 9: w.u8(tag.v.length ? tag.et : 0); w.i32(tag.v.length); tag.v.forEach((x) => writePayload(w, x)); break;
      case 10: for (const [k, x] of Object.entries(tag.v)) { w.u8(x.t); w.str(k); writePayload(w, x); } w.u8(0); break;
      case 11: w.i32(tag.v.length); tag.v.forEach((x) => w.i32(x)); break;
      case 12: w.i32(tag.v.length / 2); for (let i = 0; i < tag.v.length; i++) w.i32(tag.v[i]); break;
    }
  }
  function writeNbt(rootName, comp) { const w = new W(); w.u8(10); w.str(rootName); writePayload(w, comp); return w.out(); }

  // ---------------------------------------------------------------- exporters
  function stateString(b) {
    if (!b.props) return b.name;
    return b.name + '[' + Object.keys(b.props).sort().map((k) => k + '=' + b.props[k]).join(',') + ']';
  }

  function buildPalette(lay) {
    const pal = [{ name: 'minecraft:air', props: null }];
    const idx = new Map([['minecraft:air', 0]]);
    const { x: SX, y: SY, z: SZ } = lay.size;
    const data = new Uint32Array(SX * SY * SZ);
    lay.cells.forEach((b, kk) => {
      const [x, y, z] = kk.split(',').map(Number);
      const s = stateString(b);
      if (!idx.has(s)) { idx.set(s, pal.length); pal.push(b); }
      data[(y * SZ + z) * SX + x] = idx.get(s);
    });
    return { pal, data };
  }

  function toLitematic(lay, meta) {
    const { pal, data } = buildPalette(lay);
    const { x: SX, y: SY, z: SZ } = lay.size;
    const vol = SX * SY * SZ;
    const bits = Math.max(2, Math.ceil(Math.log2(pal.length)));
    const nLongs = Math.ceil(vol * bits / 64);
    const words = new Uint32Array(nLongs * 2); // [lo, hi] per long
    for (let i = 0; i < vol; i++) {
      const v = data[i]; if (!v) continue;
      const start = i * bits;
      for (let b = 0; b < bits; b++) {
        if ((v >> b) & 1) { const pos = start + b; const L = pos >>> 6, off = pos & 63; words[L * 2 + (off >= 32 ? 1 : 0)] |= (1 << (off & 31)) >>> 0; }
      }
    }
    const longs = new Array(nLongs * 2);
    for (let L = 0; L < nLongs; L++) { longs[L * 2] = words[L * 2 + 1] | 0; longs[L * 2 + 1] = words[L * 2] | 0; }
    const palTags = pal.map((b) => {
      const o = { Name: T.str(b.name) };
      if (b.props) { const pr = {}; Object.keys(b.props).sort().forEach((k) => { pr[k] = T.str(b.props[k]); }); o.Properties = T.comp(pr); }
      return T.comp(o);
    });
    const now = Date.now();
    const nowHi = Math.floor(now / 4294967296), nowLo = now >>> 0;
    const total = lay.cells.size;
    const v = T.comp({
      MinecraftDataVersion: T.int(meta.dataVersion),
      Version: T.int(meta.dataVersion >= 3837 ? 7 : 6),
      SubVersion: T.int(1),
      Metadata: T.comp({
        Name: T.str(meta.name || 'Note block song'), Author: T.str(meta.author || 'Note Block Song Builder'),
        Description: T.str(meta.description || ''), RegionCount: T.int(1),
        TotalBlocks: T.int(total), TotalVolume: T.int(vol),
        TimeCreated: T.long(nowHi, nowLo | 0), TimeModified: T.long(nowHi, nowLo | 0),
        EnclosingSize: T.comp({ x: T.int(SX), y: T.int(SY), z: T.int(SZ) }),
      }),
      Regions: T.comp({
        [meta.region || 'Song']: T.comp({
          Position: T.comp({ x: T.int(0), y: T.int(0), z: T.int(0) }),
          Size: T.comp({ x: T.int(SX), y: T.int(SY), z: T.int(SZ) }),
          BlockStatePalette: T.list(10, palTags),
          BlockStates: T.longs(longs),
          TileEntities: T.list(10, []), Entities: T.list(10, []),
          PendingBlockTicks: T.list(10, []), PendingFluidTicks: T.list(10, []),
        }),
      }),
    });
    return writeNbt('', v);
  }

  function toSchem(lay, meta) {
    const { pal, data } = buildPalette(lay);
    const { x: SX, y: SY, z: SZ } = lay.size;
    const palette = {};
    pal.forEach((b, i) => { palette[stateString(b)] = T.int(i); });
    const out = [];
    for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      let v = data[(y * SZ + z) * SX + x];
      while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
      out.push(v);
    }
    const v = T.comp({
      Version: T.int(2), DataVersion: T.int(meta.dataVersion),
      Width: T.short(SX), Height: T.short(SY), Length: T.short(SZ),
      Offset: T.ints([0, 0, 0]), PaletteMax: T.int(pal.length), Palette: T.comp(palette),
      BlockData: T.bytes(Uint8Array.from(out)), BlockEntities: T.list(10, []),
      Metadata: T.comp({ Name: T.str(meta.name || 'Note block song'), WEOffsetX: T.int(0), WEOffsetY: T.int(0), WEOffsetZ: T.int(0) }),
    });
    return writeNbt('Schematic', v);
  }

  const api = { INST, INST_ORDER, GM_FAMILY, parseMidi, parseNbs, bestOctave, outOfRangeCount, buildSlots, lanesNeeded, assignSlot, layout, autoLayout, packRows, geomInfo, simulate, verify, toLitematic, toSchem, stateString, FLOOR, LINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NB = api;
})(typeof window !== 'undefined' ? window : globalThis);
