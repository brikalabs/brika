import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@brika/clay";
import { Plug } from "lucide-react";
import { useLocale } from "@/lib/use-locale";
import { pluginsApi } from "../../plugins/api";
import { usePlugins } from "../../plugins/hooks";
import type { PluginInfo } from "../api";

interface LogPluginFilterProps {
  pluginName: string | null;
  pluginOptions: PluginInfo[];
  onPluginChange: (name: string | null) => void;
}

export function LogPluginFilter({
  pluginName,
  pluginOptions,
  onPluginChange,
}: Readonly<LogPluginFilterProps>) {
  const { t, tp } = useLocale();
  const { data: plugins = [] } = usePlugins();

  return (
    <Select
      value={pluginName ?? "all"}
      onValueChange={(v) => onPluginChange(v === "all" ? null : v)}
    >
      <SelectTrigger className="w-56">
        <Plug className="mr-2 size-4 text-muted-foreground" />
        <SelectValue placeholder={t("logs:filters.plugin")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("logs:allPlugins")}</SelectItem>
        {pluginOptions.map((info) => {
          const plugin = plugins.find((p) => p.name === info.name);
          const uid = plugin?.uid ?? info.uid;
          return (
            <SelectItem key={info.name} value={info.name}>
              <span className="flex items-center gap-2">
                <Avatar className="size-5">
                  {uid && <AvatarImage src={pluginsApi.getIconUrl(uid)} />}
                  <AvatarFallback className="bg-primary/10 text-[8px]">
                    <Plug className="size-3" />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {tp(info.name, "name", plugin?.displayName ?? info.name)}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
