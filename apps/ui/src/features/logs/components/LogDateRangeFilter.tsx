import { Calendar } from "lucide-react";
import { Input } from "@/components/ui";
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

  const formatDateForInput = (date: Date | null): string => {
    if (!date) return "";
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
        onChange={(e) => onDateRangeChange(e.target.value ? new Date(e.target.value) : null, endDate)}
        className="w-auto"
      />
      <span className="text-muted-foreground">{t("logs:filters.to")}</span>
      <Input
        type="datetime-local"
        value={formatDateForInput(endDate)}
        onChange={(e) => onDateRangeChange(startDate, e.target.value ? new Date(e.target.value) : null)}
        className="w-auto"
      />
    </div>
  );
}
