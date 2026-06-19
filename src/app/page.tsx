"use client";

import { AppHeader } from "@/components/AppHeader";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ControlsPanel } from "@/components/ControlsPanel";
import PreviewCanvas from "@/components/PreviewCanvas";
import { useEditorState } from "@/state/useEditorState";

export default function Home() {
  const api = useEditorState();
  const ready = api.status === "ready";

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      {!ready ? (
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
          <div className="w-full max-w-xl">
            <UploadDropzone api={api} />
          </div>
        </main>
      ) : (
        <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-[72px] lg:h-fit">
            <ControlsPanel api={api} />
          </aside>
          <section className="min-h-[60vh] rounded-xl bg-muted/40 p-4 ring-1 ring-foreground/5 sm:p-8">
            <PreviewCanvas api={api} />
          </section>
        </main>
      )}

      <footer className="border-t border-border/70 px-4 py-4 text-center sm:px-6">
        <p className="stamp-label">
          обработка в браузере · бланк не покидает ваше устройство
        </p>
      </footer>
    </div>
  );
}
