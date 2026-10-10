import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { BrandTitle } from '@/components/brand-title';
import { ConnectionBanner } from '@/components/connection-banner';
import { PlatformShell } from '@/components/platform-shell';
import { Colors } from '@/constants/theme';
import { LanguageProvider, useI18n } from '@/i18n';
import { loadTestMode } from '@/lib/test-mode';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { rtl, t } = useI18n();
  const { width, fontScale } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 900 && fontScale <= 1.4;
  return (
    <View style={{ flex: 1, direction: rtl ? 'rtl' : 'ltr' }}>
      <StatusBar style="dark" />
      <ConnectionBanner />
      <PlatformShell><Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.card },
          headerTintColor: Colors.foreground,
          headerTitle: () => <BrandTitle section={t('patientSection')} />,
          headerTitleAlign: 'left',
          headerShown: !desktop,
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="hub" options={{ headerTitle: () => <BrandTitle section="Dev hub" /> }} />
        <Stack.Screen name="welcome" options={{ headerShown: true }} />
        <Stack.Screen name="home" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="emergency" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="result" />
        <Stack.Screen name="location" />
        <Stack.Screen name="care" />
        <Stack.Screen name="track" />
        <Stack.Screen name="ed-chat" />
        <Stack.Screen name="report" />
        <Stack.Screen name="history" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="dev" options={{ headerTitle: () => <BrandTitle section="Mock backend" /> }} />
      </Stack></PlatformShell>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => { loadTestMode(); }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <LanguageProvider>
      <Navigator />
    </LanguageProvider>
  );
}
