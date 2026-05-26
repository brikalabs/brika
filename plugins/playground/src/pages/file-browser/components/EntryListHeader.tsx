export function EntryListHeader() {
  return (
    <div className="flex items-center gap-3 border-border/70 border-b px-3 py-2 font-mono text-[10px] text-muted-foreground/80 uppercase tracking-[0.14em]">
      <span className="w-8 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">Name</span>
      <span className="hidden w-20 shrink-0 text-right sm:block">Size</span>
      <span className="hidden w-24 shrink-0 text-right md:block">Modified</span>
      <span className="w-[64px] shrink-0" />
    </div>
  );
}
