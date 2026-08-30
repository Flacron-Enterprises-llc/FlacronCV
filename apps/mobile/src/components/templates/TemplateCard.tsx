import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Template } from '../../types/template.types';
import { SubscriptionPlan } from '../../types/enums';
import { colors } from '../../theme/colors';

interface TemplateCardProps {
  template: Template;
  isSelected?: boolean;
  isLocked?: boolean;
  onSelect: () => void;
  onPreview?: () => void;
}

const tierClasses: Record<SubscriptionPlan, { bg: string; text: string; label: string }> = {
  [SubscriptionPlan.FREE]: { bg: 'bg-stone-100', text: 'text-stone-700', label: 'Free' },
  [SubscriptionPlan.PRO]: { bg: 'bg-brand-100', text: 'text-brand-700', label: 'Pro' },
  [SubscriptionPlan.ENTERPRISE]: { bg: 'bg-stone-100', text: 'text-chrome', label: 'Enterprise' },
};

export function TemplateCard({ template, isSelected, isLocked, onSelect, onPreview }: TemplateCardProps) {
  const tier = tierClasses[template.tier];

  return (
    <Pressable
      onPress={onSelect}
      className={[
        'rounded-2xl overflow-hidden border-2',
        isSelected ? 'border-brand-500' : 'border-stone-100',
      ].join(' ')}
    >
      {/* Template Thumbnail */}
      <View className="h-48 bg-stone-100 items-center justify-center relative">
        {template.thumbnailURL ? (
          <Image
            source={{ uri: template.thumbnailURL }}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <View className="items-center">
            <Ionicons name="document-text-outline" size={48} color={colors.stone[300]} />
            <Text className="text-stone-300 text-sm mt-2">{template.name}</Text>
          </View>
        )}

        {/* Tier Badge */}
        <View className={['absolute top-2 left-2 px-2 py-0.5 rounded-full', tier.bg].join(' ')}>
          <Text className={['text-xs font-bold', tier.text].join(' ')}>
            {tier.label}
          </Text>
        </View>

        {/* Lock Overlay */}
        {isLocked && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <View className="bg-white/90 rounded-full p-3">
              <Ionicons name="lock-closed" size={24} color={colors.chrome} />
            </View>
          </View>
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <View className="absolute top-2 right-2 w-7 h-7 rounded-full bg-brand-500 items-center justify-center">
            <Ionicons name="checkmark" size={16} color={colors.white} />
          </View>
        )}
      </View>

      {/* Template Info */}
      <View className="p-3 bg-white">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-stone-800">{template.name}</Text>
          {template.isFeatured && (
            <Ionicons name="star" size={14} color={colors.brand[600]} />
          )}
        </View>
        {template.description && (
          <Text className="text-stone-400 text-xs mt-0.5" numberOfLines={1}>
            {template.description}
          </Text>
        )}
        <View className="flex-row gap-1 mt-2">
          {template.colorSchemes.slice(0, 5).map((scheme, i) => (
            <View
              key={i}
              className="w-4 h-4 rounded-full border border-stone-200"
              style={{ backgroundColor: scheme.primary }}
            />
          ))}
        </View>
      </View>
    </Pressable>
  );
}
