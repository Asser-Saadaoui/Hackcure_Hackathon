// Magic UI interactive action treatment shared with dashboard buttons (MIT).
import { Button } from './button';

export function InteractiveHoverButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button variant="outline" size="lg" {...props} />;
}
