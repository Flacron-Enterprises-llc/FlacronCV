import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../src/components/ui/Button';
import { colors } from '../src/theme/colors';

const { width, height } = Dimensions.get('window');

const ONBOARDING_SEEN_KEY = 'flacroncv_onboarding_seen';

const slides = [
  {
    id: '1',
    title: 'Build a\nStandout CV',
    subtitle:
      'Choose from professionally designed templates. Every line is yours to edit.',
  },
  {
    id: '2',
    icon: '✨',
    title: 'Flacron Engine\nContent',
    subtitle:
      'Let the Flacron Engine write compelling summaries, bullet points and cover letters tailored to your role.',
    badge: 'Powered by the Flacron Engine',
  },
  {
    id: '3',
    icon: '🚀',
    title: 'Export &\nTake It With You',
    subtitle:
      'Download as PDF or DOCX in one tap and share the file from your device. Your career, your way.',
    badge: 'PDF · DOCX',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const markOnboardingSeen = async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
  };

  const handleGetStarted = async () => {
    await markOnboardingSeen();
    router.replace('/(auth)/register');
  };

  const handleSignIn = async () => {
    await markOnboardingSeen();
    router.replace('/(auth)/login');
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleGetStarted();
    }
  };

  return (
    <View className="flex-1 bg-stone-50">
      <StatusBar barStyle="dark-content" />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Top: FC mark — no coloured tile */}
        <Animated.View
          style={{
            alignItems: 'center',
            marginTop: height * 0.05,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          <Image
            source={require('../assets/icon.png')}
            style={{ width: 72, height: 72, borderRadius: 16 }}
            resizeMode="contain"
          />
          <Text
            className="mt-2.5 font-bold uppercase text-chrome"
            style={{ fontSize: 15, letterSpacing: 2 }}
          >
            FlacronCV
          </Text>
        </Animated.View>

        <FlatList
          ref={flatListRef}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={true}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(index);
          }}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={{
                width,
                paddingHorizontal: 32,
                justifyContent: 'center',
                flex: 1,
              }}
            >
              <Animated.View
                style={{
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                }}
              >
                {item.badge ? (
                  <View className="mb-6 self-start rounded-full bg-chrome px-3.5 py-1.5">
                    <Text className="text-xs font-semibold text-white">{item.badge}</Text>
                  </View>
                ) : null}

                {item.id === '1' ? (
                  <View className="mb-5 h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
                    <Ionicons
                      name="document-text"
                      size={32}
                      color={colors.brand[600]}
                    />
                  </View>
                ) : (
                  <Text className="mb-5 text-5xl">{item.icon}</Text>
                )}

                <Text className="mb-4 text-3xl font-bold leading-10 text-stone-900">
                  {item.title}
                </Text>

                <Text className="text-base leading-6 text-stone-600">{item.subtitle}</Text>
              </Animated.View>
            </View>
          )}
          style={{ flex: 1 }}
        />

        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom }}>
          <View className="mb-8 flex-row items-center justify-center gap-2">
            {slides.map((_, i) => (
              <View
                key={i}
                className={[
                  'h-2 rounded',
                  i === currentIndex ? 'w-6 bg-brand-600' : 'w-2 bg-stone-300',
                ].join(' ')}
              />
            ))}
          </View>

          <View style={{ marginBottom: 14 }}>
            <Button variant="primary" size="lg" fullWidth onPress={handleNext}>
              {currentIndex === slides.length - 1 ? "Get Started — It's Free" : 'Continue'}
            </Button>
          </View>

          <TouchableOpacity
            onPress={handleSignIn}
            activeOpacity={0.7}
            style={{ alignItems: 'center', paddingVertical: 10 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '500' }} className="text-stone-500">
              Already have an account?{' '}
              <Text className="font-bold text-stone-900">Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
