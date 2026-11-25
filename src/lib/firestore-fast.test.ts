import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (...a: unknown[]) => toastMock(...a) }));

import { settleFast, FAST_WRITE_MS } from './firestore-fast';

describe('settleFast', () => {
  beforeEach(() => { vi.useFakeTimers(); toastMock.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("rend le résultat quand le serveur répond vite", async () => {
    await expect(settleFast(Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it("lève l'erreur quand le serveur refuse vite", async () => {
    await expect(settleFast(Promise.reject(new Error('refus')))).rejects.toThrow('refus');
  });

  it("rend la main après le délai sans attendre le serveur", async () => {
    const never = new Promise<string>(() => {});
    const p = settleFast(never);
    await vi.advanceTimersByTimeAsync(FAST_WRITE_MS);
    await expect(p).resolves.toBeUndefined();
  });

  it("signale une erreur qui arrive après le délai", async () => {
    let reject!: (e: unknown) => void;
    const slow = new Promise<void>((_, r) => { reject = r; });
    const p = settleFast(slow);
    await vi.advanceTimersByTimeAsync(FAST_WRITE_MS);
    await p;
    reject(Object.assign(new Error('x'), { code: 'permission-denied' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});
