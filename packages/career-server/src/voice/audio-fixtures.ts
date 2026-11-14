/**
 * Tiny, structurally valid recordings for tests: the containers browsers'
 * MediaRecorder writes, filled with silent 20 ms Opus packets (or AAC-sized
 * samples for MP4). Test-only; not exported from the package.
 */

const OPUS_20MS_TOC = (19 << 3) | 0; // CELT-only, 20 ms, one frame

function bytes(...parts: Array<number[] | Uint8Array | Buffer>): Buffer {
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

// ---------------------------------------------------------------- WebM

function ebmlId(id: number): number[] {
  const out: number[] = [];
  let value = id;
  while (value > 0) {
    out.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return out;
}

function ebmlSize(size: number): number[] {
  // Always the 8-byte form; simple and valid.
  const out = [0x01];
  for (let shift = 6; shift >= 0; shift -= 1) out.push(Math.floor(size / 2 ** (8 * shift)) & 0xff);
  return out;
}

const UNKNOWN_SIZE = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

function el(id: number, body: Buffer | number[]): Buffer {
  const content = Buffer.from(body);
  return bytes(ebmlId(id), ebmlSize(content.length), content);
}

function uintBody(value: number, length = 4): number[] {
  const out: number[] = [];
  for (let i = length - 1; i >= 0; i -= 1) out.push(Math.floor(value / 2 ** (8 * i)) & 0xff);
  return out;
}

/**
 * A MediaRecorder-style WebM: unknown-size Segment and Clusters, no Duration
 * unless `headerSeconds` is given (Chrome writes none; a forged one is used
 * to prove the packets win).
 */
export function webmOpus(seconds: number, options: { headerSeconds?: number; codec?: string } = {}): Buffer {
  const header = el(0x1a45dfa3, bytes(el(0x4282, Buffer.from('webm'))));
  const infoParts = [el(0x2ad7b1, uintBody(1_000_000, 3))];
  if (options.headerSeconds !== undefined) {
    const duration = Buffer.alloc(8);
    duration.writeDoubleBE(options.headerSeconds * 1000);
    infoParts.push(el(0x4489, duration));
  }
  const info = el(0x1549a966, bytes(...infoParts));
  const tracks = el(
    0x1654ae6b,
    el(0xae, bytes(el(0xd7, [1]), el(0x86, Buffer.from(options.codec ?? 'A_OPUS')))),
  );
  const clusters: Buffer[] = [];
  const packets = Math.round(seconds * 50);
  for (let second = 0; second * 50 < packets; second += 1) {
    const blocks: Buffer[] = [el(0xe7, uintBody(second * 1000, 4))];
    for (let i = 0; i < 50 && second * 50 + i < packets; i += 1) {
      const relative = i * 20;
      blocks.push(el(0xa3, [0x81, (relative >> 8) & 0xff, relative & 0xff, 0x80, OPUS_20MS_TOC, 0xff, 0xfe]));
    }
    clusters.push(bytes(ebmlId(0x1f43b675), UNKNOWN_SIZE, ...blocks));
  }
  return bytes(header, ebmlId(0x18538067), UNKNOWN_SIZE, info, tracks, ...clusters);
}

// ---------------------------------------------------------------- Ogg

function oggPage(packets: Buffer[], granule: number, sequence: number, flags: number): Buffer {
  const lacing: number[] = [];
  for (const packet of packets) {
    let left = packet.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  const head = Buffer.alloc(27);
  head.write('OggS', 0, 'latin1');
  head[4] = 0;
  head[5] = flags;
  head.writeUInt32LE(granule % 2 ** 32, 6);
  head.writeUInt32LE(Math.floor(granule / 2 ** 32), 10);
  head.writeUInt32LE(0x1234, 14);
  head.writeUInt32LE(sequence, 18);
  head.writeUInt32LE(0, 22); // CRC is not checked by the reader
  head[26] = lacing.length;
  return bytes(head, lacing, ...packets);
}

export function oggOpus(seconds: number, options: { preSkip?: number } = {}): Buffer {
  const preSkip = options.preSkip ?? 312;
  const opusHead = Buffer.alloc(19);
  opusHead.write('OpusHead', 0, 'latin1');
  opusHead[8] = 1;
  opusHead[9] = 1;
  opusHead.writeUInt16LE(preSkip, 10);
  opusHead.writeUInt32LE(48_000, 12);
  const tags = bytes(Buffer.from('OpusTags', 'latin1'), [0, 0, 0, 0, 0, 0, 0, 0]);
  const pages = [oggPage([opusHead], 0, 0, 0x02), oggPage([tags], 0, 1, 0)];
  const packets = Math.round(seconds * 50) + Math.ceil(preSkip / 960);
  let samples = 0;
  for (let i = 0; i < packets; i += 50) {
    const batch: Buffer[] = [];
    for (let j = i; j < Math.min(packets, i + 50); j += 1) batch.push(Buffer.from([OPUS_20MS_TOC, 0xff, 0xfe]));
    samples += batch.length * 960;
    pages.push(oggPage(batch, samples, pages.length, i + 50 >= packets ? 0x04 : 0));
  }
  return bytes(...pages);
}

// ---------------------------------------------------------------- MP4

function box(type: string, ...body: Array<number[] | Buffer>): Buffer {
  const content = bytes(...body);
  return bytes(u32be(content.length + 8), Buffer.from(type, 'latin1'), content);
}

function mdhd(timescale: number, duration: number): Buffer {
  return box('mdhd', [0, 0, 0, 0], u32be(0), u32be(0), u32be(timescale), u32be(duration), [0x55, 0xc4, 0, 0]);
}

/** Safari-style fragmented MP4: empty `moov` (duration 0) and `moof` fragments of 1024-sample AAC frames. */
export function mp4Fragmented(seconds: number, timescale = 48_000): Buffer {
  const samples = Math.round((seconds * timescale) / 1024);
  const ftyp = box('ftyp', Buffer.from('iso5', 'latin1'), u32be(512), Buffer.from('iso5mp41', 'latin1'));
  const moov = box(
    'moov',
    box('trak', box('mdia', mdhd(timescale, 0))),
    box('mvex', box('trex', [0, 0, 0, 0], u32be(1), u32be(1), u32be(1024), u32be(0), u32be(0))),
  );
  const fragments: Buffer[] = [];
  for (let start = 0; start < samples; start += 100) {
    const count = Math.min(100, samples - start);
    const tfhd = box('tfhd', [0, 0x02, 0, 0], u32be(1)); // default-base-is-moof; no default duration
    const trunEntries: number[] = [];
    for (let i = 0; i < count; i += 1) trunEntries.push(...u32be(1024), ...u32be(4));
    const trun = box('trun', [0, 0, 0x03, 0x00], u32be(count), trunEntries); // duration + size per sample
    fragments.push(box('moof', box('traf', tfhd, trun)), box('mdat', Buffer.alloc(count * 4)));
  }
  return bytes(ftyp, moov, ...fragments);
}

/** A plain MP4 whose `stts` table carries the sample durations. */
export function mp4Plain(seconds: number, timescale = 44_100): Buffer {
  const samples = Math.round((seconds * timescale) / 1024);
  const ftyp = box('ftyp', Buffer.from('M4A ', 'latin1'), u32be(0));
  const stts = box('stts', [0, 0, 0, 0], u32be(1), u32be(samples), u32be(1024));
  const moov = box('moov', box('trak', box('mdia', mdhd(timescale, samples * 1024), box('minf', box('stbl', stts)))));
  return bytes(ftyp, moov, box('mdat', Buffer.alloc(16)));
}
