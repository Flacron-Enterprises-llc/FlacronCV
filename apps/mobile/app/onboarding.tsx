import { LinearGradient } from 'expo-linear-gradient';
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
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const ONBOARDING_SEEN_KEY = 'flacroncv_onboarding_seen';

const slides = [
  {
    id: '1',
    gradient: ['#f97316', '#ea580c'] as const,
    icon: '📄',
    title: 'Build a\nStandout CV',
    subtitle:
      'Choose from professionally designed templates. Every line is yours to edit.',
  },
  {
    id: '2',
    gradient: ['#1c1917', '#292524'] as const,
    icon: '✨',
    title: 'AI-Powered\nContent',
    subtitle:
      'Let our AI write compelling summaries, bullet points and cover letters tailored to your role.',
    badge: 'Powered by advanced AI',
  },
  {
    id: '3',
    gradient: ['#f97316', '#c2410c'] as const,
    icon: '🚀',
    title: 'Export &\nShare Anywhere',
    subtitle:
      'Download as PDF or DOCX in one tap, or share a live link. Your career, your way.',
    badge: 'PDF · DOCX · Shareable link',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Animated values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entrance animations
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

  const currentSlide = slides[currentIndex];

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />

      {/* Animated gradient background that morphs between slides */}
      <LinearGradient
        colors={currentSlide.gradient}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative circles */}
      <View
        style={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 280,
          height: 280,
          borderRadius: 140,
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: height * 0.25,
          left: -60,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: 'rgba(255,255,255,0.04)',
        }}
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Top: Logo */}
        <Animated.View
          style={{
            alignItems: 'center',
            marginTop: height * 0.05,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.25)',
            }}
          >
            <Image
              source={require('../assets/logo.png')}
              style={{ width: 56, height: 56, borderRadius: 14 }}
              resizeMode="contain"
            />
          </View>
          <Text
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 15,
              fontWeight: '700',
              letterSpacing: 2,
              marginTop: 10,
              textTransform: 'uppercase',
            }}
          >
            FlacronCV
          </Text>
        </Animated.View>

        {/* Slides */}
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
                {/* Badge — omitted when empty (slide 1 had an unverified count) */}
                {item.badge ? (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 100,
                    marginBottom: 24,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                  }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' }}>
                    {item.badge}
                  </Text>
                </View>
                ) : null}

                {/* Icon */}
                <Text style={{ fontSize: 64, marginBottom: 20 }}>{item.icon}</Text>

                {/* Title */}
                <Text
                  style={{
                    color: '#ffffff',
                    fontSize: 42,
                    fontWeight: '900',
                    lineHeight: 50,
                    marginBottom: 16,
                    letterSpacing: -0.5,
                  }}
                >
                  {item.title}
                </Text>

                {/* Subtitle */}
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.75)',
                    fontSize: 17,
                    lineHeight: 26,
                    fontWeight: '400',
                  }}
                >
                  {item.subtitle}
                </Text>
              </Animated.View>
            </View>
          )}
          style={{ flex: 1 }}
        />

        {/* Bottom section */}
        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom }}>
          {/* Pagination dots */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 32,
              gap: 8,
            }}
          >
            {slides.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === currentIndex ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    i === currentIndex ? '#ffffff' : 'rgba(255,255,255,0.35)',
                }}
              />
            ))}
          </View>

          {/* CTA Buttons */}
          <TouchableOpacity
            onPress={handleNext}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 18,
              paddingVertical: 18,
              alignItems: 'center',
              marginBottom: 14,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <Text
              style={{
                color: currentSlide.gradient[0],
                fontSize: 17,
                fontWeight: '800',
                letterSpacing: 0.2,
              }}
            >
              {currentIndex === slides.length - 1 ? 'Get Started — It\'s Free' : 'Continue'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSignIn} activeOpacity={0.7} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '500' }}>
              Already have an account?{' '}
              <Text style={{ color: '#ffffff', fontWeight: '700' }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
