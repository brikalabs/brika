import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionInfo,
  SectionTitle,
} from '@brika/clay/components/section';

export function SectionDefaultDemo() {
  return (
    <Section className="w-full max-w-md">
      <SectionHeader>
        <SectionInfo>
          <SectionTitle>Connected services</SectionTitle>
          <SectionDescription>Manage integrations and API keys.</SectionDescription>
        </SectionInfo>
      </SectionHeader>
      <SectionContent className="text-clay-default text-sm">
        Three services are connected.
      </SectionContent>
    </Section>
  );
}
