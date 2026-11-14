/**
 * Server-side duration of a recorded practice take, read from the audio
 * itself so the voice meter never trusts a duration the browser reports.
 *
 * Dependency-free on purpose: the formats browsers' MediaRecorder produces
 * are small to walk.
 *
 * - WebM/Matroska (Chrome, Edge, Firefox): Opus packets are counted from
 *   their TOC byte (RFC 6716 §3.1), which is the decoded length of the audio
 *   whatever the container headers claim. Chrome omits the Segment Duration
 *   and Firefox may write it, so headers and block timecodes are only used
 *   for a non-Opus codec.
 * - Ogg Opus (Firefox `audio/ogg`): the same packet count, minus the
 *   OpusHead pre-skip; the last granule position is the fallback.
 * - MP4 (Safari `audio/mp4`): the sample-duration tables (`stts`, or `trun`
 *   in fragmented files with `tfhd`/`trex` defaults), then `mdhd`.
 *
 * Returns null when no duration can be established. The caller refuses such
 * a file before anything is charged, which is the conservative choice: we
 * never bill a guess.
 */

export type VoiceAudioContainer = 'webm' | 'ogg' | 'mp4';

export interface AudioDuration {
  container: VoiceAudioContainer;
  /** Exact measured length in milliseconds. */
  milliseconds: number;
  /** How the length was established, for the record and for support. */
  source: 'opus_packets' | 'granule' | 'container_header' | 'block_timecodes' | 'sample_table';
}

const OPUS_RATE = 48_000;

/** Sniffs the container from the first bytes; the declared Content-Type must agree (checked by the caller). */
export function detectAudioContainer(bytes: Uint8Array): VoiceAudioContainer | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') return 'ogg';
  if (bytes.length >= 8 && ['ftyp', 'moov', 'moof', 'free', 'skip', 'wide', 'mdat', 'styp'].includes(ascii(bytes, 4, 8))) return 'mp4';
  return null;
}

export function measureAudioDuration(bytes: Uint8Array): AudioDuration | null {
  const container = detectAudioContainer(bytes);
  try {
    if (container === 'webm') return webmDuration(bytes);
    if (container === 'ogg') return oggDuration(bytes);
    if (container === 'mp4') return mp4Duration(bytes);
  } catch {
    // A malformed file is treated like an unreadable one: no duration, nothing charged.
    return null;
  }
  return null;
}

/** Samples at 48 kHz in one Opus packet, from its TOC byte; 0 for an empty or invalid packet. */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  let frame: number; // samples per frame at 48 kHz
  if (config < 12) frame = [480, 960, 1920, 2880][config % 4];
  else if (config < 16) frame = [480, 960][config % 2];
  else frame = [120, 240, 480, 960][config % 4];
  const code = toc & 0x03;
  let count: number;
  if (code === 0) count = 1;
  else if (code === 1 || code === 2) count = 2;
  else {
    if (packet.length < 2) return 0;
    count = packet[1] & 0x3f;
  }
  const samples = frame * count;
  // A packet never holds more than 120 ms (RFC 6716 §3.2.5); anything else is not Opus audio.
  return samples > 5760 ? 0 : samples;
}

// ---------------------------------------------------------------- WebM / EBML

const EBML_MASTER = new Set([
  0x18538067, // Segment
  0x1549a966, // Info
  0x1654ae6b, // Tracks
  0xae, // TrackEntry
  0x1f43b675, // Cluster
  0xa0, // BlockGroup
]);

function readVint(bytes: Uint8Array, pos: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  if (pos >= bytes.length) return null;
  const first = bytes[pos];
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) {
    length += 1;
    mask >>= 1;
  }
  if (length > 8 || pos + length > bytes.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + bytes[pos + i];
    if (bytes[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readUint(bytes: Uint8Array, pos: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i += 1) value = value * 256 + bytes[pos + i];
  return value;
}

function readFloat(bytes: Uint8Array, pos: number, size: number): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset + pos, size);
  if (size === 4) return view.getFloat32(0);
  if (size === 8) return view.getFloat64(0);
  return null;
}

function webmDuration(bytes: Uint8Array): AudioDuration | null {
  let pos = 0;
  let timecodeScale = 1_000_000; // ns per tick, Matroska default
  let headerDuration: number | null = null; // ticks
  let clusterTimecode = 0;
  let lastBlockEnd = 0; // ticks
  let pendingBlockStart: number | null = null;
  let currentTrack: { number: number | null; codec: string | null } | null = null;
  const tracks: Array<{ number: number | null; codec: string | null }> = [];
  let opusTrack: number | null = null;
  let opusSamples = 0;
  let opusPackets = 0;

  while (pos < bytes.length) {
    const id = readVint(bytes, pos, true);
    if (!id) break;
    const size = readVint(bytes, pos + id.length, false);
    if (!size) break;
    const start = pos + id.length + size.length;
    if (id.value === 0xae) {
      currentTrack = { number: null, codec: null };
      tracks.push(currentTrack);
    }
    if (id.value === 0x1f43b675 && opusTrack === null) {
      opusTrack = tracks.find((track) => track.codec === 'A_OPUS')?.number ?? null;
    }
    if (EBML_MASTER.has(id.value)) {
      // Step inside (works for MediaRecorder's unknown-size Segment and Cluster too).
      pos = start;
      continue;
    }
    if (size.unknown) return null;
    const end = start + size.value;
    if (end > bytes.length) {
      // A truncated final element: keep what was read before it.
      break;
    }
    switch (id.value) {
      case 0x2ad7b1:
        timecodeScale = readUint(bytes, start, size.value) || timecodeScale;
        break;
      case 0x4489:
        headerDuration = readFloat(bytes, start, size.value);
        break;
      case 0xd7:
        if (currentTrack) currentTrack.number = readUint(bytes, start, size.value);
        break;
      case 0x86:
        if (currentTrack) currentTrack.codec = ascii(bytes, start, end).replace(/\0+$/, '');
        break;
      case 0xe7:
        clusterTimecode = readUint(bytes, start, size.value);
        break;
      case 0xa3: // SimpleBlock
      case 0xa1: {
        // Block
        const block = parseBlock(bytes, start, end);
        if (block) {
          const at = clusterTimecode + block.relative;
          lastBlockEnd = Math.max(lastBlockEnd, at);
          pendingBlockStart = id.value === 0xa1 ? at : null;
          if (opusTrack !== null && block.track === opusTrack) {
            for (const frame of block.frames) {
              opusSamples += opusPacketSamples(frame);
              opusPackets += 1;
            }
          }
        }
        break;
      }
      case 0x9b: // BlockDuration
        if (pendingBlockStart !== null) lastBlockEnd = Math.max(lastBlockEnd, pendingBlockStart + readUint(bytes, start, size.value));
        break;
      default:
        break;
    }
    pos = end;
  }

  if (opusPackets > 0 && opusSamples > 0) {
    return { container: 'webm', milliseconds: (opusSamples * 1000) / OPUS_RATE, source: 'opus_packets' };
  }
  const tickMs = timecodeScale / 1_000_000;
  const fromHeader = headerDuration !== null && Number.isFinite(headerDuration) && headerDuration > 0 ? headerDuration * tickMs : 0;
  const fromBlocks = lastBlockEnd * tickMs;
  if (fromHeader <= 0 && fromBlocks <= 0) return null;
  return fromBlocks >= fromHeader
    ? { container: 'webm', milliseconds: fromBlocks, source: 'block_timecodes' }
    : { container: 'webm', milliseconds: fromHeader, source: 'container_header' };
}

function parseBlock(bytes: Uint8Array, start: number, end: number): { track: number; relative: number; frames: Uint8Array[] } | null {
  const track = readVint(bytes, start, false);
  if (!track || start + track.length + 3 > end) return null;
  let pos = start + track.length;
  const raw = (bytes[pos] << 8) | bytes[pos + 1];
  const relative = raw & 0x8000 ? raw - 0x10000 : raw;
  const flags = bytes[pos + 2];
  pos += 3;
  const lacing = (flags >> 1) & 0x03;
  if (lacing === 0) return { track: track.value, relative, frames: [bytes.subarray(pos, end)] };
  const count = bytes[pos] + 1;
  pos += 1;
  const sizes: number[] = [];
  if (lacing === 1) {
    // Xiph lacing
    for (let i = 0; i < count - 1; i += 1) {
      let value = 0;
      while (pos < end) {
        const b = bytes[pos++];
        value += b;
        if (b !== 0xff) break;
      }
      sizes.push(value);
    }
  } else if (lacing === 3) {
    // EBML lacing: first size as a vint, then signed differences.
    const first = readVint(bytes, pos, false);
    if (!first) return null;
    pos += first.length;
    sizes.push(first.value);
    for (let i = 1; i < count - 1; i += 1) {
      const diff = readVint(bytes, pos, false);
      if (!diff) return null;
      pos += diff.length;
      const bias = 2 ** (7 * diff.length - 1) - 1;
      sizes.push(sizes[i - 1] + diff.value - bias);
    }
  } else {
    // Fixed-size lacing
    const each = Math.floor((end - pos) / count);
    for (let i = 0; i < count - 1; i += 1) sizes.push(each);
  }
  const frames: Uint8Array[] = [];
  for (const size of sizes) {
    if (size < 0 || pos + size > end) return null;
    frames.push(bytes.subarray(pos, pos + size));
    pos += size;
  }
  frames.push(bytes.subarray(pos, end));
  return { track: track.value, relative, frames };
}

// ---------------------------------------------------------------- Ogg

function oggDuration(bytes: Uint8Array): AudioDuration | null {
  let pos = 0;
  let packet: Uint8Array[] = [];
  let packetIndex = 0;
  let preSkip = 0;
  let isOpus = false;
  let samples = 0;
  let lastGranule = -1;
  while (pos + 27 <= bytes.length && ascii(bytes, pos, pos + 4) === 'OggS') {
    const view = new DataView(bytes.buffer, bytes.byteOffset + pos, 27);
    const granuleLow = view.getUint32(6, true);
    const granuleHigh = view.getUint32(10, true);
    const segments = bytes[pos + 26];
    const tableEnd = pos + 27 + segments;
    if (tableEnd > bytes.length) break;
    let dataPos = tableEnd;
    for (let i = 0; i < segments; i += 1) {
      const lace = bytes[pos + 27 + i];
      if (dataPos + lace > bytes.length) return finishOgg(isOpus, samples, preSkip, lastGranule);
      packet.push(bytes.subarray(dataPos, dataPos + lace));
      dataPos += lace;
      if (lace < 255) {
        const data = concat(packet);
        packet = [];
        if (packetIndex === 0) {
          isOpus = ascii(data, 0, 8) === 'OpusHead';
          if (isOpus && data.length >= 12) preSkip = data[10] | (data[11] << 8);
        } else if (packetIndex > 1 && isOpus) {
          samples += opusPacketSamples(data);
        }
        packetIndex += 1;
      }
    }
    // -1 (all ones) means "no packet ends on this page".
    if (!(granuleLow === 0xffffffff && granuleHigh === 0xffffffff)) lastGranule = granuleHigh * 2 ** 32 + granuleLow;
    pos = dataPos;
  }
  return finishOgg(isOpus, samples, preSkip, lastGranule);
}

function finishOgg(isOpus: boolean, samples: number, preSkip: number, lastGranule: number): AudioDuration | null {
  if (!isOpus) return null;
  const fromPackets = samples - preSkip;
  if (fromPackets > 0) return { container: 'ogg', milliseconds: (fromPackets * 1000) / OPUS_RATE, source: 'opus_packets' };
  const fromGranule = lastGranule - preSkip;
  if (fromGranule > 0) return { container: 'ogg', milliseconds: (fromGranule * 1000) / OPUS_RATE, source: 'granule' };
  return null;
}

// ---------------------------------------------------------------- MP4

const MP4_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'moof', 'traf', 'mvex']);

function mp4Duration(bytes: Uint8Array): AudioDuration | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let timescale = 0;
  let mdhdDuration = 0;
  let sttsTotal = 0;
  let fragmentTotal = 0;
  let trexDefault = 0;
  let tfhdDefault = 0;

  const walk = (from: number, to: number): void => {
    let pos = from;
    while (pos + 8 <= to) {
      let size = view.getUint32(pos);
      const type = ascii(bytes, pos + 4, pos + 8);
      let header = 8;
      if (size === 1) {
        if (pos + 16 > to) return;
        size = view.getUint32(pos + 8) * 2 ** 32 + view.getUint32(pos + 12);
        header = 16;
      } else if (size === 0) {
        size = to - pos;
      }
      if (size < header) return;
      const end = Math.min(pos + size, to);
      const body = pos + header;
      if (MP4_CONTAINERS.has(type)) {
        if (type === 'traf') tfhdDefault = 0;
        walk(body, end);
      } else if (type === 'mdhd' && timescale === 0 && body + 4 <= end) {
        const version = bytes[body];
        if (version === 1 && body + 32 <= end) {
          timescale = view.getUint32(body + 20);
          mdhdDuration = view.getUint32(body + 24) * 2 ** 32 + view.getUint32(body + 28);
        } else if (body + 24 <= end) {
          timescale = view.getUint32(body + 12);
          mdhdDuration = view.getUint32(body + 16);
        }
      } else if (type === 'stts' && body + 8 <= end) {
        const entries = view.getUint32(body + 4);
        for (let i = 0; i < entries && body + 8 + i * 8 + 8 <= end; i += 1) {
          sttsTotal += view.getUint32(body + 8 + i * 8) * view.getUint32(body + 12 + i * 8);
        }
      } else if (type === 'trex' && body + 16 <= end) {
        trexDefault = view.getUint32(body + 12);
      } else if (type === 'tfhd' && body + 8 <= end) {
        const flags = view.getUint32(body) & 0xffffff;
        let at = body + 8;
        if (flags & 0x01) at += 8;
        if (flags & 0x02) at += 4;
        if (flags & 0x08 && at + 4 <= end) tfhdDefault = view.getUint32(at);
      } else if (type === 'trun' && body + 8 <= end) {
        const flags = view.getUint32(body) & 0xffffff;
        const count = view.getUint32(body + 4);
        let at = body + 8;
        if (flags & 0x01) at += 4;
        if (flags & 0x04) at += 4;
        const per = [0x100, 0x200, 0x400, 0x800].filter((bit) => flags & bit).length * 4;
        const fallback = tfhdDefault || trexDefault;
        for (let i = 0; i < count; i += 1) {
          if (flags & 0x100) {
            if (at + 4 > end) break;
            fragmentTotal += view.getUint32(at);
          } else {
            fragmentTotal += fallback;
          }
          at += per;
        }
      }
      pos = end;
    }
  };
  walk(0, bytes.length);
  if (timescale <= 0) return null;
  const units = fragmentTotal > 0 ? fragmentTotal : sttsTotal > 0 ? sttsTotal : mdhdDuration;
  if (units <= 0) return null;
  return { container: 'mp4', milliseconds: (units * 1000) / timescale, source: 'sample_table' };
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < Math.min(end, bytes.length); i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}
