import { Badge } from "@brika/clay";
import { useCapture } from "@/features/analytics/hooks";
import { useLocale } from "@/lib/use-locale";
import type { LogLevel } from "../types";
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
  const capture = useCapture();

  const toggleLevel = (level: LogLevel) => {
    const enabled = !selectedLevels.includes(level);
    const newLevels = enabled
      ? [...selectedLevels, level]
      : selectedLevels.filter((l) => l !== level);
    capture("logs.level_filter_changed", { level, enabled });
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
