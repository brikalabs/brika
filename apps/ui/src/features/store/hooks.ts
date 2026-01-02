import { useMutation } from "@tanstack/react-query";
import { storeApi } from "./api";

export function useStoreMutations() {
  return {
    install: useMutation({
      mutationFn: ({ ref, wanted }: { ref: string; wanted?: string }) => storeApi.install(ref, wanted),
    }),
    uninstall: useMutation({ mutationFn: storeApi.uninstall }),
  };
}
