import {
  adminActivateMeetingPointRoute,
  adminActivationChecklistRoute,
  type AdminActivationChecklist,
  type AdminMeetingPoint,
} from "@shareride/contracts";
import { activationItems, type ActivationItem } from "@shareride/domain";
import type { MessageKey } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";
import type { StatusResult } from "./status-panel.tsx";

const itemKeys: Record<ActivationItem, MessageKey> = {
  details: "admin.activation.item.details",
  whereToStand: "admin.activation.item.whereToStand",
  photos: "admin.activation.item.photos",
  amenities: "admin.activation.item.amenities",
  season: "admin.activation.item.season",
  confirmed: "admin.activation.item.confirmed",
  legs: "admin.activation.item.legs",
};

type Checklist = AdminActivationChecklist | "loading" | "failed";

/**
 * A draft's activation checklist (R2.3) and its Activate button (spec 2,
 * 3.6.3). The API checks what is saved, so the list is loaded again when
 * the point or one of its photos is saved (`version`). Activating a draft
 * that is not ready says how much is left instead of sending it.
 */
export function ActivationChecklist({
  point,
  version,
  onResult,
}: {
  readonly point: AdminMeetingPoint;
  /** Changes when a photo is added, described or removed. */
  readonly version: number;
  readonly onResult: (result: StatusResult) => void;
}) {
  const { t, call } = useConsole();
  const base = useId();
  const [checklist, setChecklist] = useState<Checklist>("loading");
  // Activate was pressed while something was still to do: the list says what.
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // Counts the times the "still to do" message is shown, so each one takes the focus.
  const [shown, setShown] = useState(0);
  const notReady = useRef<HTMLParagraphElement>(null);
  // The last load asked for, so an older answer arriving late is dropped.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const asked = ++latest.current;
    const result = await call(adminActivationChecklistRoute, { params: { id: point.id } });
    if (asked === latest.current) setChecklist(result.ok ? result.data : "failed");
  }, [call, point.id]);

  // Saving the point gives it a new `updatedAt`; saving a photo, a new `version`.
  useEffect(() => {
    void load();
  }, [load, point.updatedAt, version]);

  useEffect(() => {
    if (shown > 0) notReady.current?.focus();
  }, [shown]);

  const showNotReady = () => {
    setTried(true);
    setShown((count) => count + 1);
  };

  async function activate() {
    if (busy || checklist === "loading") return;
    if (checklist !== "failed" && !checklist.ready) {
      showNotReady();
      return;
    }
    setBusy(true);
    const result = await call(adminActivateMeetingPointRoute, {
      params: { id: point.id },
      body: { updatedAt: point.updatedAt },
    });
    setBusy(false);
    if (result.ok) {
      onResult({ kind: "done", point: result.data, change: "activate" });
      return;
    }
    const { code, details } = result.error;
    if (code === "activation_not_ready") {
      // What the API found, which can be newer than the list shown.
      const missing = new Set((details ?? []).map((detail) => detail.path));
      latest.current++;
      setChecklist({
        items: activationItems.map((item) => ({ item, done: !missing.has(item) })),
        ready: false,
      });
      showNotReady();
    } else if (code === "meeting_point_changed" || code === "status_change_not_allowed") {
      onResult({ kind: "changed" });
    } else {
      onResult({ kind: "failed" });
    }
  }

  const titleId = `${base}-title`;
  const noteId = `${base}-note`;

  if (checklist === "loading") {
    return (
      <p className="type-body" role="status">
        {t("common.loading")}
      </p>
    );
  }
  if (checklist === "failed") {
    return (
      <div className="stack">
        <p className="problem type-body">{t("admin.activation.failed")}</p>
        <div className="actions">
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => {
              setChecklist("loading");
              void load();
            }}
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  const toDo = checklist.items.filter((check) => !check.done).length;

  return (
    <div className="stack">
      <div className="card-text">
        <h3 id={titleId} className="checklist-title type-body-strong">
          {t("admin.activation.title")}
        </h3>
        <p className="hint type-small">{t("admin.activation.fromSaved")}</p>
      </div>
      <ul className="checklist" aria-labelledby={titleId}>
        {checklist.items.map((check) => (
          <li key={check.item} className="checklist-item type-body">
            <span>{t(itemKeys[check.item])}</span>{" "}
            <span className={check.done ? "tag type-small" : "tag tag-warning type-small"}>
              {t(check.done ? "admin.activation.done" : "admin.activation.toDo")}
            </span>
          </li>
        ))}
      </ul>
      {tried && toDo > 0 ? (
        <p ref={notReady} className="problem type-body" role="alert" tabIndex={-1}>
          {t("admin.activation.notReady", { count: toDo, name: point.nameIs })}
        </p>
      ) : null}
      <p id={noteId} className="type-body">
        {t("admin.activation.note")}
      </p>
      <div className="actions">
        <button
          type="button"
          className="button-primary type-label"
          aria-disabled={busy}
          aria-describedby={noteId}
          onClick={() => void activate()}
        >
          {t("admin.activation.activate", { name: point.nameIs })}
        </button>
      </div>
    </div>
  );
}
