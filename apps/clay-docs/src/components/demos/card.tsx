import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@brika/clay/components/card';

/** A plain summary card — the default accent-less variant. */
export function CardDefaultDemo() {
  return (
    <Card className="w-72">
      <CardHeader>
        <CardTitle>Welcome to Clay</CardTitle>
        <CardDescription>Pressable raw material.</CardDescription>
      </CardHeader>
      <CardContent>Build UI with tokens that travel between apps.</CardContent>
    </Card>
  );
}

/** A card with an accent colour keyed to the theme's `--data-*` scale. */
export function CardAccentDemo() {
  return (
    <Card accent="emerald" className="w-72">
      <CardHeader>
        <CardTitle>3 plugins updated</CardTitle>
        <CardDescription>Restart the hub to apply.</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** Interactive card — hover lifts the surface and highlights the border. */
export function CardInteractiveDemo() {
  return (
    <Card interactive className="w-72">
      <CardHeader>
        <CardTitle>Hover me</CardTitle>
        <CardDescription>Interactive cards respond on hover.</CardDescription>
      </CardHeader>
    </Card>
  );
}
