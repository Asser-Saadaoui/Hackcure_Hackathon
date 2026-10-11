export function Brand({ section }: { section?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E5F0F5]">
        <img src="/mascot.png" alt="" className="h-10 w-10" />
      </span>
      <span aria-label="Sahhanito — صحة نيتو" className="inline-flex flex-col">
        <span className="text-2xl font-extrabold leading-none tracking-[-1px] text-[#185079]">Sahha<span className="text-[#3885AB]">nito</span></span>
        <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span lang="ar">صحة نيتو</span>
          <svg width="56" height="13" viewBox="0 0 56 13" aria-hidden="true"><path d="M1 7H18L22 3L26 11L30 1L34 7H55" stroke="#3885AB" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </span>
      {section && <span className="hidden text-sm text-muted-foreground sm:inline">· {section}</span>}
    </div>
  );
}
