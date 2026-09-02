import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { getInitials } from '../../lib/utils';

interface AvatarProps {
  photoURL?: string | null;
  name: string;
  size: number;
  textClassName?: string;
}

export function Avatar({
  photoURL,
  name,
  size,
  textClassName = 'text-brand-700 font-black',
}: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photoURL]);

  return (
    <View
      className="rounded-full bg-brand-100 items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {photoURL && !failed ? (
        <Image
          source={{ uri: photoURL }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text className={textClassName}>{getInitials(name)}</Text>
      )}
    </View>
  );
}
