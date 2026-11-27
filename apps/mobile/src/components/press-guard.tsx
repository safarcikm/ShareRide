import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** How long main buttons take no press, in milliseconds. */
const halfASecond = 500;

interface Guard {
  /** A main button took a press. */
  readonly pressed: () => void;
  /** A main button came, or says other words now. */
  readonly changed: () => void;
  /** Another page opened. */
  readonly opened: () => void;
  /** No main button takes a press now. */
  readonly holding: boolean;
}

const PressGuardContext = createContext<Guard | null>(null);

/**
 * Keeps a second press from landing on the next main button. A screen's
 * main button stands in the same place on every screen (spec 31, R31.1),
 * so a press meant for one can land on the one that took its place: the
 * way back after an outcome, before the outcome is read, or the next
 * step's button, as "Publish ride" after "Check your ride".
 *
 * For half a second after a main button took a press, no main button
 * takes one. From when that press opens another page the half second
 * starts again, and once more from when a main button comes after it, or
 * the same one says other words, however long the answer or the page
 * took. A main button whose words change by themselves, as with the
 * number of seats, is not held.
 *
 * A held button looks as it did and says to a screen reader that it is
 * not to be pressed. With no guard around them, as in a part's own test,
 * buttons hold nothing. A guard inside another leaves the holding to the
 * one further out: tests of whole flows, which press faster than anyone,
 * render the app in one that holds for no time.
 */
export function PressGuard({
  holdsFor = halfASecond,
  children,
}: {
  readonly holdsFor?: number;
  readonly children: ReactNode;
}) {
  const outer = useContext(PressGuardContext);
  const [holding, setHolding] = useState(false);
  // A main button took a press, and no main button has come of it yet.
  const waiting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const acts = useMemo(() => {
    const hold = () => {
      if (holdsFor <= 0) return;
      if (timer.current !== null) clearTimeout(timer.current);
      setHolding(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        setHolding(false);
      }, holdsFor);
    };
    return {
      pressed: () => {
        waiting.current = true;
        hold();
      },
      changed: () => {
        if (!waiting.current) return;
        waiting.current = false;
        hold();
      },
      // The page may have its main button already, or show it only later:
      // the press goes on waiting for one.
      opened: () => {
        if (waiting.current) hold();
      },
    };
  }, [holdsFor]);
  const guard = useMemo(() => ({ ...acts, holding }), [acts, holding]);
  return <PressGuardContext.Provider value={outer ?? guard}>{children}</PressGuardContext.Provider>;
}

const nothing = () => undefined;

/**
 * For a main button with these words: whether it is held now, and what to
 * call when it takes a press. Any other button is never held.
 */
export function useMainButton(
  main: boolean,
  words: string,
): { readonly held: boolean; readonly pressed: () => void } {
  const guard = useContext(PressGuardContext);
  const changed = main ? guard?.changed : undefined;
  // When it comes, and when its words change.
  useLayoutEffect(() => {
    changed?.();
  }, [changed, words]);
  if (!main || guard === null) return { held: false, pressed: nothing };
  return { held: guard.holding, pressed: guard.pressed };
}

/** Tells the guard that another page is open: `page` is its address. */
export function useNewPageHolds(page: string): void {
  const opened = useContext(PressGuardContext)?.opened;
  useLayoutEffect(() => {
    opened?.();
  }, [opened, page]);
}
