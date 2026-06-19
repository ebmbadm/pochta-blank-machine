import { Stamp } from "lucide-react";

/** Шапка приложения: воздушно-почтовая полоса + словесный знак. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="airmail-border h-1 w-full opacity-90" />
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-postal-blue/10 text-postal-blue ring-1 ring-postal-blue/20">
            <Stamp className="size-5" />
          </span>
          <div className="leading-none">
            <div className="font-display text-lg font-extrabold tracking-tight text-foreground">
              БЛАНК-МАШИНА
            </div>
            <div className="stamp-label mt-1">переверстка бланков · pochta.ru</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="stamp-label rounded-md border border-border bg-card px-2 py-1">
            CN&nbsp;22 · A4
          </span>
        </div>
      </div>
    </header>
  );
}
