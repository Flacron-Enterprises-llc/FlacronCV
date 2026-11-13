import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TouchableOpacity, View } from 'react-native';
import { useCVPhoto } from '../../hooks/useCVPhoto';
import { useCVStore } from '../../store/cv-store';
import { colors } from '../../theme/colors';
import { useT } from '../../i18n';

/**
 * CV photo — same behaviour as the web editor: upload sets
 * personalInfo.photoURL to the Storage https URL and turns styling.showPhoto
 * on; remove clears the URL and turns showPhoto off. Saved with the next
 * Continue like every other editor change.
 */
export function CVPhotoPicker() {
  const photoURL = useCVStore((s) => s.cv?.personalInfo.photoURL ?? '');
  const updatePersonalInfo = useCVStore((s) => s.updatePersonalInfo);
  const updateStyling = useCVStore((s) => s.updateStyling);
  const { pickAndUpload, isUploading } = useCVPhoto();
  const t = useT('cvEditor');
  const tc = useT('common');
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [photoURL]);

  const hasPhoto = Boolean(photoURL);

  const onPick = async () => {
    setError(null);
    const result = await pickAndUpload();
    switch (result.status) {
      case 'uploaded':
        updatePersonalInfo('photoURL', result.url);
        updateStyling('showPhoto', true);
        return;
      case 'permission-denied':
        Alert.alert(t('photo.deniedTitle'), t('photo.deniedBody'));
        return;
      case 'error':
        setError(result.message);
        Alert.alert(t('photo.updateFailedTitle'), result.message);
        return;
      default:
        return;
    }
  };

  const onRemove = () => {
    Alert.alert(t('photo.remove'), t('photo.removeBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('remove'),
        style: 'destructive',
        onPress: () => {
          setError(null);
          updatePersonalInfo('photoURL', '');
          updateStyling('showPhoto', false);
        },
      },
    ]);
  };

  return (
    <View className="flex-row items-center mb-5">
      <TouchableOpacity
        onPress={() => void onPick()}
        disabled={isUploading}
        accessibilityRole="button"
        accessibilityLabel={hasPhoto ? t('photo.change') : t('photo.upload')}
        accessibilityState={{ disabled: isUploading, busy: isUploading }}
        className="w-20 h-20 rounded-full overflow-hidden bg-stone-100 border-2 border-dashed border-stone-300 items-center justify-center"
      >
        {hasPhoto && !imageFailed ? (
          <Image
            source={{ uri: photoURL as string }}
            className="w-full h-full"
            resizeMode="cover"
            onError={() => setImageFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Ionicons name="person-outline" size={30} color={colors.stone[400]} />
        )}
        {isUploading && (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </TouchableOpacity>

      <View className="flex-1 ms-4">
        <View className="flex-row flex-wrap items-center">
          <TouchableOpacity
            onPress={() => void onPick()}
            disabled={isUploading}
            accessibilityRole="button"
            className="justify-center me-4"
            style={{ minHeight: 44 }}
          >
            <Text className="text-brand-600 font-semibold">
              {isUploading ? t('photo.uploading') : hasPhoto ? t('photo.change') : t('photo.upload')}
            </Text>
          </TouchableOpacity>
          {hasPhoto && !isUploading && (
            <TouchableOpacity
              onPress={onRemove}
              accessibilityRole="button"
              className="justify-center"
              style={{ minHeight: 44 }}
            >
              <Text className="text-red-500 font-semibold">{t('photo.remove')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text className="text-xs text-stone-500">{t('photo.hint')}</Text>
        {error && (
          <Text className="text-xs text-red-500 mt-1" accessibilityRole="alert">
            {error}
          </Text>
        )}
      </View>
    </View>
  );
}
