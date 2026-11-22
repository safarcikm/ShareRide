import {
  adminActivateMeetingPointRoute,
  type AdminMeetingPointListItem,
} from "@shareride/contracts";
import { activationItems, type ActivationItem } from "@shareride/domain";
import { useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";
import { itemKeys } from "./activation.tsx";

/** Why one of the drafts was not activated. */
type Refusal =
  | { readonly kind: "missing"; readonly items: readonly ActivationItem[] }
  | { readonly kind: "changed" }
  | { readonly kind: "failed" };

type Run =
  | { readonly state: "idle"; readonly noneTicked: boolean }
  | { readonly state: "working"; readonly done: number; readonly count: number }
  | {
      readonly state: "finished";
      readonly activated: number;
      readonly refused: readonly {
        readonly id: string;
        readonly name: string;
        readonly why: Refusal;
      }[];
    };

const isItem = (path: string): path is ActivationItem =>
  activationItems.some((item) => item === path);

/**
 * Activating several drafts at once, from the list (spec 21, 3.5): the
 * operator ticks the drafts they have checked, and each is activated in
 * turn with `confirmToday`, so the API counts its amenities and season as
 * reviewed and today as the day confirmed. One at a time, as each computes
 * its distances; a draft the API refuses stays a draft, with the reason.
 */
export function ActivateSeveral({
  drafts,
  selected,
  onSelect,
  onFinished,
}: {
  /** The drafts the list shows. */
  readonly drafts: readonly AdminMeetingPointListItem[];
  /** Those ticked. */
  readonly selected: ReadonlySet<string>;
  readonly onSelect: (ids: ReadonlySet<string>) => void;
  /** Some were activated or refused: the list is loaded again. */
  readonly onFinished: () => void;
}) {
  const { t, call } = useConsole();
  const base = useId();
  const [run, setRun] = useState<Run>({ state: "idle", noneTicked: false });
  const said = useRef<HTMLParagraphElement>(null);
  const ticked = drafts.filter((point) => selected.has(point.id));

  useEffect(() => {
    if (run.state === "finished" || (run.state === "idle" && run.noneTicked)) {
      said.current?.focus();
    }
  }, [run]);

  async function activateTicked() {
    if (run.state === "working") return;
    if (ticked.length === 0) {
      setRun({ state: "idle", noneTicked: true });
      return;
    }
    const refused: { id: string; name: string; why: Refusal }[] = [];
    let activated = 0;
    for (const [index, point] of ticked.entries()) {
      setRun({ state: "working", done: index, count: ticked.length });
      const result = await call(adminActivateMeetingPointRoute, {
        params: { id: point.id },
        body: { updatedAt: point.updatedAt, confirmToday: true },
      });
      if (result.ok) {
        activated++;
        continue;
      }
      const { code, details } = result.error;
      refused.push({
        id: point.id,
        name: point.nameIs,
        why:
          code === "activation_not_ready"
            ? {
                kind: "missing",
                items: (details ?? []).map((detail) => detail.path).filter(isItem),
              }
            : code === "meeting_point_changed" || code === "status_change_not_allowed"
              ? { kind: "changed" }
              : { kind: "failed" },
      });
    }
    onSelect(new Set());
    setRun({ state: "finished", activated, refused });
    onFinished();
  }

  const whyText = (why: Refusal) =>
    why.kind === "missing"
      ? t("admin.activateSeveral.missing", {
          items: why.items.map((item) => t(itemKeys[item])).join(", "),
        })
      : t(
          why.kind === "changed" ? "admin.activateSeveral.changed" : "admin.activateSeveral.failed",
        );

  const titleId = `${base}-title`;
  const refusedId = `${base}-refused`;
  const working = run.state === "working";

  return (
    <section className="panel stack" aria-labelledby={titleId}>
      <h2 id={titleId} className="type-heading">
        {t("admin.activateSeveral.title")}
      </h2>
      {drafts.length > 0 ? (
        <>
          <p className="type-body">{t("admin.activateSeveral.intro")}</p>
          <p className="hint type-small">{t("admin.activateSeveral.note")}</p>
          <div className="actions">
            <button
              type="button"
              className="button-primary type-button"
              aria-disabled={working}
              onClick={() => void activateTicked()}
            >
              {t("admin.activateSeveral.activate", { count: ticked.length })}
            </button>
            <button
              type="button"
              className="button-secondary type-label"
              aria-disabled={working}
              onClick={() => {
                if (working) return;
                onSelect(new Set(drafts.map((point) => point.id)));
                setRun({ state: "idle", noneTicked: false });
              }}
            >
              {t("admin.activateSeveral.selectAll")}
            </button>
            {ticked.length > 0 ? (
              <button
                type="button"
                className="button-quiet type-label"
                aria-disabled={working}
                onClick={() => {
                  if (!working) onSelect(new Set());
                }}
              >
                {t("admin.activateSeveral.clear")}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {run.state === "idle" && run.noneTicked ? (
        <p ref={said} className="problem type-body" role="alert" tabIndex={-1}>
          {t("admin.activateSeveral.noneTicked")}
        </p>
      ) : null}
      {run.state === "working" ? (
        <p className="type-body" role="status">
          {t("admin.activateSeveral.working", { done: run.done + 1, count: run.count })}
        </p>
      ) : null}
      {run.state === "finished" ? (
        <div className="stack">
          <p ref={said} className="type-body-strong" role="status" tabIndex={-1}>
            {t("admin.activateSeveral.activated", { count: run.activated })}
          </p>
          {run.refused.length > 0 ? (
            <>
              <p id={refusedId} className="type-body">
                {t("admin.activateSeveral.notActivated")}
              </p>
              <ul className="stack" aria-labelledby={refusedId}>
                {run.refused.map((refusal) => (
                  <li key={refusal.id} className="type-body">
                    {t("admin.activateSeveral.refused", {
                      name: refusal.name,
                      why: whyText(refusal.why),
                    })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
