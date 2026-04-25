import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@brika/clay/components/card';

/** Plain card. */
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

/** Accent variants — keyed to the theme's --data-* scale. */
export function CardAccentDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      {(['blue', 'emerald', 'orange'] as const).map((accent) => (
        <Card key={accent} accent={accent} className="w-44">
          <CardHeader>
            <CardTitle className="capitalize">{accent}</CardTitle>
            <CardDescription>Accent {accent}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

/** Interactive — hover lift. */
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
