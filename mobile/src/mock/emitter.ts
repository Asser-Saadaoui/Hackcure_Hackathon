type Handler<T> = (e: T) => void;

/** Tiny typed event emitter used to simulate live events (SSE / push) in mock mode. */
export class Emitter<T extends { caseId: string }> {
  private handlers = new Map<string, Set<Handler<T>>>();

  on(caseId: string, h: Handler<T>) {
    if (!this.handlers.has(caseId)) this.handlers.set(caseId, new Set());
    this.handlers.get(caseId)!.add(h);
    return () => { this.handlers.get(caseId)?.delete(h); };
  }

  emit(e: T) {
    this.handlers.get(e.caseId)?.forEach((h) => h(e));
  }
}
