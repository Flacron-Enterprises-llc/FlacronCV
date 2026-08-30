import React, { forwardRef, useState } from 'react';
import {
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isPassword?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, isPassword, className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <View className="mb-4">
        {label && (
          <Text className="text-sm font-medium text-stone-700 mb-1.5">{label}</Text>
        )}
        <View
          className={[
            'flex-row items-center rounded-xl border bg-white px-3',
            error ? 'border-red-400' : 'border-stone-200',
          ].join(' ')}
        >
          {leftIcon && <View className="mr-2">{leftIcon}</View>}
          <TextInput
            ref={ref}
            {...props}
            secureTextEntry={isPassword && !showPassword}
            className={[
              'flex-1 py-3 text-base text-stone-900',
              className ?? '',
            ].join(' ')}
            placeholderTextColor={colors.stone[400]}
          />
          {isPassword ? (
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="ml-2">
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.stone[400]}
              />
            </TouchableOpacity>
          ) : rightIcon ? (
            <View className="ml-2">{rightIcon}</View>
          ) : null}
        </View>
        {error ? (
          <Text className="mt-1 text-xs text-red-500">{error}</Text>
        ) : hint ? (
          <Text className="mt-1 text-xs text-stone-400">{hint}</Text>
        ) : null}
      </View>
    );
  },
);

Input.displayName = 'Input';
