import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { getJSON, Keys } from '@/lib/storage';

/** Entry: first open → Welcome, otherwise straight to the triage chat. */
export default function Index() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => { getJSON(Keys.onboarding).then((o) => setOnboarded(!!o)); }, []);

  if (onboarded === null) return null;
  return <Redirect href={onboarded ? '/chat' : '/welcome'} />;
}
