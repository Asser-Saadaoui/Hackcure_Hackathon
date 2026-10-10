export function Brand({ section }: { section?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-[#E6F3F5]">
        <img src="/mascot.png" alt="" className="h-7 w-7" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Sahhanito</span>
      {section && <span className="hidden text-sm text-muted-foreground sm:inline">· {section}</span>}
    </div>
  );
}
