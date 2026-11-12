import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { PAID_UPGRADES_ENABLED } from '../../config/paid-upgrades';
import { layoutLabel, templateStyling } from '../../lib/cv-design';
import { colors } from '../../theme/colors';
import { Template } from '../../types/template.types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/** Full-page stills in storage are A4 portrait renders. */
const PAGE_ASPECT = 210 / 297;

export interface TemplatePreviewModalProps {
  template: Template | null;
  onClose: () => void;
  /** False when the viewer's plan does not include this template. */
  userCanAccess: boolean;
  /** Text shown instead of the upgrade CTA when paid upgrades are off. */
  lockedMessage?: string;
  onSelect: () => void;
  onUpgrade?: () => void;
  /** Overrides the primary button label (e.g. on the Design screen). */
  selectLabel?: string;
  /** Overrides the secondary (close) button label. */
  closeLabel?: string;
}

function tierName(tier: string): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1).replace(/_/g, ' ') : 'Pro';
}

/**
 * Mobile counterpart of the website's `TemplatePreviewModal`: the template's
 * full-page still (sample data, read-only), tier, accent colour and layout,
 * then Select / Upgrade. The web renders the layout live; the app shows the
 * same page as the stored preview image.
 */
export function TemplatePreviewModal({
  template,
  onClose,
  userCanAccess,
  lockedMessage,
  onSelect,
  onUpgrade,
  selectLabel,
  closeLabel,
}: TemplatePreviewModalProps) {
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const uri = template ? template.previewImages?.[0] || template.thumbnailURL : undefined;

  useEffect(() => {
    setImageState('loading');
  }, [uri]);

  if (!template) return null;

  const isPro = String(template.tier) !== 'free';
  const tier = tierName(template.tier);
  const locked = isPro && !userCanAccess;
  const preset = templateStyling(template.id);

  return (
    <Modal visible={!!template} onClose={onClose} title="Template Preview" size="lg">
      <View className="pb-6">
        {/* Page still */}
        <View
          className="w-full rounded-xl overflow-hidden bg-stone-100 border border-stone-200"
          style={{ aspectRatio: PAGE_ASPECT }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Preview of the ${template.name} template with sample data`}
        >
          {uri && imageState !== 'error' ? (
            <Image
              source={{ uri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
              onLoad={() => setImageState('ready')}
              onError={() => setImageState('error')}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Ionicons name="document-text-outline" size={48} color={colors.stone[300]} />
              <Text className="text-stone-400 text-sm mt-2">Preview not available</Text>
            </View>
          )}
          {uri && imageState === 'loading' ? (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color={colors.brand[600]} />
            </View>
          ) : null}
          {locked ? (
            <View className="absolute bottom-0 left-0 right-0 h-1/3 bg-black/30" pointerEvents="none" />
          ) : null}
          <View className="absolute bottom-3 left-3 flex-row items-center rounded-full bg-black/60 px-3 py-1.5">
            <Text className="text-xs font-semibold text-white">{template.name}</Text>
            <View className={['ml-2 rounded-full px-2 py-0.5', isPro ? 'bg-brand-500' : 'bg-emerald-500'].join(' ')}>
              <Text className="text-[10px] font-bold text-white">{isPro ? tier : 'Free'}</Text>
            </View>
          </View>
        </View>

        {/* Identity */}
        <View className="mt-4">
          <View className="flex-row items-center">
            <Text className="text-xl font-bold text-stone-900 mr-2">{template.name}</Text>
            {isPro ? (
              <View className="rounded-full bg-brand-100 px-2 py-0.5 flex-row items-center">
                <Ionicons name={String(template.tier) === 'enterprise' ? 'diamond' : 'flash'} size={11} color={colors.brand[700]} />
                <Text className="text-xs font-bold text-brand-700 ml-1">{tier}</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-sm text-stone-500 mt-1">
            {locked
              ? PAID_UPGRADES_ENABLED
                ? `This is a ${tier} template. Upgrade your plan to use it with your own data.`
                : lockedMessage ?? `This is a ${tier} template.`
              : 'This preview uses sample data. Select this template to start building your own CV.'}
          </Text>
        </View>

        {/* Accent colour + layout */}
        <View className="flex-row items-center mt-4">
          <View
            className="w-8 h-8 rounded-lg border border-stone-200 mr-3"
            style={{ backgroundColor: preset.primaryColor }}
          />
          <View className="flex-1">
            <Text className="text-xs font-medium text-stone-700">Accent color</Text>
            <Text className="text-xs text-stone-400 uppercase">{preset.primaryColor}</Text>
          </View>
          <View className="items-end">
            <Text className="text-xs font-medium text-stone-700">Layout</Text>
            <Text className="text-xs text-stone-400">{layoutLabel(preset.layout)}</Text>
          </View>
        </View>

        <View className="flex-row items-start rounded-lg bg-amber-50 px-3 py-2.5 mt-4">
          <Ionicons name="lock-closed" size={14} color={colors.warning.DEFAULT} style={{ marginTop: 1 }} />
          <Text className="text-xs text-amber-700 ml-2 flex-1">
            This preview is read-only. All content is sample data.
          </Text>
        </View>

        {/* Actions */}
        <View className="gap-3 mt-5">
          {locked ? (
            PAID_UPGRADES_ENABLED && onUpgrade ? (
              <Button variant="primary" fullWidth onPress={onUpgrade}>
                {`Upgrade to ${tier}`}
              </Button>
            ) : null
          ) : (
            <Button variant="primary" fullWidth onPress={onSelect}>
              {selectLabel ?? (isPro ? 'Select Template' : 'Use for Free')}
            </Button>
          )}
          <Button variant="ghost" fullWidth onPress={onClose}>
            {closeLabel ?? (locked && PAID_UPGRADES_ENABLED ? 'Maybe Later' : 'Back to Gallery')}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
