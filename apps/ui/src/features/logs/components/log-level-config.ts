import { AlertCircle, AlertTriangle, Bug, Info } from "lucide-react";
import type React from "react";
import type { LogLevel } from "../types";

export const LEVEL_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  error: {
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    icon: AlertCircle,
    label: "ERROR",
  },
  warn: {
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    icon: AlertTriangle,
    label: "WARN",
  },
  info: {
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    icon: Info,
    label: "INFO",
  },
  debug: {
    color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    icon: Bug,
    label: "DEBUG",
  },
};

export const LEVEL_COLORS: Record<LogLevel, string> = {
  error: "bg-red-500/20 text-red-400 hover:bg-red-500/30",
  warn: "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30",
  info: "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
  debug: "bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30",
};
