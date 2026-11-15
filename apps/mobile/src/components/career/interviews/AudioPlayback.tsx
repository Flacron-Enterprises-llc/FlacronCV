import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { clock } from '../../../lib/career/voice';
import { useT } from '../../../i18n';
import { colors } from '../../../theme/colors';

/**
 * Plays one take: a local file before it is uploaded, or the five-minute
 * link to a stored take. Play/stop with the position; nothing is uploaded.
 */
export function AudioPlayback({ uri, label, autoPlay = false }: { uri: string; label: string; autoPlay?: boolean }) {
  const t = useT('careerInterviews.voice');
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    // Play through the speaker even when the phone is on silent: the person asked to listen.
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
    if (autoPlay) player.play();
  }, [player, autoPlay]);

  useEffect(() => {
    // At the end, rewind so the next tap plays from the start.
    if (status.didJustFinish) void player.seekTo(0).catch(() => undefined);
  }, [status.didJustFinish, player]);

  const playing = status.playing;
  const toggle = () => {
    if (playing) {
      player.pause();
    } else {
      if (status.duration > 0 && status.currentTime >= status.duration) void player.seekTo(0).catch(() => undefined);
      player.play();
    }
  };

  return (
    <View className="flex-row items-center bg-stone-100 rounded-xl p-2 mt-3">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? t('stopPlayback') : label}
        accessibilityState={{ busy: !status.isLoaded }}
        className="w-11 h-11 rounded-full bg-brand-600 items-center justify-center"
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#ffffff" />
      </Pressable>
      <Text className="ms-3 text-stone-700 text-sm flex-1" numberOfLines={2}>
        {label}
      </Text>
      <Text className="text-stone-500 text-xs ms-2" accessibilityElementsHidden importantForAccessibility="no">
        {`${clock(status.currentTime)} / ${clock(status.duration)}`}
      </Text>
      {!status.isLoaded ? <Ionicons name="hourglass-outline" size={14} color={colors.stone[400]} style={{ marginStart: 6 }} /> : null}
    </View>
  );
}
