import { Button, Input } from "@brika/clay";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/lib/use-locale";
import type { PluginInfo } from "../api";
import { LogPluginFilter } from "./LogPluginFilter";

interface LogSearchBarProps {
  search: string;
  pluginName: string | null;
  pluginOptions: PluginInfo[];
  hasActiveFilters: boolean;
  onSearchChange: (search: string) => void;
  onPluginChange: (ref: string | null) => void;
  onReset: () => void;
}

export function LogSearchBar({
  search,
  pluginName,
  pluginOptions,
  hasActiveFilters,
  onSearchChange,
  onPluginChange,
  onReset,
}: Readonly<LogSearchBarProps>) {
  const { t } = useLocale();
  const [searchInput, setSearchInput] = useState(search);

  return (
    <div className="flex gap-3">
      <form onSubmit={(e) => { e.preventDefault(); onSearchChange(searchInput); }} className="flex flex-1 gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("logs:searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          {t("common:actions.search")}
        </Button>
      </form>

      {pluginOptions.length > 0 && (
        <LogPluginFilter
          pluginName={pluginName}
          pluginOptions={pluginOptions}
          onPluginChange={onPluginChange}
        />
      )}

      {hasActiveFilters && (
        <Button variant="ghost" onClick={onReset} className="gap-2">
          <X className="size-4" />
          {t("logs:clearFilters")}
        </Button>
      )}
    </div>
  );
}
