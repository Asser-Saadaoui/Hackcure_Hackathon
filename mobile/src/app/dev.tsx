import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { RiskBadge } from '@/components/risk-badge';
import { Screen } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import type { RiskLevel, TurnResult } from '@/lib/types';
import { MOCK_CHAT, MOCK_TIMING } from '@/mock/mock-api';
import { NEIGHBORHOODS } from '@/mock/hospitals';

/**
 * TEMPORARY screen (Step 3): exercises the mock backend end to end
 * so we can check it in the browser before building the real screens.
 */

type LogLine = { at: string; text: string; level?: RiskLevel };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function DevScreen() {
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const unsubscribers = useRef<(() => void)[]>([]);

  useEffect(() => () => unsubscribers.current.forEach((u) => u()), []);

  const add = (text: string, level?: RiskLevel) =>
    setLog((l) => [...l, { at: new Date().toLocaleTimeString(), text, level }]);

  const describe = (r: TurnResult) => {
    switch (r.kind) {
      case 'question': return add(`question → "${r.turn.text}" [${r.turn.quickReplies?.join(' | ') ?? ''}]`, 'UNCERTAIN');
      case 'degraded': return add(`degraded → ${r.message}`);
      default: return add(`${r.kind} → ${r.decision.rationale} (pFinal ${r.decision.pFinal})`, r.decision.level);
    }
  };

  const run = async (name: string, flow: () => Promise<void>) => {
    setRunning(true);
    add(`▶ ${name}`);
    const previousMode = MOCK_CHAT.mode;
    MOCK_CHAT.mode = 'triage';          // scripted flows test the keyword triage
    try {
      await flow();
      add('✔ done');
    } catch (e) {
      add(`✖ ${(e as Error).message}`);
    } finally {
      MOCK_CHAT.mode = previousMode;
      setRunning(false);
    }
  };

  const lowFlow = () => run('Low-risk conversation (3 follow-up questions)', async () => {
    const s = await api.startSession();
    add(`session ${s.userId}`);
    let r = await api.createCase('3andi wja3 fi rasi');
    describe(r);
    for (const answer of ['1–24h', 'Faible', 'Non']) {
      add(`patient → "${answer}"`);
      r = await api.sendMessage(r.caseId, answer);
      describe(r);
    }
  });

  const emergencyFlow = () => run('Emergency → matching → referral → hospital → chat', async () => {
    await api.startSession();
    const r = await api.createCase('sderi yo9jani w n7ess rou7i mkhanou9');
    describe(r);
    const caseId = r.caseId;
    const c = await api.getCase(caseId);
    add(`case ${c.referenceCode} · status ${c.status}`);

    unsubscribers.current.push(api.subscribe(caseId, (e) => {
      if (e.type === 'referral.status') add(`EVENT referral.status → ${e.referral.status} · ${e.referral.arrivalMode ?? ''} · "${e.referral.acceptNote ?? ''}"`);
      if (e.type === 'chat.message') add(`EVENT chat (${e.message.sender}${e.message.senderName ? ' · ' + e.message.senderName : ''}) → ${e.message.text}`);
      if (e.type === 'case.escalated') add(`EVENT case.escalated → ${e.level} · "${e.instruction ?? ''}"`, e.level);
    }));

    const bab = NEIGHBORHOODS.find((n) => n.name === 'Bab Saadoun')!;
    await api.setLocation(caseId, { lat: bab.lat, lng: bab.lng, source: 'MANUAL', address: bab.name });
    add(`location set → ${bab.name}`);

    add('waiting for the automatic assignment…');
    await wait(1500);
    const referral = (await api.getCase(caseId)).referral;
    if (!referral) throw new Error('no hospital assigned');
    add(`assigned → ${referral.facilityName} · ${referral.matchReason}`);

    add(`waiting ${MOCK_TIMING.hospitalAccept / 1000}s for the hospital…`);
    await wait(MOCK_TIMING.hospitalAccept + 500);

    await api.sendChat(referral.id, 'Il a aussi de la fièvre');
    add('patient chat → "Il a aussi de la fièvre"');
    await wait(MOCK_TIMING.edReply + 500);

    await api.sendChat(referral.id, 'Je me sens plus mal', 'WORSE');
    add('patient chat (WORSE) → "Je me sens plus mal"');
    await wait(MOCK_TIMING.edEscalate + 500);

    const history = await api.listCases();
    add(`history: ${history.length} case(s), latest ${history[0]?.referenceCode} → ${history[0]?.facilityName}`);
  });

  const pregnancyFlow = () => run('Pregnancy → High (OBGYN matching)', async () => {
    await api.startSession();
    const r = await api.createCase('ana 7amel w 3andi wja3 fi kerchi');
    describe(r);
    const ariana = NEIGHBORHOODS.find((n) => n.name === 'Ariana Ville')!;
    await api.setLocation(r.caseId, { lat: ariana.lat, lng: ariana.lng, source: 'MANUAL', address: ariana.name });
    await wait(1500);
    const assigned = (await api.getCase(r.caseId)).referral;
    add(assigned ? `assigned → ${assigned.facilityName} · ${assigned.matchReason}` : 'no hospital assigned');
  });

  const degradedFlow = () => run('AI unavailable (degraded mode)', async () => {
    await api.startSession();
    describe(await api.createCase('#down j’ai mal'));
  });

  return (
    <Screen>
      <AppText variant="small">
        Runs the mock backend (src/mock) the same way the screens will. Hospital accepts after {MOCK_TIMING.hospitalAccept / 1000}s.
      </AppText>

      <View style={styles.buttons}>
        <Button label="Low-risk conversation" onPress={lowFlow} disabled={running} />
        <Button label="Emergency full flow" variant="destructive" onPress={emergencyFlow} disabled={running} />
        <Button label="Pregnancy → High" variant="secondary" onPress={pregnancyFlow} disabled={running} />
        <Button label="Simulate AI down" variant="secondary" onPress={degradedFlow} disabled={running} />
        <Button label="Clear log" variant="secondary" onPress={() => setLog([])} disabled={running} />
      </View>

      <View style={styles.log}>
        {log.length === 0 && <AppText variant="small">No output yet.</AppText>}
        {log.map((l, i) => (
          <View key={i} style={styles.line}>
            <AppText variant="mono">{l.at}</AppText>
            {l.level && <RiskBadge level={l.level} />}
            <AppText style={styles.lineText}>{l.text}</AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: Spacing.sm },
  log: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  line: { gap: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: Spacing.sm },
  lineText: { fontSize: 14 },
});
