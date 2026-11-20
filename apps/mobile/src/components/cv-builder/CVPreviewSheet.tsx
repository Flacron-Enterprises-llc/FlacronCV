import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useT } from '../../i18n/useT';
import { api } from '../../lib/api';
import { PREVIEW_DEBOUNCE_MS, previewBody } from '../../lib/cv-preview';
import { useCVStore } from '../../store/cv-store';
import { colors } from '../../theme/colors';

/**
 * Full-screen, live CV preview: the same HTML the PDF export prints, rendered
 * by the API from the editor's unsaved values. JavaScript is off and the view
 * cannot navigate, so the page is display-only. No export is used.
 */
export function CVPreviewSheet({ cvId, visible, onClose }: { cvId: string; visible: boolean; onClose: () => void }) {
  const t = useT('cvEditor');
  const cv = useCVStore((s) => s.cv);
  const sections = useCVStore((s) => s.sections);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await api.post<{ html: string }>(`/cvs/${cvId}/preview`, previewBody(cv, sections));
        if (request !== latest.current) return; // a newer edit is already on its way
        setHtml(result.html);
        setFailed(false);
      } catch {
        if (request === latest.current) setFailed(true);
      } finally {
        if (request === latest.current) setLoading(false);
      }
    }, html === null ? 0 : PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, cvId, cv, sections, attempt]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 py-3 bg-surface border-b border-stone-100">
          <View className="flex-1">
            <Text className="font-bold text-stone-900">{t('editor.previewTitle')}</Text>
            <Text className="text-xs text-stone-500 mt-0.5">{t('editor.previewNote')}</Text>
          </View>
          {loading ? <ActivityIndicator size="small" color={colors.brand[600]} style={{ marginEnd: 8 }} /> : null}
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('editor.previewClose')} className="p-2" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={24} color={colors.stone[700]} />
          </TouchableOpacity>
        </View>
        {failed && html === null ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-stone-700 text-center">{t('editor.previewError')}</Text>
            <TouchableOpacity onPress={() => setAttempt((n) => n + 1)} accessibilityRole="button" className="mt-4 px-4 py-2 rounded-lg bg-brand-600">
              <Text className="text-white font-semibold">{t('editor.previewRetry')}</Text>
            </TouchableOpacity>
          </View>
        ) : html === null ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.brand[600]} />
          </View>
        ) : (
          // The CV page is white paper in both appearances, like the PDF.
          <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
            <WebView
              originWhitelist={['about:*']}
              source={{ html }}
              javaScriptEnabled={false}
              setSupportMultipleWindows={false}
              onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('data:')}
              scalesPageToFit
              style={{ flex: 1, backgroundColor: '#ffffff' }}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
