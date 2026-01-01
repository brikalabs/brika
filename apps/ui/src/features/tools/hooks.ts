import { useQuery, useMutation } from "@tanstack/react-query";
import { toolsApi, toolsKeys } from "./api";

export function useTools() {
  return useQuery({ queryKey: toolsKeys.all, queryFn: toolsApi.list });
}

export function useToolCall() {
  return useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) =>
      toolsApi.call(name, args),
  });
}

