import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRepeating } from "./repeat.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startRepeating", () => {
  it("runs the job once per interval, starting one interval in", async () => {
    const run = vi.fn(() => Promise.resolve());
    const job = startRepeating({ everyMs: 60_000, run, onError: () => undefined });
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(3);
    await job.stop();
  });

  it("never starts a run while the last one is still going", async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const job = startRepeating({ everyMs: 1000, run, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    finish();
    await job.stop();
  });

  it("hands a failure on and keeps going", async () => {
    const failure = new Error("database away");
    const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const onError = vi.fn();
    const job = startRepeating({ everyMs: 1000, run, onError });
    await vi.advanceTimersByTimeAsync(2000);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(run).toHaveBeenCalledTimes(2);
    await job.stop();
  });

  it("stops after the run in progress, and runs no more", async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const job = startRepeating({ everyMs: 1000, run, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(1000);
    let stopped = false;
    const stopping = job.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps going when reporting a failure fails too", async () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const run = vi.fn().mockRejectedValueOnce(new Error("first")).mockResolvedValue(undefined);
    const job = startRepeating({
      everyMs: 1000,
      run,
      onError: () => {
        throw new Error("logger away");
      },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledOnce();
    write.mockRestore();
    await job.stop();
  });

  it("leaves no timer behind once stopped", () => {
    const job = startRepeating({
      everyMs: 1000,
      run: () => Promise.resolve(),
      onError: () => undefined,
    });
    expect(vi.getTimerCount()).toBe(1);
    void job.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
