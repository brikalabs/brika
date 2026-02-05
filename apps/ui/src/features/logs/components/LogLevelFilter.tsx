import type { LogLevel } from "@brika/shared";
import { Badge } from "@/components/ui";
import { useLocale } from "@/lib/use-locale";
import { LEVEL_COLORS } from "./log-level-config";

interface LogLevelFilterProps {
  selectedLevels: LogLevel[];
  levelOptions: LogLevel[];
  onLevelsChange: (levels: LogLevel[]) => void;
}

export function LogLevelFilter({
  selectedLevels,
  levelOptions,
  onLevelsChange,
}: Readonly<LogLevelFilterProps>) {
  const { t } = useLocale();

  const toggleLevel = (level: LogLevel) => {
    const newLevels = selectedLevels.includes(level)
      ? selectedLevels.filter((l) => l !== level)
      : [...selectedLevels, level];
    onLevelsChange(newLevels);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-muted-foreground text-sm">{t("logs:filters.level")}:</span>
      {levelOptions.map((level) => (
        <Badge
          key={level}
          variant={selectedLevels.includes(level) ? "default" : "outline"}
          className={`cursor-pointer capitalize ${selectedLevels.includes(level) ? LEVEL_COLORS[level] : ""}`}
          onClick={() => toggleLevel(level)}
        >
          {level}
        </Badge>
      ))}
    </div>
  );
}
