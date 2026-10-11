import { router, usePathname } from 'expo-router';
import { ChevronLeft, ChevronRight, History, LayoutDashboard, MessageCircle, Phone, Settings } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './app-text';
import { BrandTitle } from './brand-title';
import { Button } from './button';
import { Hassanito } from './hassanito';
import { Highlighter } from './highlighter';
import { Colors, Fonts } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { EXPERIENCE } from '@/i18n/experience';
import { getJSON, Keys } from '@/lib/storage';

/** Responsive React shell; clinical screens retain ownership of their mascot state. */
export function PlatformShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { width, fontScale } = useWindowDimensions();
  const { language, t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const wide = Platform.OS === 'web' && width >= 900 && fontScale <= 1.4;
  const arabic = language === 'ar' || language === 'darija';
  const labels = arabic ? ['لوحة المتابعة', 'وصف الأعراض', 'المحادثات السابقة', 'الإعدادات']
    : language === 'fr' ? ['Tableau de bord', 'Mes symptômes', 'Historique', 'Paramètres']
    : ['Overview', 'Symptom intake', 'My history', 'Settings'];
  const links = [
    { path: '/home' as const, Icon: LayoutDashboard },
    { path: '/chat' as const, Icon: MessageCircle },
    { path: '/history' as const, Icon: History },
    { path: '/settings' as const, Icon: Settings },
  ];
  const navigate = async (target: '/home' | '/chat' | '/history' | '/settings') => {
    if (target === '/chat' && !await getJSON(Keys.onboarding)) return router.push('/welcome');
    router.push(target);
  };
  // Emergency pages stay focused on instructions and contacting help.
  if (path === '/emergency' || path === '/welcome' || path === '/') return <>{children}</>;
  if (!wide) return <View style={styles.workspace}>
    <View style={styles.content}>{children}</View>
    {(path === '/history' || path === '/settings') && <View style={styles.companion}><Hassanito compact /></View>}
    <SafeAreaView edges={['bottom']} style={styles.mobileNav}>{links.map(({ path: target, Icon }, index) => <Pressable key={target}
      accessibilityRole="button" accessibilityLabel={labels[index]} accessibilityState={{ selected: path === target }}
      onPress={() => navigate(target)} style={styles.mobileLink}>
      <Icon size={20} color={path === target ? Colors.primary : Colors.mutedFg} />
      <AppText style={[styles.mobileLabel, path === target && { color: Colors.primary }]}>{labels[index]}</AppText>
    </Pressable>)}</SafeAreaView>
  </View>;
  const selected = links.findIndex(link => link.path === path);
  const title = selected >= 0 ? labels[selected] : t('patientSection');
  return <View style={styles.shell}>
    <View style={[styles.sidebar, collapsed && styles.collapsed]}>
      {collapsed ? <Image source={require('../../assets/images/hassanito.png')} style={{ width: 36, height: 36 }} accessibilityLabel="Sahhanito" /> : <BrandTitle inverse />}
      {!collapsed && <AppText style={styles.eyebrow}>{arabic ? 'فضاء المريض' : language === 'fr' ? 'ESPACE PATIENT' : 'PATIENT WORKSPACE'}</AppText>}
      <View style={styles.navigation}>
        {links.map(({ path: target, Icon }, index) => <Pressable key={target} accessibilityRole="button" accessibilityLabel={labels[index]}
          accessibilityState={{ selected: path === target }} onPress={() => navigate(target)}
          style={({ pressed }) => [styles.link, path === target && styles.active, pressed && { opacity: .75 }]}>
          <Icon size={17} color={path === target ? '#FFFFFF' : '#B8CCE5'} />
          {!collapsed && <AppText style={[styles.linkText, path === target && { color: '#FFFFFF' }]}>{labels[index]}</AppText>}
        </Pressable>)}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        accessibilityState={{ expanded: !collapsed }} onPress={() => setCollapsed(value => !value)} style={[styles.link, { marginTop: 'auto' }]}>
        {collapsed ? <ChevronRight size={20} color="#B8CCE5" /> : <ChevronLeft size={20} color="#B8CCE5" />}
        {!collapsed && <AppText variant="small" style={{ color: '#B8CCE5' }}>{arabic ? 'تصغير القائمة' : language === 'fr' ? 'Réduire' : 'Collapse'}</AppText>}
      </Pressable>
      {!collapsed && <AppText variant="small" style={styles.footer}>Sahhanito · صحة نيتو</AppText>}
    </View>
    <View style={styles.workspace}>
      <View style={styles.topbar}>
        <AppText variant="subtitle">{title}</AppText>
        <View style={styles.context}><Highlighter>{EXPERIENCE[language].workspaceTagline}</Highlighter>
          <Button label={t('call190')} variant="outline" size="sm" icon={Phone} onPress={() => Linking.openURL('tel:190')} />
        </View>
      </View>
      <View style={styles.content}>{children}</View>
      {(path === '/history' || path === '/settings') && <View style={styles.companion}><Hassanito compact /></View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },
  sidebar: { width: 200, paddingHorizontal: 14, paddingVertical: 18, gap: 16, backgroundColor: Colors.navy },
  collapsed: { width: 64, paddingHorizontal: 10, alignItems: 'center' },
  eyebrow: { fontSize: 9, fontFamily: Fonts.semibold, letterSpacing: 1.6, color: '#9DB5D3', marginTop: 4 },
  navigation: { gap: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10 },
  active: { backgroundColor: '#2B4C79', borderStartWidth: 3, borderColor: '#FF7C8C' },
  linkText: { fontSize: 12.5, fontFamily: Fonts.medium, color: '#B8CCE5' },
  footer: { color: '#9DB5D3', fontSize: 11 },
  workspace: { flex: 1, minWidth: 0 },
  topbar: { backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  context: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  content: { flex: 1 },
  companion: { paddingHorizontal: 28, paddingBottom: 16 },
  mobileNav: { flexDirection: 'row', padding: 8, backgroundColor: Colors.card, borderTopWidth: 1, borderColor: Colors.border },
  mobileLink: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48, padding: 4 },
  mobileLabel: { fontSize: 10, textAlign: 'center', color: Colors.mutedFg },
});
