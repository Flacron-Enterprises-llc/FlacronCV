import React from 'react';
import {
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

export function Modal({ visible, onClose, title, children, size = 'md' }: ModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // NativeWind max-h-2/3 and max-h-5/6 are not in the default scale, so they
  // compiled to nothing. Even a real maxHeight would not expand this sheet:
  // ScrollView flex-1 inside a maxHeight-only parent gets 0 height, so the
  // sheet shrinks to handle + title. A definite height is the bound RN needs.
  const sheetHeight =
    size === 'sm' ? Math.min(256, windowHeight) :
    size === 'full' ? windowHeight :
    size === 'lg' ? windowHeight * 0.85 :
    windowHeight * 0.67;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        className="flex-1 bg-black/50 justify-end"
        onPress={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            className="bg-white rounded-t-3xl overflow-hidden"
            style={{ height: sheetHeight, paddingBottom: insets.bottom }}
            onPress={() => {}}
          >
            {/* Handle */}
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 rounded-full bg-stone-200" />
            </View>

            {title && (
              <View className="flex-row items-center justify-between px-5 py-3 border-b border-stone-100">
                <Text className="text-lg font-bold text-stone-900">{title}</Text>
                <Pressable onPress={onClose} className="p-1">
                  <Ionicons name="close" size={22} color={colors.stone[500]} />
                </Pressable>
              </View>
            )}

            <ScrollView
              className="flex-1 px-5 py-4"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </RNModal>
  );
}
