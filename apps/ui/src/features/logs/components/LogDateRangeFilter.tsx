import { Input } from "@brika/clay";
import { Calendar } from "lucide-react";
import { useCapture } from "@/features/analytics/hooks";
import { useLocale } from "@/lib/use-locale";

interface LogDateRangeFilterProps {
  startDate: Date | null;
  endDate: Date | null;
  onDateRangeChange: (start: Date | null, end: Date | null) => void;
}

export function LogDateRangeFilter({
  startDate,
  endDate,
  onDateRangeChange,
}: Readonly<LogDateRangeFilterProps>) {
  const { t } = useLocale();
  const capture = useCapture();

  const formatDateForInput = (date: Date | null): string => {
    if (!date) { return ""; }
    // Format as local datetime string for datetime-local input
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  };

  return (
    <div className="flex items-center gap-3">
      <Calendar className="size-4 text-muted-foreground" />
      <Input
        type="datetime-local"
        value={formatDateForInput(startDate)}
        onChange={(e) => {
          const next = e.target.value ? new Date(e.target.value) : null;
          capture("logs.date_range_changed", { bound: "start", set: next !== null });
          onDateRangeChange(next, endDate);
        }}
        className="w-auto"
      />
      <span className="text-muted-foreground">{t("logs:filters.to")}</span>
      <Input
        type="datetime-local"
        value={formatDateForInput(endDate)}
        onChange={(e) => {
          const next = e.target.value ? new Date(e.target.value) : null;
          capture("logs.date_range_changed", { bound: "end", set: next !== null });
          onDateRangeChange(startDate, next);
        }}
        className="w-auto"
      />
    </div>
  );
}
