import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { Template } from '../../types/template.types';
import { SubscriptionPlan } from '../../types/enums';
import { colors } from '../../theme/colors';
import { useT } from '../../i18n';
import { tierLabel } from '../../lib/cv-design';

interface TemplateCardProps {
  template: Template;
  isSelected?: boolean;
  isLocked?: boolean;
  onSelect: () => void;
  onPreview?: () => void;
}

const tierClasses: Record<SubscriptionPlan, { bg: string; text: string; tier: string }> = {
  [SubscriptionPlan.FREE]: { bg: 'bg-stone-100', text: 'text-stone-700', tier: 'free' },
  [SubscriptionPlan.PRO]: { bg: 'bg-brand-100', text: 'text-brand-700', tier: 'pro' },
  [SubscriptionPlan.ENTERPRISE]: { bg: 'bg-stone-100', text: 'text-chrome', tier: 'enterprise' },
};

const FALLBACK_TIER = { bg: 'bg-stone-100', text: 'text-stone-700', tier: 'pro' };

/** Storage thumbs are 800×480 top-of-page crops (width/height). */
const THUMB_ASPECT = 800 / 480;

/**
 * RN Image `resizeMode="cover"` always crops from the centre. That hides the
 * name/header on these stills. Size like CSS object-fit:cover, pin to the top.
 */
function TopCoverThumb({ uri }: { uri: string }) {
  const [box, setBox] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  let imgW = 0;
  let imgH = 0;
  if (box.w > 0 && box.h > 0) {
    if (box.w / box.h > THUMB_ASPECT) {
      imgW = box.w;
      imgH = box.w / THUMB_ASPECT;
    } else {
      imgH = box.h;
      imgW = box.h * THUMB_ASPECT;
    }
  }

  return (
    <View className="absolute inset-0 overflow-hidden" onLayout={onLayout}>
      {imgW > 0 ? (
        <Image
          source={{ uri }}
          style={{
            position: 'absolute',
            top: 0,
            start: (box.w - imgW) / 2,
            width: imgW,
            height: imgH,
          }}
          resizeMode="stretch"
        />
      ) : null}
    </View>
  );
}

export function TemplateCard({ template, isSelected, isLocked, onSelect, onPreview }: TemplateCardProps) {
  // API may send tiers mobile enum omits (e.g. career_accelerator) — never crash the grid.
  const tier = tierClasses[template.tier] ?? FALLBACK_TIER;
  const t = useT('templates');

  return (
    <View className="relative">
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityLabel={isLocked ? t('card.a11yLocked', { name: template.name }) : t('card.a11y', { name: template.name })}
      accessibilityState={{ selected: !!isSelected }}
      className={[
        'rounded-2xl overflow-hidden border-2',
        isSelected ? 'border-brand-500' : 'border-stone-100',
      ].join(' ')}
    >
      {/* Template Thumbnail */}
      <View className="h-48 bg-stone-100 relative overflow-hidden">
        {template.thumbnailURL ? (
          <TopCoverThumb uri={template.thumbnailURL} />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="document-text-outline" size={48} color={colors.stone[300]} />
            <Text className="text-stone-300 text-sm mt-2">{template.name}</Text>
          </View>
        )}

        {/* Tier Badge */}
        <View className={['absolute top-2 start-2 px-2 py-0.5 rounded-full', tier.bg].join(' ')}>
          <Text className={['text-xs font-bold', tier.text].join(' ')}>
            {tierLabel(tier.tier)}
          </Text>
        </View>

        {/* Lock Overlay */}
        {isLocked && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center">
            <View className="bg-surface/90 rounded-full p-3">
              <Ionicons name="lock-closed" size={24} color={colors.chrome} />
            </View>
          </View>
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <View className="absolute top-2 end-2 w-7 h-7 rounded-full bg-brand-500 items-center justify-center">
            <Ionicons name="checkmark" size={16} color={colors.white} />
          </View>
        )}
      </View>

      {/* Template Info */}
      <View className="p-3 bg-surface">
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
          {(template.colorSchemes ?? []).slice(0, 5).map((scheme, i) => (
            <View
              key={i}
              className="w-4 h-4 rounded-full border border-stone-200"
              style={{ backgroundColor: scheme.primary }}
            />
          ))}
        </View>
      </View>
    </Pressable>
      {/* Preview (web: "Preview" on hover). A sibling over the thumbnail, not nested in the card:
          a touchable groups its children for VoiceOver/TalkBack, so a nested button is unreachable. */}
      {onPreview ? (
        <Pressable
          onPress={onPreview}
          accessibilityRole="button"
          accessibilityLabel={t('card.preview', { name: template.name })}
          style={{ position: 'absolute', top: THUMB_HEIGHT - 44 - 8, end: 8 }}
          className="w-11 h-11 rounded-full bg-surface/95 items-center justify-center"
        >
          <Ionicons name="eye-outline" size={20} color={colors.stone[700]} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Height of the thumbnail area (`h-48`, 12rem = 192 dp); the preview button sits on its bottom edge. */
const THUMB_HEIGHT = 192;
