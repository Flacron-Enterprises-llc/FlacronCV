/**
 * CV17: a voice take is now real recorded audio.
 *
 * The browser uploads the MediaRecorder file; the server measures its length
 * from the container (`measured_milliseconds`, `duration_source`) and meters
 * that, never a client-reported number. The audio sits in private object
 * storage under `audio_object_key`; "Remove recording" deletes the object and
 * clears the key while the summary and transcript stay.
 *
 * `transcript_source` says where the words came from: typed by the person,
 * produced by the transcription provider, or still missing ('pending') when
 * no provider is connected and nothing has been typed yet.
 *
 * Additive only; existing rows were typed transcripts with a timer duration.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE voice_audio_records
      ADD COLUMN audio_object_key text,
      ADD COLUMN audio_content_type text,
      ADD COLUMN audio_size_bytes integer CHECK (audio_size_bytes IS NULL OR audio_size_bytes > 0),
      ADD COLUMN measured_milliseconds integer CHECK (measured_milliseconds IS NULL OR measured_milliseconds > 0),
      ADD COLUMN duration_source text,
      ADD COLUMN transcript_source text NOT NULL DEFAULT 'typed'
        CHECK (transcript_source IN ('typed', 'transcribed', 'pending'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE voice_audio_records
      DROP COLUMN transcript_source,
      DROP COLUMN duration_source,
      DROP COLUMN measured_milliseconds,
      DROP COLUMN audio_size_bytes,
      DROP COLUMN audio_content_type,
      DROP COLUMN audio_object_key;
  `);
};
