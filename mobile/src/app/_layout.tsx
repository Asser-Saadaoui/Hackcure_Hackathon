import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import { getHeaderTitle, Header } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Linking, Platform, useWindowDimensions, View } from 'react-native';

import { Phone } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/button';
import { MagicSurfaceEffects } from '@/components/magic-surface-effects';

import { BrandTitle } from '@/components/brand-title';
import { ConnectionBanner } from '@/components/connection-banner';
import { CompactNavigation, PlatformShell } from '@/components/platform-shell';
import { Colors } from '@/constants/theme';
import { LanguageProvider, useI18n } from '@/i18n';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const pathname = usePathname();
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
          header: desktop ? undefined : ({options,route,back}) => <View>
            <Header {...options} title={getHeaderTitle(options,route.name)} back={back} />
            <CompactNavigation />
          </View>,
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
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
      </Stack></PlatformShell>
      {!desktop && pathname !== '/welcome' && <SafeAreaView edges={['bottom', 'left', 'right']} style={{ padding: 8, borderTopWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card }}>
        <Button label={t('call190')} icon={Phone} variant="destructive" size="sm" onPress={() => Linking.openURL('tel:190')} />
      </SafeAreaView>}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <LanguageProvider>
      <MagicSurfaceEffects />
      <Navigator />
    </LanguageProvider>
  );
}
