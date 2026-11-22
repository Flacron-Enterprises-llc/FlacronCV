// Play Console: a portrait-locked app gets an implied *required*
// android.hardware.screen.portrait feature, which Play reports as
// "restricting your app's availability" (tablets, desktop, Android XR).
// The app still opens in portrait; it simply does not require the hardware.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = [
  'android.hardware.screen.portrait',
  'android.hardware.screen.landscape',
  // expo-network adds ACCESS_WIFI_STATE, which Play reads as a Wi-Fi requirement; the app works on mobile data.
  'android.hardware.wifi',
];

module.exports = function withOptionalScreenFeatures(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = manifest['uses-feature'] ?? [];
    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((feature) => feature.$?.['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = features;
    return cfg;
  });
};
