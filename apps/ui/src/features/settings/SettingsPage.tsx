/**
 * Settings Page
 *
 * Application preferences including language selection.
 */

import { useLocale } from "@/lib/use-locale";
import { useAvailableLocales } from "./hooks";
import {
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Separator,
} from "@/components/ui";
import { Settings, Globe, Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Language Selector
// ─────────────────────────────────────────────────────────────────────────────

function LanguageSelector() {
  const { locale, changeLocale, getLanguageName, t } = useLocale();
  const { data: locales, isLoading } = useAvailableLocales();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>{t("common:messages.loading")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium">{t("settings:language.title")}</Label>
          <p className="text-sm text-muted-foreground">{t("settings:language.description")}</p>
        </div>
      </div>

      <Select value={locale} onValueChange={changeLocale}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales?.map((loc) => (
            <SelectItem key={loc} value={loc}>
              <span className="flex items-center gap-2">
                <span className="font-medium">{getLanguageName(loc)}</span>
                <span className="text-muted-foreground uppercase text-xs">({loc})</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Page
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="size-6" />
          {t("settings:title")}
        </h2>
        <p className="text-muted-foreground">{t("settings:subtitle")}</p>
      </div>

      {/* Language Section */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="size-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">{t("settings:sections.language")}</h3>
          </div>
          <Separator className="mb-6" />
          <LanguageSelector />
        </CardContent>
      </Card>
    </div>
  );
}
