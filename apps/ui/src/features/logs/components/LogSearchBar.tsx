import { Button, InputGroup, InputGroupAddon, InputGroupInput } from "@brika/clay";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { useCapture } from "@/features/analytics/hooks";
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
  const capture = useCapture();
  const [searchInput, setSearchInput] = useState(search);

  return (
    <div className="flex gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          capture("logs.searched", { hasQuery: searchInput.trim().length > 0 });
          onSearchChange(searchInput);
        }}
        className="flex flex-1 gap-2"
      >
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("logs:searchPlaceholder")}
          />
        </InputGroup>
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
        <Button
          variant="ghost"
          onClick={() => {
            capture("logs.filters_reset");
            onReset();
          }}
          className="gap-2"
        >
          <X className="size-4" />
          {t("logs:clearFilters")}
        </Button>
      )}
    </div>
  );
}
