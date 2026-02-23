import { Search, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { useLocale } from "@/lib/use-locale";
import type { PluginInfo } from "../api";

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

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSearchChange(searchInput);
  };

  return (
    <div className="flex gap-3">
      <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2">
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
        <Select value={pluginName ?? "all"} onValueChange={(v) => onPluginChange(v === "all" ? null : v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t("logs:allPlugins")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("logs:allPlugins")}</SelectItem>
            {pluginOptions.map((plugin) => (
              <SelectItem key={plugin.name} value={plugin.name}>
                {plugin.name}
                {plugin.version && <span className="ml-1 text-muted-foreground">v{plugin.version}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
