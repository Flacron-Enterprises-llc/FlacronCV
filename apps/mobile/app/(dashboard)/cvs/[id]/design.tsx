import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TemplateCard } from '../../../../src/components/templates/TemplateCard';
import { TemplatePreviewModal } from '../../../../src/components/templates/TemplatePreviewModal';
import { Button } from '../../../../src/components/ui/Button';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import {
  lockedTemplateMessage,
  lockedTemplateTitle,
  PAID_UPGRADES_ENABLED,
  upgradeAlertButtons,
} from '../../../../src/config/paid-upgrades';
import { useUpdateCVDesign } from '../../../../src/hooks/useCVDesign';
import { useCV } from '../../../../src/hooks/useCVs';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import { useTemplates } from '../../../../src/hooks/useTemplates';
import { requestFailureMessage } from '../../../../src/lib/api-errors';
import {
  ACCENT_COLORS,
  accentLabel,
  applyTemplate,
  BORDER_RADIUS_OPTIONS,
  buildDesignUpdate,
  canSelectLayout,
  canSelectTemplate,
  type CVLayout,
  type DesignDraft,
  designDraftFromCV,
  effectiveHeadingFont,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LAYOUT_OPTIONS,
  layoutLabel,
  layoutTier,
  normalizeHex,
  SECTION_STYLE_OPTIONS,
  templateTier,
} from '../../../../src/lib/cv-design';
import { effectivePlanForCopy, resolveEffectivePlan } from '../../../../src/lib/entitlements';
import { useAuthStore } from '../../../../src/store/auth-store';
import { colors } from '../../../../src/theme/colors';
import { TemplateCategory } from '../../../../src/types/enums';
import { Template } from '../../../../src/types/template.types';

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">{children}</Text>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  locked?: boolean;
  hint?: string;
  accessibilityLabel?: string;
}

function Chip({ label, selected, onPress, locked, hint, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={accessibilityLabel ?? (locked ? `${label}, locked` : label)}
      accessibilityHint={hint}
      className={[
        'min-h-[44px] px-3 py-2 rounded-xl flex-row items-center justify-center',
        selected ? 'bg-brand-600' : 'bg-stone-100',
        locked && !selected ? 'opacity-60' : '',
      ].join(' ')}
    >
      {locked ? (
        <Ionicons
          name="lock-closed"
          size={12}
          color={selected ? colors.white : colors.stone[500]}
          style={{ marginRight: 4 }}
        />
      ) : null}
      <Text className={['text-sm font-semibold', selected ? 'text-white' : 'text-stone-600'].join(' ')}>
        {label}
      </Text>
    </Pressable>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View className="bg-white rounded-2xl border border-stone-100 p-4 mb-4">{children}</View>;
}

export default function CVDesignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const cvQuery = useCV(id ?? null);
  const templatesQuery = useTemplates(TemplateCategory.CV);
  const saveDesign = useUpdateCVDesign(id ?? '');

  const [original, setOriginal] = useState<DesignDraft | null>(null);
  const [draft, setDraft] = useState<DesignDraft | null>(null);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState('');
  const [hexError, setHexError] = useState<string | undefined>();
  const [previewing, setPreviewing] = useState<Template | null>(null);

  const cv = cvQuery.data;
  useEffect(() => {
    if (!id || !cv || hydratedId === id) return;
    const initial = designDraftFromCV(cv);
    setOriginal(initial);
    setDraft(initial);
    setHydratedId(id);
  }, [id, cv, hydratedId]);

  const payload = useMemo(
    () => (original && draft ? buildDesignUpdate(original, draft) : null),
    [original, draft],
  );
  const dirty = !!payload;
  useLeaveGuard(dirty && !saveDesign.isPending);

  const plan = resolveEffectivePlan(user?.subscription);
  const planForCopy = effectivePlanForCopy(user?.subscription);
  const templates = templatesQuery.data ?? [];
  const currentTemplate = templates.find((t) => t.id === draft?.templateId);

  const showUpgrade = (title: string, message: string) => {
    Alert.alert(title, message, upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')));
  };

  const update = (patch: Partial<DesignDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  /** confirm=false when chosen from the preview sheet (already an explicit choice). */
  const pickTemplate = (template: Template, confirm = true) => {
    if (!draft || !original) return;
    if (template.id === draft.templateId) return;
    if (!canSelectTemplate(template.id, plan, original.templateId, template.tier)) {
      const tier = templateTier(template.id, template.tier);
      showUpgrade(lockedTemplateTitle(tier), lockedTemplateMessage(template.name, tier, planForCopy));
      return;
    }
    const apply = () =>
      setDraft((d) => {
        if (!d) return d;
        // Back to the stored template: restore the stored look, not the preset.
        if (template.id === original.templateId) return original;
        return applyTemplate(d, template.id);
      });
    if (!confirm) {
      apply();
      return;
    }
    Alert.alert(
      `Switch to ${template.name}?`,
      'This applies the template’s layout, colour and fonts to your CV. Your content stays the same. Nothing is saved until you tap Save.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: apply },
      ],
    );
  };

  const pickLayout = (layout: CVLayout) => {
    if (!draft || !original) return;
    if (!canSelectLayout(layout, plan, original.layout)) {
      const tier = capitalize(layoutTier(layout));
      const label = layoutLabel(layout);
      showUpgrade(
        lockedTemplateTitle(layoutTier(layout)),
        PAID_UPGRADES_ENABLED
          ? `The ${label} layout requires a ${tier} plan.`
          : `The ${label} layout is included on ${tier} plans. Your ${capitalize(planForCopy)} plan can use the other layouts.`,
      );
      return;
    }
    update({ layout });
  };

  const applyCustomHex = () => {
    const hex = normalizeHex(customHex);
    if (!hex) {
      setHexError('Enter a hex colour like #1e3a5f.');
      return;
    }
    setHexError(undefined);
    setCustomHex(hex);
    update({ primaryColor: hex });
  };

  const handleSave = async () => {
    if (!payload || !draft) return;
    try {
      const saved = await saveDesign.mutateAsync(payload);
      const next = saved ? designDraftFromCV(saved) : draft;
      setOriginal(next);
      setDraft(next);
      Alert.alert('Design saved', 'Your CV design has been updated.');
    } catch (err: unknown) {
      // Server copy first (e.g. a plan-gated layout/template 403), then network, then generic.
      Alert.alert('Could not save', requestFailureMessage(err, 'Could not save the design. Please try again.'));
    }
  };

  const header = (
    <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
      <TouchableOpacity
        onPress={() => router.back()}
        className="mr-3 w-11 h-11 items-center justify-center -ml-3"
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
      </TouchableOpacity>
      <Text className="text-xl font-black text-stone-900 flex-1" numberOfLines={1}>
        CV design
      </Text>
      {draft ? (
        <Button
          size="sm"
          variant="primary"
          loading={saveDesign.isPending}
          disabled={!dirty || saveDesign.isPending}
          onPress={() => void handleSave()}
          accessibilityLabel="Save design"
        >
          Save
        </Button>
      ) : null}
    </View>
  );

  if (cvQuery.error) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        {header}
        <ErrorState
          message={requestFailureMessage(cvQuery.error, 'Could not load this CV. Please try again.')}
          onRetry={() => void cvQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  if (!id || !draft || !original) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        {header}
        <View className="p-5">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  const headingFont = effectiveHeadingFont(draft);
  const layoutDesc = LAYOUT_OPTIONS.find((l) => l.key === draft.layout)?.description;

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Summary of what is chosen */}
        <Card>
          <View className="flex-row items-center">
            <View
              className="w-12 h-12 rounded-xl border border-stone-200 mr-3"
              style={{ backgroundColor: draft.primaryColor }}
              accessibilityLabel={`Accent colour ${accentLabel(draft.primaryColor)} ${draft.primaryColor}`}
            />
            <View className="flex-1">
              <Text className="font-bold text-stone-900" numberOfLines={1}>
                {currentTemplate?.name ?? capitalize(draft.templateId)} · {layoutLabel(draft.layout)}
              </Text>
              <Text className="text-xs text-stone-500 mt-0.5" numberOfLines={2}>
                {accentLabel(draft.primaryColor)} {draft.primaryColor.toUpperCase()} · {draft.fontFamily} /{' '}
                {headingFont} · {capitalize(draft.fontSize)}
              </Text>
            </View>
          </View>
          {dirty ? (
            <Text className="text-xs text-amber-700 mt-3">Unsaved changes. Tap Save to apply them to your CV.</Text>
          ) : null}
        </Card>

        {/* Template */}
        <Card>
          <SectionHeading>Template</SectionHeading>
          {templatesQuery.error ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-stone-500 flex-1">Could not load templates.</Text>
              <Button size="sm" variant="outline" onPress={() => void templatesQuery.refetch()}>
                Retry
              </Button>
            </View>
          ) : templatesQuery.isLoading ? (
            <Text className="text-sm text-stone-400">Loading templates…</Text>
          ) : templates.length === 0 ? (
            <Text className="text-sm text-stone-400">No templates are available right now.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {templates.map((t) => (
                <View key={t.id} style={{ width: 150 }}>
                  <TemplateCard
                    template={t}
                    isSelected={t.id === draft.templateId}
                    isLocked={!canSelectTemplate(t.id, plan, original.templateId, t.tier)}
                    onSelect={() => pickTemplate(t)}
                    onPreview={() => setPreviewing(t)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </Card>

        {/* Layout */}
        <Card>
          <SectionHeading>Layout</SectionHeading>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {LAYOUT_OPTIONS.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                selected={draft.layout === opt.key}
                locked={!canSelectLayout(opt.key, plan, original.layout)}
                hint={opt.description}
                onPress={() => pickLayout(opt.key)}
              />
            ))}
          </View>
          {layoutDesc ? <Text className="text-xs text-stone-400 italic mt-2">{layoutDesc}</Text> : null}
        </Card>

        {/* Accent colour */}
        <Card>
          <SectionHeading>Accent colour</SectionHeading>
          <View className="flex-row flex-wrap gap-1" accessibilityRole="radiogroup">
            {ACCENT_COLORS.map((c) => {
              const selected = draft.primaryColor.toLowerCase() === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => update({ primaryColor: c.value })}
                  accessibilityRole="radio"
                  accessibilityLabel={c.label}
                  accessibilityState={{ selected, checked: selected }}
                  className="w-11 h-11 items-center justify-center"
                >
                  <View
                    className={[
                      'w-8 h-8 rounded-full items-center justify-center',
                      selected ? 'border-2 border-stone-400' : '',
                    ].join(' ')}
                    style={{ backgroundColor: c.value }}
                  >
                    {selected ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View className="flex-row items-start gap-2 mt-3">
            <View className="flex-1">
              <Input
                label="Custom colour"
                placeholder="#1e3a5f"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={7}
                value={customHex}
                onChangeText={(text) => {
                  setCustomHex(text);
                  if (hexError) setHexError(undefined);
                }}
                onSubmitEditing={applyCustomHex}
                error={hexError}
              />
            </View>
            <View style={{ marginTop: 26 }}>
              <Button variant="outline" onPress={applyCustomHex} accessibilityLabel="Apply custom colour">
                Apply
              </Button>
            </View>
          </View>
        </Card>

        {/* Section headings */}
        <Card>
          <SectionHeading>Section headings</SectionHeading>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {SECTION_STYLE_OPTIONS.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                selected={draft.sectionStyle === s.key}
                onPress={() => update({ sectionStyle: s.key })}
              />
            ))}
          </View>
        </Card>

        {/* Corner style */}
        <Card>
          <SectionHeading>Corner style</SectionHeading>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {BORDER_RADIUS_OPTIONS.map((r) => (
              <Chip
                key={r.key}
                label={r.label}
                selected={draft.borderRadius === r.key}
                onPress={() => update({ borderRadius: r.key })}
              />
            ))}
          </View>
        </Card>

        {/* Fonts */}
        <Card>
          <SectionHeading>Body font</SectionHeading>
          <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup">
            {FONT_OPTIONS.map((f) => (
              <Chip
                key={f}
                label={f}
                selected={draft.fontFamily === f}
                accessibilityLabel={`Body font ${f}`}
                onPress={() => update({ fontFamily: f })}
              />
            ))}
          </View>
          <SectionHeading>Heading font</SectionHeading>
          <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup">
            {FONT_OPTIONS.map((f) => (
              <Chip
                key={f}
                label={f}
                selected={headingFont === f}
                accessibilityLabel={`Heading font ${f}`}
                onPress={() => update({ headingFontFamily: f })}
              />
            ))}
          </View>
          <SectionHeading>Font size</SectionHeading>
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            {FONT_SIZE_OPTIONS.map((s) => (
              <View key={s.key} className="flex-1">
                <Chip
                  label={s.label}
                  selected={draft.fontSize === s.key}
                  accessibilityLabel={`Font size ${s.label}`}
                  onPress={() => update({ fontSize: s.key })}
                />
              </View>
            ))}
          </View>
          <Text className="text-xs text-stone-400 mt-3">
            Fonts show in your exported and web CV. The app lists them by name.
          </Text>
        </Card>

        {dirty ? (
          <Button
            variant="ghost"
            fullWidth
            onPress={() => {
              setDraft(original);
              setCustomHex('');
              setHexError(undefined);
            }}
          >
            Discard changes
          </Button>
        ) : null}
      </ScrollView>

      <TemplatePreviewModal
        template={previewing}
        onClose={() => setPreviewing(null)}
        userCanAccess={previewing ? canSelectTemplate(previewing.id, plan, original.templateId, previewing.tier) : true}
        lockedMessage={
          previewing
            ? lockedTemplateMessage(previewing.name, templateTier(previewing.id, previewing.tier), planForCopy)
            : undefined
        }
        selectLabel={previewing?.id === draft.templateId ? 'Current template' : 'Use this template'}
        closeLabel="Close"
        onSelect={() => {
          const chosen = previewing;
          setPreviewing(null);
          if (chosen) pickTemplate(chosen, false);
        }}
        onUpgrade={() => {
          setPreviewing(null);
          router.push('/(dashboard)/settings/billing');
        }}
      />
    </SafeAreaView>
  );
}
