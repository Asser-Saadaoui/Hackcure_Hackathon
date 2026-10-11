import { router, usePathname } from 'expo-router';
import { ChevronLeft, ChevronRight, History, LayoutDashboard, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Phone, Settings, X } from 'lucide-react-native';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './app-text';
import { BrandTitle } from './brand-title';
import { Button } from './button';
import { Colors, Fonts } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { getJSON, Keys } from '@/lib/storage';

const links = [
  { path: '/home', Icon: LayoutDashboard },
  { path: '/chat', Icon: MessageCircle },
  { path: '/history', Icon: History },
  { path: '/settings', Icon: Settings },
] as const;
const copy = {
  en: { workspace: 'Your care space', open: 'Open navigation', close: 'Close navigation', expand: 'Expand navigation', collapse: 'Collapse navigation', labels: ['Overview', 'Symptom intake', 'My history', 'Settings'], details: ['Your next steps', 'Describe what is happening', 'Revisit your conversations', 'Language and preferences'] },
  fr: { workspace: 'Votre espace santé', open: 'Ouvrir la navigation', close: 'Fermer la navigation', expand: 'Développer la navigation', collapse: 'Réduire la navigation', labels: ['Tableau de bord', 'Mes symptômes', 'Historique', 'Paramètres'], details: ['Vos prochaines étapes', 'Décrivez votre situation', 'Retrouvez vos conversations', 'Langue et préférences'] },
  ar: { workspace: 'مساحتك الصحية', open: 'فتح قائمة التنقل', close: 'إغلاق قائمة التنقل', expand: 'توسيع القائمة', collapse: 'تصغير القائمة', labels: ['لوحة المتابعة', 'وصف الأعراض', 'المحادثات السابقة', 'الإعدادات'], details: ['خطواتك القادمة', 'صف ما يحدث معك', 'راجع محادثاتك السابقة', 'اللغة والتفضيلات'] },
  darija: { workspace: 'فضاك للصحة', open: 'حلّ القائمة', close: 'سكّر القائمة', expand: 'كبّر القائمة', collapse: 'صغّر القائمة', labels: ['لوحة المتابعة', 'وصف الأعراض', 'المحادثات السابقة', 'الإعدادات'], details: ['شنوّة الخطوة الجاية', 'احكيلنا شنوّة صاير', 'ارجع لمحادثاتك', 'اللغة والاختيارات'] },
};
type SidebarContextValue = { collapsed: boolean; toggle: () => void; openMobile: boolean; setOpenMobile: (open: boolean) => void; desktop: boolean };
const SidebarContext = createContext<SidebarContextValue | null>(null);
function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('Sidebar must be inside SidebarProvider');
  return context;
}

/** Lightweight Expo adaptation of shadcn's Sidebar/Trigger pattern.
 * AI4BRAIN's AppShell supplies the visual reference; RN Modal supplies the
 * mobile sheet, Escape/Android-back handling and web focus trapping.
 * No Tailwind, Radix, cookies or clinical state are needed here.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { width, fontScale } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(false);
  const desktop = Platform.OS === 'web' && width >= 900 && fontScale <= 1.4;
  const [mobile, setMobile] = useState({ path, desktop, open: false });
  // Reset the sheet as part of a route/layout change, before rendering children.
  if (mobile.path !== path || mobile.desktop !== desktop) setMobile({ path, desktop, open: false });
  return <SidebarContext.Provider value={{ collapsed, desktop,
    openMobile: !desktop && mobile.path === path && mobile.open,
    setOpenMobile: open => setMobile({ path, desktop, open }),
    toggle: () => desktop ? setCollapsed(value => !value) : setMobile(value => ({ path, desktop, open: !value.open })),
  }}>{children}<MobileSidebar /></SidebarContext.Provider>;
}

export function useNavigationTitle() {
  const path = usePathname();
  const { language, t } = useI18n();
  const index = links.findIndex(link => link.path === path);
  return index < 0 ? t('patientSection') : copy[language].labels[index];
}

function SidebarMenu({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const { language, rtl } = useI18n();
  const { setOpenMobile } = useSidebar();
  const text = copy[language];
  const Arrow = rtl ? ChevronLeft : ChevronRight;
  return <View style={styles.menu}>
    {links.map(({ path: target, Icon }, index) => <Pressable key={target}
      accessibilityRole="button" accessibilityLabel={text.labels[index]}
      accessibilityHint={text.details[index]} accessibilityState={{ selected: path === target }}
      {...(Platform.OS === 'web' ? { 'aria-current': path === target ? 'page' : undefined } : {})}
      onPress={async () => {
        setOpenMobile(false);
        if (target === '/chat' && !await getJSON(Keys.onboarding)) return router.push('/welcome');
        router.push(target);
      }} style={({ pressed, hovered }) => [styles.item, compact && styles.railItem, path === target && styles.selected, (pressed || hovered) && styles.hovered]}>
      <View style={[styles.icon, path === target && styles.selectedIcon]}><Icon size={20} color={path === target ? Colors.primaryFg : Colors.primary} /></View>
      {!compact && <View style={styles.label}><AppText style={styles.itemTitle}>{text.labels[index]}</AppText>
        <AppText style={styles.detail}>{text.details[index]}</AppText></View>}
      {!compact && path === target && <Arrow size={16} color={Colors.primary} />}
    </Pressable>)}
  </View>;
}

export function SidebarTrigger() {
  const { collapsed, desktop, openMobile, toggle } = useSidebar();
  const { language } = useI18n();
  const text = copy[language];
  const Icon = desktop ? collapsed ? PanelLeftOpen : PanelLeftClose : Menu;
  return <Pressable accessibilityRole="button" accessibilityLabel={desktop ? collapsed ? text.expand : text.collapse : text.open}
    accessibilityState={{ expanded: desktop ? !collapsed : openMobile }} aria-expanded={desktop ? !collapsed : openMobile} onPress={toggle}
    style={({ pressed, hovered }) => [styles.trigger, (pressed || hovered) && styles.hovered]}>
    <Icon size={22} color={Colors.primary} />
  </Pressable>;
}

export function Sidebar() {
  const { collapsed } = useSidebar();
  const { language } = useI18n();
  return <View style={[styles.sidebar, collapsed && styles.rail]}>
    <View style={styles.brand}>{collapsed ? <Image source={require('../../assets/images/hassanito.png')} style={styles.owl} accessibilityLabel="Sahhanito" /> : <BrandTitle />}</View>
    {!collapsed && <AppText style={styles.groupLabel}>{copy[language].workspace}</AppText>}
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}><SidebarMenu compact={collapsed} /></ScrollView>
    <View style={styles.footer}><SidebarTrigger /></View>
  </View>;
}

/** Menu sheet replaces the cramped four-column navigation strip. */
export function CompactNavigation() {
  const path = usePathname();
  const { language } = useI18n();
  const title = useNavigationTitle();
  if (path === '/emergency' || path === '/welcome' || path === '/') return null;
  const text = copy[language];
  return <SafeAreaView edges={['left', 'right']} style={styles.compactBar}>
      <SidebarTrigger />
      <View style={styles.label}><AppText style={styles.currentTitle}>{title}</AppText><AppText style={styles.detail}>{text.workspace}</AppText></View>
    </SafeAreaView>;
}

// Render once at the provider, not inside each retained Expo stack header.
function MobileSidebar() {
  const path = usePathname();
  const { language, rtl, t } = useI18n();
  const { width } = useWindowDimensions();
  const { openMobile, setOpenMobile } = useSidebar();
  if (path === '/emergency' || path === '/welcome' || path === '/') return null;
  const text = copy[language];
  return <Modal visible={openMobile} transparent animationType="none" accessibilityLabel={text.workspace} onRequestClose={() => setOpenMobile(false)}>
      <View style={[styles.overlay, { direction: rtl ? 'rtl' : 'ltr' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpenMobile(false)} accessible={false} importantForAccessibility="no" />
        <SafeAreaView edges={['top', 'bottom']} style={[styles.sheet, { width: Math.min(340, width - 36) }]} accessibilityViewIsModal>
          <View style={styles.sheetHeader}><BrandTitle /><Pressable accessibilityRole="button" accessibilityLabel={text.close}
            onPress={() => setOpenMobile(false)} style={styles.trigger}><X size={22} color={Colors.primary} /></Pressable></View>
          <AppText variant="subtitle" style={styles.sheetTitle}>{text.workspace}</AppText>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}><SidebarMenu /></ScrollView>
          <View style={styles.sheetFooter}><Button label={t('call190')} variant="destructive" icon={Phone} onPress={() => Linking.openURL('tel:190')} /></View>
        </SafeAreaView>
      </View>
    </Modal>;
}

const styles = StyleSheet.create({
  sidebar: { width: 244, backgroundColor: Colors.card, borderEndWidth: 1, borderColor: Colors.border, padding: 14, gap: 16 },
  rail: { width: 80, paddingHorizontal: 10, alignItems: 'center' },
  brand: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 4 },
  owl: { width: 44, height: 44 },
  groupLabel: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.mutedFg, paddingHorizontal: 10 },
  scroll: { flex: 1, alignSelf: 'stretch' },
  scrollContent: { paddingBottom: 12 },
  menu: { gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, borderRadius: 14, padding: 8, borderWidth: 1, borderColor: 'transparent' },
  railItem: { justifyContent: 'center', minHeight: 54, paddingHorizontal: 4 },
  selected: { backgroundColor: Colors.accent, borderColor: Colors.border },
  hovered: { backgroundColor: Colors.secondary },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectedIcon: { backgroundColor: Colors.primary },
  label: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { fontSize: 14, lineHeight: 21, fontFamily: Fonts.semibold },
  detail: { fontSize: 12, lineHeight: 18, color: Colors.mutedFg },
  trigger: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.secondary },
  footer: { borderTopWidth: 1, borderColor: Colors.border, paddingTop: 14 },
  compactBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center', backgroundColor: Colors.card, borderBottomWidth: 1, borderColor: Colors.border },
  currentTitle: { fontSize: 14, lineHeight: 21, fontFamily: Fonts.semibold },
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: '#102C4570' },
  sheet: { backgroundColor: Colors.card, paddingHorizontal: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 16, borderBottomWidth: 1, borderColor: Colors.border },
  sheetTitle: { marginVertical: 24 },
  sheetFooter: { paddingVertical: 16, borderTopWidth: 1, borderColor: Colors.border },
});
