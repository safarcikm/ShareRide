import {
  adminMoveMeetingPointRoute,
  type AdminMeetingPoint,
  type AdminMeetingPointMoved,
} from "@shareride/contracts";
import { metresMoved, pointMovedFar, validateMove } from "@shareride/domain";
import type { MessageKey } from "@shareride/i18n";
import { useEffect, useId, useState } from "react";
import { useConsole } from "../../console.tsx";
import { osmLink, readSpot } from "./form-values.ts";
import { issueKey, type FieldIssue } from "./texts.ts";

/** What a move came to, for the page to show; a failed one stays open here. */
export type MoveResult =
  | { readonly kind: "moved"; readonly moved: AdminMeetingPointMoved }
  /** Saved, retired or made a draft elsewhere since the page loaded it. */
  | { readonly kind: "changed" };

/**
 * Moving a point in use (spec 2, 3.6.6): a new spot, pasted as for a
 * draft, how far it is from the point, and who is told. Moved more than
 * 50 m (`pointMovedFar`), the drivers and passengers of its upcoming trips
 * are told (R2.10); its distances are computed again either way.
 */
export function MoveStep({
  point,
  onResult,
  onCancel,
}: {
  readonly point: AdminMeetingPoint;
  readonly onResult: (result: MoveResult) => void;
  readonly onCancel: () => void;
}) {
  const { t, call } = useConsole();
  const [spot, setSpot] = useState("");
  const [issue, setIssue] = useState<FieldIssue | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = useId();
  const fieldId = `${base}-spot`;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const noteId = `${base}-note`;
  const name = point.nameIs;

  useEffect(() => {
    document.getElementById(fieldId)?.focus();
  }, [fieldId]);

  const read = readSpot(spot);
  const to = "position" in read ? read.position : null;

  /** How far the new spot is, and whether anyone is told. */
  const note = (): string | null => {
    if (to === null) return null;
    const metres = metresMoved(point.position, to);
    let key: MessageKey = "admin.meetingPoint.moveNear";
    if (pointMovedFar(point.position, to)) {
      key =
        point.futureTrips > 0 ? "admin.meetingPoint.moveFar" : "admin.meetingPoint.moveFarNoTrips";
    }
    return t(key, { metres, count: point.futureTrips });
  };
  const noteText = note();

  /** The problem is shown under the field, which takes the focus so it is read. */
  function show(found: FieldIssue) {
    setIssue(found);
    document.getElementById(fieldId)?.focus();
  }

  async function submit() {
    if (busy) return;
    setFailed(false);
    if (to === null) {
      show("problem" in read && read.problem !== null ? read.problem : "required");
      return;
    }
    const checked = validateMove(point.position, to);
    if (!checked.ok) {
      show(checked.error);
      return;
    }
    setBusy(true);
    const result = await call(adminMoveMeetingPointRoute, {
      params: { id: point.id },
      body: { position: checked.value, updatedAt: point.updatedAt },
    });
    setBusy(false);
    if (result.ok) {
      onResult({ kind: "moved", moved: result.data });
      return;
    }
    const { code, details } = result.error;
    const [detail] = details ?? [];
    if (code === "validation_failed" && detail !== undefined) {
      show(detail.issue as FieldIssue);
    } else if (code === "meeting_point_changed" || code === "move_not_allowed") {
      onResult({ kind: "changed" });
    } else {
      setFailed(true);
    }
  }

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="type-body">{t("admin.meetingPoint.moveIntro")}</p>
      <div className="field">
        <label htmlFor={fieldId} className="type-label">
          {t("admin.meetingPoint.newSpot")}
        </label>
        <input
          id={fieldId}
          className="input wide type-body"
          autoComplete="off"
          value={spot}
          aria-invalid={issue !== null}
          aria-describedby={[hintId, issue === null ? null : errorId]
            .filter((part) => part !== null)
            .join(" ")}
          onChange={(event) => {
            setSpot(event.target.value);
            setIssue(null);
          }}
        />
        <p id={hintId} className="hint type-small">
          {t("admin.meetingPoint.spotHint")}
        </p>
        {issue === null ? null : (
          <p id={errorId} className="field-error type-small">
            {t(issueKey("position", issue))}
          </p>
        )}
      </div>
      {noteText === null || to === null ? null : (
        <>
          <p id={noteId} className="notice type-body" aria-live="polite">
            {noteText}
          </p>
          <a
            className="type-label"
            href={osmLink(to.latitude, to.longitude)}
            target="_blank"
            rel="noreferrer"
          >
            {t("admin.meetingPoint.openInMaps")}
          </a>
        </>
      )}
      {failed ? (
        <p className="problem type-body" role="alert">
          {t("admin.meetingPoint.moveFailed")}
        </p>
      ) : null}
      <div className="actions">
        <button
          type="submit"
          className="button-primary type-button"
          aria-disabled={busy}
          aria-describedby={noteText === null ? undefined : noteId}
        >
          {t(busy ? "admin.meetingPoint.moving" : "admin.meetingPoint.moveConfirm", { name })}
        </button>
        <button
          type="button"
          className="button-quiet type-label"
          disabled={busy}
          onClick={onCancel}
        >
          {t("admin.meetingPoint.keepWhereItIs")}
        </button>
      </div>
    </form>
  );
}
