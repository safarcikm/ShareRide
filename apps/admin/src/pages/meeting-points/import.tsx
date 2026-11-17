import { adminImportMeetingPointsRoute, type AdminImportRow } from "@shareride/contracts";
import {
  amenities,
  importColumns,
  importLimits,
  importListSeparator,
  meetingPointLimits,
  meetingPointTypes,
  regions,
  requiredImportColumns,
} from "@shareride/domain";
import {
  amenityKeys,
  regionKeys,
  seasonText,
  typeKeys,
  type MessageKey,
  type Translate,
} from "@shareride/i18n";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { meetingPointsPath } from "./list.tsx";
import { issueKey } from "./texts.ts";

export const importPath = `${meetingPointsPath}/import`;

type FocusTarget = "file" | "rows" | "message" | "problems" | null;

type FileFieldProblem = "required" | "tooLarge" | "unreadable";

const fileFieldKeys: Record<FileFieldProblem, MessageKey> = {
  required: "admin.meetingPointImport.fileRequired",
  tooLarge: "admin.meetingPointImport.tooLarge",
  unreadable: "admin.meetingPointImport.unreadable",
};

interface Detail {
  readonly path: string;
  readonly issue: string;
}

/** The rows the API read, from the file it read them from; saved once added. */
interface Checked {
  readonly file: string;
  readonly rows: readonly AdminImportRow[];
  readonly added: number | null;
}

type Message = { readonly kind: "status" | "alert"; readonly text: string } | null;

/** The file's text, as UTF-8; the API says if it was saved in another encoding. */
function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("The file could not be read."));
    };
    reader.readAsText(file, "utf-8");
  });
}

/** Why a file cannot be read, from the API's `columns.<name>`, `lines.<n>` or `file`. */
function fileProblemText(t: Translate, { path, issue }: Detail): string {
  const [, rest = ""] = path.split(/\.(.*)/s);
  switch (issue) {
    case "unknown_column":
      return t("admin.meetingPointImport.unknownColumn", { column: rest });
    case "repeated_column":
      return t("admin.meetingPointImport.repeatedColumn", { column: rest });
    case "unnamed_column":
      return t("admin.meetingPointImport.unnamedColumn", { position: rest });
    case "missing_column":
      return t("admin.meetingPointImport.missingColumn", { column: rest });
    case "unclosed_quote":
      return t("admin.meetingPointImport.unclosedQuote", { line: rest });
    case "empty":
      return t("admin.meetingPointImport.empty");
    case "not_utf8":
      return t("admin.meetingPointImport.notUtf8");
    case "too_many_rows":
      return t("admin.meetingPointImport.tooManyRows", { max: importLimits.maxRows });
    default:
      return t("admin.meetingPointImport.checkFailed");
  }
}

/** A row's problem: its column as the file names it, and what is wrong. */
function rowProblemText(t: Translate, { column, issue }: AdminImportRow["problems"][number]) {
  if (column === "row") return t("admin.meetingPointImport.cells");
  const problem = (() => {
    switch (issue) {
      case "duplicate":
        return t("admin.meetingPointImport.duplicate");
      case "unreadable":
        return t("admin.meetingPointImport.degrees");
      case "unknown":
        return t("admin.meetingPointImport.unknownValue");
      case "invalid":
        return t("admin.meetingPointImport.month");
      case "too_many":
        return t("admin.meetingPoint.issue.tooMany", { max: meetingPointLimits.aliasesMax });
      default:
        return t(issueKey(column, issue as Parameters<typeof issueKey>[1]));
    }
  })();
  const named = column === "position" ? "latitude, longitude" : column;
  return t("admin.meetingPointImport.problem", { column: named, problem });
}

/** What else a ready row holds, under the form's labels; empty fields are left out. */
function RowFacts({ t, point }: { t: Translate; point: NonNullable<AdminImportRow["point"]> }) {
  const facts: readonly (readonly [MessageKey, string | null])[] = [
    ["admin.meetingPoint.nameEn", point.nameEn],
    ["admin.meetingPoint.aliases", point.aliases.join(", ") || null],
    [
      "meetingPoints.amenities",
      point.amenities.map((amenity) => t(amenityKeys[amenity])).join(", ") || null,
    ],
    ["admin.meetingPoint.whereToStandIs", point.whereToStandIs],
    ["admin.meetingPoint.whereToStandEn", point.whereToStandEn],
  ];
  const shown = facts.filter(([, value]) => value !== null);
  if (shown.length === 0) return null;
  return (
    <dl className="facts type-body">
      {shown.map(([label, value]) => (
        <Fragment key={label}>
          <dt>{t(label)}</dt>
          <dd className="line-breaks">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * Adding meeting points as drafts from a CSV file (spec 2, 3.6.9;
 * milestone 8 plan, 4.6). The API reads the file with the domain's
 * `readMeetingPointImport` and shows each row as it will be saved, or why it
 * is skipped; adding saves the rows without problems in one go.
 */
export function MeetingPointImport() {
  const { t, locale, call } = useConsole();
  const base = useId();
  const ids = {
    file: `${base}-file`,
    help: `${base}-help`,
    rows: `${base}-rows`,
  };
  const [file, setFile] = useState<File | null>(null);
  // A new key empties the file field when starting again.
  const [fileField, setFileField] = useState(0);
  const [fieldProblem, setFieldProblem] = useState<FileFieldProblem | null>(null);
  const [fileProblems, setFileProblems] = useState<readonly Detail[] | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rowsHeading = useRef<HTMLHeadingElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const problemsRef = useRef<HTMLDivElement>(null);
  // What takes the focus once the page is drawn again. It is state, drawn
  // with what it points at, so a step still waiting from an earlier drawing
  // cannot use it up before the new field or heading is there.
  const [focusNext, setFocusNext] = useState<{ readonly target: FocusTarget; readonly n: number }>({
    target: null,
    n: 0,
  });
  const focusOn = (target: FocusTarget) => {
    setFocusNext((last) => ({ target, n: last.n + 1 }));
  };

  useEffect(() => {
    if (focusNext.target === null) return;
    const element = {
      file: fileInput.current,
      rows: rowsHeading.current,
      message: messageRef.current,
      problems: problemsRef.current,
    }[focusNext.target];
    element?.focus();
  }, [focusNext]);

  function refuseFile(problem: FileFieldProblem) {
    setFieldProblem(problem);
    focusOn("file");
  }

  async function check() {
    setMessage(null);
    setFileProblems(null);
    setChecked(null);
    if (file === null) {
      refuseFile("required");
      return;
    }
    if (file.size > importLimits.maxBytes) {
      refuseFile("tooLarge");
      return;
    }
    let text: string;
    try {
      text = await readText(file);
    } catch {
      refuseFile("unreadable");
      return;
    }
    setBusy(true);
    const result = await call(adminImportMeetingPointsRoute, { body: { file: text, save: false } });
    setBusy(false);
    if (result.ok) {
      setChecked({ file: text, rows: result.data.rows, added: null });
      focusOn("rows");
      return;
    }
    if (result.status === 413) {
      refuseFile("tooLarge");
      return;
    }
    const details = result.error.details ?? [];
    if (result.error.code === "validation_failed" && details.length > 0) {
      setFileProblems(details);
      focusOn("problems");
      return;
    }
    setMessage({ kind: "alert", text: t("admin.meetingPointImport.checkFailed") });
    focusOn("message");
  }

  async function add(from: Checked) {
    setMessage(null);
    setBusy(true);
    const result = await call(adminImportMeetingPointsRoute, {
      body: { file: from.file, save: true },
    });
    setBusy(false);
    focusOn("message");
    if (!result.ok) {
      setMessage({ kind: "alert", text: t("admin.meetingPointImport.addFailed") });
      return;
    }
    const { rows, added } = result.data;
    setChecked({ file: from.file, rows, added });
    setMessage({
      kind: "status",
      text: t("admin.meetingPointImport.added", { added, skipped: rows.length - added }),
    });
  }

  function startAgain() {
    setChecked(null);
    setMessage(null);
    setFileProblems(null);
    setFile(null);
    setFileField((key) => key + 1);
    focusOn("file");
  }

  const ready = checked?.rows.filter((row) => row.point !== null).length ?? 0;
  const hintId = `${ids.file}-hint`;
  const errorId = `${ids.file}-error`;

  return (
    <section className="stack">
      <ConsoleLink to={meetingPointsPath} className="type-label">
        {t("admin.meetingPoint.back")}
      </ConsoleLink>
      <h1 className="type-title">{t("admin.meetingPointImport.title")}</h1>
      <p className="type-body muted">{t("admin.meetingPointImport.intro")}</p>

      <details className="panel stack" aria-labelledby={ids.help}>
        <summary id={ids.help} className="type-body-strong">
          {t("admin.meetingPointImport.helpTitle")}
        </summary>
        <p className="type-body">
          {t("admin.meetingPointImport.helpColumns", {
            required: requiredImportColumns.join(", "),
            optional: importColumns
              .filter((column) => !requiredImportColumns.includes(column))
              .join(", "),
            separator: importListSeparator,
          })}
        </p>
        <dl className="facts type-body">
          <dt>type</dt>
          <dd>{meetingPointTypes.join(", ")}</dd>
          <dt>region</dt>
          <dd>{regions.join(", ")}</dd>
          <dt>amenities</dt>
          <dd>{amenities.join(", ")}</dd>
        </dl>
        <p className="type-body">{t("admin.meetingPointImport.helpValues")}</p>
      </details>

      <form
        className="stack panel"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <div className="field">
          <label htmlFor={ids.file} className="type-label">
            {t("admin.meetingPointImport.file")}
          </label>
          <input
            key={fileField}
            ref={fileInput}
            id={ids.file}
            type="file"
            accept=".csv,text/csv"
            className="type-body"
            aria-invalid={fieldProblem !== null}
            aria-describedby={fieldProblem === null ? hintId : `${hintId} ${errorId}`}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setFieldProblem(null);
              // The rows shown were read from the file before.
              setChecked(null);
              setFileProblems(null);
              setMessage(null);
            }}
          />
          <p id={hintId} className="hint type-small">
            {t("admin.meetingPointImport.fileHint", { max: importLimits.maxRows })}
          </p>
          {fieldProblem === null ? null : (
            <p id={errorId} className="field-error type-small">
              {t(fileFieldKeys[fieldProblem])}
            </p>
          )}
        </div>
        <div className="actions">
          <button type="submit" className="button-primary type-button" disabled={busy}>
            {t("admin.meetingPointImport.check")}
          </button>
        </div>
      </form>

      {fileProblems === null ? null : (
        <div ref={problemsRef} className="problem stack" role="alert" tabIndex={-1}>
          <p className="type-body-strong">{t("admin.meetingPointImport.cannotRead")}</p>
          <ul className="problem-list type-body">
            {fileProblems.map((detail, index) => (
              <li key={`${String(index)} ${detail.path} ${detail.issue}`}>
                {fileProblemText(t, detail)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message === null ? null : (
        <p
          ref={messageRef}
          className={`${message.kind === "alert" ? "problem" : "notice"} type-body`}
          role={message.kind}
          tabIndex={-1}
        >
          {message.text}
        </p>
      )}

      {checked === null ? null : (
        <>
          <h2 ref={rowsHeading} id={ids.rows} className="type-heading" tabIndex={-1}>
            {t("admin.meetingPointImport.rows")}
          </h2>
          <p className="type-body">
            {t("admin.meetingPointImport.summary", {
              rows: checked.rows.length,
              ready,
              skipped: checked.rows.length - ready,
            })}
          </p>
          <div className="actions">
            {checked.added === null && ready > 0 ? (
              <button
                type="button"
                className="button-primary type-button"
                disabled={busy}
                onClick={() => void add(checked)}
              >
                {t("admin.meetingPointImport.add", { count: ready })}
              </button>
            ) : null}
            {checked.added !== null && checked.added > 0 ? (
              <ConsoleLink
                to={`${meetingPointsPath}?status=draft`}
                className="button-secondary link-button type-label"
              >
                {t("admin.meetingPointImport.seeDrafts")}
              </ConsoleLink>
            ) : null}
            <button
              type="button"
              className="button-secondary type-label"
              disabled={busy}
              onClick={startAgain}
            >
              {t("admin.meetingPointImport.again")}
            </button>
          </div>
          {checked.added === null && ready === 0 ? (
            <p className="type-body">{t("admin.meetingPointImport.nothingToAdd")}</p>
          ) : null}
          <ol className="cards" aria-labelledby={ids.rows}>
            {checked.rows.map((row) => (
              <li key={row.line} className="card stack">
                <p className="type-heading">
                  {row.id === null ? (
                    row.nameIs === "" ? (
                      t("admin.meetingPointImport.noName")
                    ) : (
                      row.nameIs
                    )
                  ) : (
                    <ConsoleLink to={`${meetingPointsPath}/${row.id}`}>{row.nameIs}</ConsoleLink>
                  )}
                </p>
                <p className="type-small muted">
                  {t("admin.meetingPointImport.line", { line: row.line })}
                </p>
                {row.point === null ? (
                  <ul className="problem-list type-body">
                    {row.problems.map((problem, index) => (
                      <li key={`${String(index)} ${problem.column} ${problem.issue}`}>
                        {rowProblemText(t, problem)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <p className="type-body muted">
                      {t("meetingPoints.detailsLine", {
                        type: t(typeKeys[row.point.type]),
                        municipality: row.point.municipality,
                        region: t(regionKeys[row.point.region]),
                      })}
                    </p>
                    <p className="type-body muted">{seasonText(t, locale, row.point.season)}</p>
                    <p className="type-body muted">
                      {`${String(row.point.position.latitude)}, ${String(row.point.position.longitude)}`}
                    </p>
                    <RowFacts t={t} point={row.point} />
                  </>
                )}
                <p className="tags">
                  <span
                    className={`tag ${row.point === null ? "tag-warning" : "status-draft"} type-small`}
                  >
                    {t(
                      row.point === null
                        ? "admin.meetingPointImport.skipped"
                        : row.id === null
                          ? "admin.meetingPointImport.ready"
                          : "admin.meetingPointImport.addedTag",
                    )}
                  </span>
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
