import { usePathname } from 'expo-router';
import { Phone } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from './app-text';
import { Button } from './button';
import { Hassanito } from './hassanito';
import { Highlighter } from './highlighter';
import { Sidebar, SidebarTrigger, useNavigationTitle } from './sidebar';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { EXPERIENCE } from '@/i18n/experience';

/** Responsive shell; clinical screens retain ownership of their mascot state. */
export function PlatformShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { width, fontScale } = useWindowDimensions();
  const { language, t } = useI18n();
  const wide = Platform.OS === 'web' && width >= 900 && fontScale <= 1.4;
  const title = useNavigationTitle();
  // Emergency pages stay focused on instructions and contacting help.
  if (path === '/emergency' || path === '/welcome' || path === '/') return <>{children}</>;
  const companion = (path === '/history' || path === '/settings') && <View style={styles.companion}><Hassanito compact /></View>;
  if (!wide) return <View style={styles.workspace}><View style={styles.content}>{children}</View>{companion}</View>;
  return <View style={styles.shell}>
    <Sidebar />
    <View style={styles.workspace}>
      <View style={styles.topbar}>
        <View style={styles.pageTitle}><SidebarTrigger /><AppText variant="subtitle">{title}</AppText></View>
        <View style={styles.context}><Highlighter>{EXPERIENCE[language].workspaceTagline}</Highlighter>
          <Button label={t('call190')} variant="outline" size="sm" icon={Phone} onPress={() => Linking.openURL('tel:190')} />
        </View>
      </View>
      <View style={styles.content}>{children}</View>
      {companion}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },
  workspace: { flex: 1, minWidth: 0 },
  topbar: { backgroundColor: Colors.card, paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  pageTitle: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  context: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  content: { flex: 1 },
  companion: { paddingHorizontal: 28, paddingBottom: 16 },
});
