// Runs a job inside the API at a fixed pace, such as the booking deadlines
// every minute (milestone 4 plan, choice 3). The architecture's worker takes
// such jobs over when they need a queue.

export interface RepeatingJob {
  /** Runs no more, and resolves once the run in progress has finished. */
  stop(): Promise<void>;
}

/**
 * Runs `run` every `everyMs`, first one interval after the start. A run that
 * takes longer pushes the next one back, so two runs never overlap. A failed
 * run goes to `onError` and the next run comes as usual. The timer does not
 * keep the process alive.
 */
export function startRepeating(options: {
  readonly everyMs: number;
  readonly run: () => Promise<unknown>;
  readonly onError: (error: unknown) => void;
}): RepeatingJob {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  function schedule(): void {
    timer = setTimeout(() => {
      timer = undefined;
      // A job that throws at once is handled as one that rejects.
      running = Promise.resolve()
        .then(options.run)
        .then(
          () => undefined,
          (error: unknown) => {
            options.onError(error);
          },
        )
        .finally(() => {
          if (!stopped) schedule();
        })
        // Only if reporting the failure failed too: say so, and keep going.
        .catch((error: unknown) => {
          process.stderr.write(
            `A repeating job's failure could not be reported: ${String(error)}\n`,
          );
        });
    }, options.everyMs);
    timer.unref();
  }

  schedule();
  return {
    stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      return running;
    },
  };
}
