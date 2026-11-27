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

/** How long a press waits for what comes of it, in milliseconds. */
const tenSeconds = 10_000;

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
 * takes one, and no other button of a screen's bar (`HeldWithMain`): the
 * button under the main one stands where a lone main button stood. From
 * when that press opens another page the half second starts again, and
 * once more from when a main button comes after it, or the same one says
 * other words, if the answer or the page took no more than ten seconds:
 * nobody presses a second time for a press longer ago. A main button
 * whose words change by themselves, as with the number of seats, is not
 * held.
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
  // When a main button took a press of which no main button has come yet.
  const pressedAt = useRef<number | null>(null);
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
    const waiting = () => {
      if (pressedAt.current === null) return false;
      if (Date.now() - pressedAt.current <= tenSeconds) return true;
      pressedAt.current = null;
      return false;
    };
    return {
      pressed: () => {
        pressedAt.current = Date.now();
        hold();
      },
      changed: () => {
        if (!waiting()) return;
        pressedAt.current = null;
        hold();
      },
      // The page may have its main button already, or show it only later:
      // the press goes on waiting for one.
      opened: () => {
        if (waiting()) hold();
      },
    };
  }, [holdsFor]);
  const guard = useMemo(() => ({ ...acts, holding }), [acts, holding]);
  return <PressGuardContext.Provider value={outer ?? guard}>{children}</PressGuardContext.Provider>;
}

const InBarContext = createContext(false);

/**
 * Around the buttons of a screen's bottom bar: each is held while the
 * main buttons are, whatever its kind. Only a main button's press starts
 * a hold.
 */
export function HeldWithMain({ children }: { readonly children: ReactNode }) {
  return <InBarContext.Provider value={true}>{children}</InBarContext.Provider>;
}

const nothing = () => undefined;

/**
 * For a button with these words: whether it is held now, and what to call
 * when it takes a press. A main button is held, and one in a screen's
 * bar; any other never is.
 */
export function useMainButton(
  main: boolean,
  words: string,
  busy = false,
): { readonly held: boolean; readonly pressed: () => void } {
  const guard = useContext(PressGuardContext);
  const inBar = useContext(InBarContext);
  const changed = main ? guard?.changed : undefined;
  const told = useRef<string | null>(null);
  // When it comes, and when its words change. Words that change while it
  // is busy are told once it takes a press again: until then the press
  // goes on waiting, for this button or one that comes meanwhile.
  useLayoutEffect(() => {
    if (told.current === words || (told.current !== null && busy)) return;
    told.current = words;
    changed?.();
  }, [changed, words, busy]);
  if (guard === null || !(main || inBar)) return { held: false, pressed: nothing };
  return { held: guard.holding, pressed: main ? guard.pressed : nothing };
}

/** Tells the guard that another page is open: `page` is its address. */
export function useNewPageHolds(page: string): void {
  const opened = useContext(PressGuardContext)?.opened;
  useLayoutEffect(() => {
    opened?.();
  }, [opened, page]);
}
