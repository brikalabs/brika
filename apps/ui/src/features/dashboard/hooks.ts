import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/query";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => fetcher<{ ok: boolean }>("/api/health"),
    refetchInterval: 5000,
  });
}

