import type { LogSource } from "../types";
import { Badge } from "@/components/ui";
import { useLocale } from "@/lib/use-locale";

interface LogSourceFilterProps {
  selectedSources: LogSource[];
  sourceOptions: LogSource[];
  onSourcesChange: (sources: LogSource[]) => void;
}

export function LogSourceFilter({
  selectedSources,
  sourceOptions,
  onSourcesChange,
}: Readonly<LogSourceFilterProps>) {
  const { t } = useLocale();

  const toggleSource = (source: LogSource) => {
    const newSources = selectedSources.includes(source)
      ? selectedSources.filter((s) => s !== source)
      : [...selectedSources, source];
    onSourcesChange(newSources);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-muted-foreground text-sm">{t("logs:filters.source")}:</span>
      {sourceOptions.map((source) => (
        <Badge
          key={source}
          variant={selectedSources.includes(source) ? "default" : "outline"}
          className="cursor-pointer capitalize"
          onClick={() => toggleSource(source)}
        >
          {source}
        </Badge>
      ))}
    </div>
  );
}
