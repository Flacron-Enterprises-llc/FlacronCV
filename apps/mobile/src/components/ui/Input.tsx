import React, { forwardRef, useState } from 'react';
import {
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { colors } from '../../theme/colors';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isPassword?: boolean;
  /** Icon shown before the label (auth forms). */
  labelIcon?: React.ComponentProps<typeof Ionicons>['name'];
  /** 'soft': taller, fully rounded, tinted field (auth forms). Default keeps the app-wide style. */
  variant?: 'default' | 'soft';
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, isPassword, labelIcon, variant = 'default', className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [focused, setFocused] = useState(false);
    const soft = variant === 'soft';
    const tc = useT('common');

    return (
      <View className="mb-4">
        {label && (
          <View className={soft ? 'flex-row items-center mb-2' : ''}>
            {labelIcon ? (
              <Ionicons name={labelIcon} size={18} color={colors.ink} style={{ marginEnd: 8 }} />
            ) : null}
            <Text className={soft ? 'text-[15px] font-bold text-ink' : 'text-sm font-medium text-stone-700 mb-1.5'}>{label}</Text>
          </View>
        )}
        <View
          className={[
            'flex-row items-center border',
            soft ? 'rounded-2xl bg-stone-50 px-4 min-h-[52px]' : 'rounded-xl bg-surface px-3',
            error ? 'border-red-400' : soft && focused ? 'border-brand-500' : 'border-stone-200',
          ].join(' ')}
        >
          {leftIcon && <View className="me-2">{leftIcon}</View>}
          <TextInput
            ref={ref}
            {...props}
            onFocus={(e) => {
              setFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              props.onBlur?.(e);
            }}
            secureTextEntry={isPassword && !showPassword}
            className={[
              'flex-1 py-3 text-base text-stone-900',
              className ?? '',
            ].join(' ')}
            placeholderTextColor={colors.stone[400]}
          />
          {isPassword ? (
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              className="ms-2 h-11 w-11 -me-2 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={showPassword ? tc('hidePassword') : tc('showPassword')}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.stone[400]}
              />
            </TouchableOpacity>
          ) : rightIcon ? (
            <View className="ms-2">{rightIcon}</View>
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
