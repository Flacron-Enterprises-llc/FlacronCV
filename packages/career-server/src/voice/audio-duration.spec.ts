import { detectAudioContainer, measureAudioDuration, opusPacketSamples } from './audio-duration';
import { mp4Fragmented, mp4Plain, oggOpus, webmOpus } from './audio-fixtures';

describe('measureAudioDuration', () => {
  it('reads Opus TOC frame sizes and counts (RFC 6716)', () => {
    expect(opusPacketSamples(Uint8Array.from([(19 << 3) | 0]))).toBe(960); // CELT 20 ms
    expect(opusPacketSamples(Uint8Array.from([(3 << 3) | 1]))).toBe(2 * 2880); // SILK 60 ms, two frames
    expect(opusPacketSamples(Uint8Array.from([(16 << 3) | 3, 4]))).toBe(4 * 120); // CELT 2.5 ms, four frames
    expect(opusPacketSamples(Uint8Array.from([(3 << 3) | 3, 3]))).toBe(0); // 180 ms is not a valid packet
    expect(opusPacketSamples(new Uint8Array())).toBe(0);
  });

  it('measures a MediaRecorder WebM with no Duration element from its Opus packets', () => {
    const result = measureAudioDuration(webmOpus(90));
    expect(result).toEqual({ container: 'webm', milliseconds: 90_000, source: 'opus_packets' });
  });

  it('ignores a forged WebM Duration header in favour of the audio itself', () => {
    expect(measureAudioDuration(webmOpus(30, { headerSeconds: 1 }))?.milliseconds).toBe(30_000);
  });

  it('falls back to block timecodes and the header for a non-Opus WebM track', () => {
    const blocks = measureAudioDuration(webmOpus(12, { codec: 'A_VORBIS' }));
    expect(blocks?.source).toBe('block_timecodes');
    expect(blocks?.milliseconds).toBe(11_980); // last block starts at 11.98 s
    const header = measureAudioDuration(webmOpus(12, { codec: 'A_VORBIS', headerSeconds: 20 }));
    expect(header).toEqual({ container: 'webm', milliseconds: 20_000, source: 'container_header' });
  });

  it('measures Ogg Opus by packets minus the pre-skip', () => {
    const result = measureAudioDuration(oggOpus(45));
    expect(result?.container).toBe('ogg');
    expect(result?.source).toBe('opus_packets');
    expect(Math.round((result?.milliseconds ?? 0) / 1000)).toBe(45);
  });

  it('measures fragmented (Safari) and plain MP4 from the sample tables', () => {
    const fragmented = measureAudioDuration(mp4Fragmented(20));
    expect(fragmented?.source).toBe('sample_table');
    expect(Math.round((fragmented?.milliseconds ?? 0) / 1000)).toBe(20);
    const plain = measureAudioDuration(mp4Plain(75));
    expect(Math.round((plain?.milliseconds ?? 0) / 1000)).toBe(75);
  });

  it('returns null for anything it cannot measure, never a guess', () => {
    expect(measureAudioDuration(Buffer.from('not audio at all'))).toBeNull();
    expect(detectAudioContainer(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(measureAudioDuration(webmOpus(5).subarray(0, 40))).toBeNull();
    expect(measureAudioDuration(Buffer.from('OggS'))).toBeNull();
  });

  it('keeps what it read when the final element is cut off', () => {
    const full = webmOpus(3);
    const cut = measureAudioDuration(full.subarray(0, full.length - 3));
    expect(cut?.milliseconds).toBeGreaterThan(2_900);
    expect(cut?.milliseconds).toBeLessThanOrEqual(3_000);
  });
});
