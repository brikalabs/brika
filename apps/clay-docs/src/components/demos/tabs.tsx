import { Tabs, TabsContent, TabsList, TabsTrigger } from '@brika/clay/components/tabs';

export function TabsDefaultDemo() {
  return (
    <Tabs defaultValue="overview" className="w-full max-w-md">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-4 text-clay-default text-sm">
        Overview content.
      </TabsContent>
      <TabsContent value="activity" className="mt-4 text-clay-default text-sm">
        Activity feed.
      </TabsContent>
      <TabsContent value="settings" className="mt-4 text-clay-default text-sm">
        Settings panel.
      </TabsContent>
    </Tabs>
  );
}
