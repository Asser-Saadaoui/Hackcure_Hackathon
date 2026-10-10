import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { getJSON, Keys } from '@/lib/storage';

/** Entry: consent on first open, otherwise the patient workspace. */
export default function Index() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => { getJSON(Keys.onboarding).then((o) => setOnboarded(!!o)); }, []);

  if (onboarded === null) return null;
  return <Redirect href={onboarded ? '/home' : '/welcome'} />;
}
