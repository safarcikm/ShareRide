import {
  adminAddNoteRoute,
  adminUserRoute,
  type AdminOperatorNote,
  type AdminUser,
} from "@shareride/contracts";
import { checkOperatorNote, defaultSafetySettings, formatPhoneNumber } from "@shareride/domain";
import { carText, formatDay, formatMoney, languageNames } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { ActPanel, type Choice } from "../reports/act.tsx";
import { ActionList, ReportLinks } from "../reports/history.tsx";
import {
  atText,
  bookingStatusKeys,
  personName,
  standingText,
  tripsPath,
  usersPath,
} from "../reports/texts.ts";
import { TripCards } from "../trips/search.tsx";
import { declineReasonKeys, plannedText, routeText } from "../trips/texts.ts";
import { declinesText, reasonsText } from "./texts.ts";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "missing" }
  | { readonly state: "failed" }
  | {
      readonly state: "ready";
      readonly user: AdminUser;
      /** Loading it again after an action or a note failed: what shows may be out of date. */
      readonly stale?: boolean;
    };

/** What the operator can do from a person's page (3.5.3): the report's actions, without a report. */
function personChoices(user: AdminUser): readonly Choice[] {
  const { person } = user;
  if (person.status === "deleted") return [];
  return [
    { kind: "warn" },
    ...(user.about !== null && !user.about.hidden
      ? [{ kind: "hide", content: "about", id: person.userId } as const]
      : []),
    ...(person.status === "active" ? [{ kind: "suspend" } as const] : []),
    ...(person.status === "suspended" ? [{ kind: "reinstate" } as const] : []),
  ];
}

/**
 * A person's page (spec 9, 3.5.2): their account, what ShareRide did about
 * them and the notes operators keep, their trips, bookings, cars and
 * reports, and their decline rate. Suspend, Reinstate, Warn and Add note
 * act from here (3.5.3).
 */
export function UserDetail({ id }: { readonly id: string }) {
  const { t, locale, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const ids = {
    account: useId(),
    declines: useId(),
    trips: useId(),
    bookings: useId(),
    cars: useId(),
    reports: useId(),
    actions: useId(),
  };

  // Only the newest request may show its answer.
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    const result = await call(adminUserRoute, { params: { id } });
    if (mine !== request.current) return;
    if (result.ok) {
      setLoaded({ state: "ready", user: result.data });
      return;
    }
    // Once the page shows, it stays, with what an action said: a failed
    // reload says so and offers to try again.
    setLoaded((was) =>
      was.state === "ready"
        ? { ...was, stale: true }
        : { state: result.status === 404 ? "missing" : "failed" },
    );
  }, [call, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loaded.state === "loading") {
    return (
      <p className="type-body" role="status">
        {t("common.loading")}
      </p>
    );
  }
  if (loaded.state !== "ready") {
    return (
      <section className="stack">
        <ConsoleLink to={usersPath} className="type-label">
          {t("admin.users.back")}
        </ConsoleLink>
        <p className="problem type-body" role="alert">
          {t(loaded.state === "missing" ? "admin.users.notFound" : "admin.users.loadOneFailed")}
        </p>
        {loaded.state === "failed" ? (
          <div className="actions">
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => {
                setLoaded({ state: "loading" });
                void load();
              }}
            >
              {t("admin.retry")}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const { user } = loaded;
  const name = personName(t, user.person);
  const when = (at: string | null) =>
    at === null ? t("admin.users.notYet") : atText(t, locale, at);

  return (
    <section className="stack">
      <ConsoleLink to={usersPath} className="type-label">
        {t("admin.users.back")}
      </ConsoleLink>
      <h1 className="type-title">{name}</h1>
      {loaded.stale === true ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.users.stale")}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => void load()}
            >
              {t("admin.retry")}
            </button>
          </div>
        </div>
      ) : null}

      <section className="panel stack" aria-labelledby={ids.account}>
        <h2 id={ids.account} className="type-heading">
          {t("admin.users.account")}
        </h2>
        <dl className="facts type-body">
          <dt>{t("admin.reports.standing")}</dt>
          <dd>{standingText(t, locale, user.person)}</dd>
          {user.deleteAfter === null ? null : (
            <>
              <dt>{t("admin.users.deleting")}</dt>
              <dd>{atText(t, locale, user.deleteAfter)}</dd>
            </>
          )}
          <dt>{t("admin.users.phone")}</dt>
          <dd>
            {user.phone === null ? t("admin.users.noneGiven") : formatPhoneNumber(user.phone)}
          </dd>
          <dt>{t("admin.users.email")}</dt>
          <dd>{user.email ?? t("admin.users.noneGiven")}</dd>
          <dt>{t("admin.users.joinedLabel")}</dt>
          <dd>{formatDay(new Date(user.joinedAt), locale)}</dd>
          <dt>{t("admin.users.phoneVerified")}</dt>
          <dd>{when(user.phoneVerifiedAt)}</dd>
          <dt>{t("admin.users.emailVerified")}</dt>
          <dd>{when(user.emailVerifiedAt)}</dd>
          <dt>{t("admin.users.ageConfirmed")}</dt>
          <dd>{when(user.ageConfirmedAt)}</dd>
          <dt>{t("admin.users.licenceDeclared")}</dt>
          <dd>{when(user.licenceDeclaredAt)}</dd>
          <dt>{t("admin.users.languages")}</dt>
          <dd>
            {user.languages.length === 0
              ? t("admin.users.noneGiven")
              : user.languages
                  .map(
                    (code) =>
                      (languageNames[locale] as Readonly<Record<string, string>>)[code] ?? code,
                  )
                  .join(", ")}
          </dd>
          <dt>{t("admin.reports.language")}</dt>
          <dd>{t(`admin.reports.language.${user.person.locale}`)}</dd>
          <dt>{t("admin.users.about")}</dt>
          <dd>
            {user.about === null ? t("admin.users.noneGiven") : user.about.text}
            {user.about?.hidden === true ? (
              <>
                {" "}
                <span className="tag tag-warning type-small">{t("admin.reports.hiddenTag")}</span>
              </>
            ) : null}
          </dd>
          <dt>{t("admin.users.userId")}</dt>
          <dd>{user.person.userId}</dd>
        </dl>
      </section>

      <ActPanel
        person={user.person}
        choices={personChoices(user)}
        heading={t("admin.users.act")}
        onActed={() => void load()}
      />

      <Notes
        userId={user.person.userId}
        notes={user.notes}
        onAdded={(note) => {
          // As the page is now, which a reload may have changed meanwhile.
          setLoaded((was) =>
            was.state === "ready"
              ? { ...was, user: { ...was.user, notes: [note, ...was.user.notes] } }
              : was,
          );
        }}
      />

      <section className="panel stack" aria-labelledby={ids.actions}>
        <h2 id={ids.actions} className="type-heading">
          {t("admin.reports.personActions")}
        </h2>
        <ActionList actions={user.actions} />
      </section>

      <section className="panel stack" aria-labelledby={ids.reports}>
        <h2 id={ids.reports} className="type-heading">
          {t("admin.users.reports")}
        </h2>
        <h3 className="type-label">{t("admin.reports.reportsAbout")}</h3>
        <ReportLinks reports={user.reportsAbout} />
        <h3 className="type-label">{t("admin.reports.reportsBy")}</h3>
        <ReportLinks reports={user.reportsBy} />
      </section>

      <section className="panel stack" aria-labelledby={ids.declines}>
        <h2 id={ids.declines} className="type-heading">
          {t("admin.users.declines")}
        </h2>
        {user.declines === null ? (
          <p className="type-body muted">{t("admin.users.noDeclines")}</p>
        ) : (
          <>
            <p className="type-body">{declinesText(t, locale, user.declines)}</p>
            {user.declines.declined === 0 ? null : (
              <p className="type-small muted">{reasonsText(t, user.declines.reasons)}</p>
            )}
          </>
        )}
      </section>

      <section className="panel stack" aria-labelledby={ids.trips}>
        <h2 id={ids.trips} className="type-heading">
          {t("admin.users.trips")}
        </h2>
        {user.trips.length === 0 ? (
          <p className="type-body muted">{t("admin.reports.none")}</p>
        ) : (
          <>
            <TripCards trips={user.trips} labelledBy={ids.trips} />
            {user.trips.length < historyShown ? null : (
              <p className="type-small muted">{t("admin.users.latest", { count: historyShown })}</p>
            )}
            <ConsoleLink to={`${tripsPath}?driverId=${user.person.userId}`} className="type-label">
              {t("admin.users.allTrips")}
            </ConsoleLink>
          </>
        )}
      </section>

      <section className="panel stack" aria-labelledby={ids.bookings}>
        <h2 id={ids.bookings} className="type-heading">
          {t("admin.users.bookings")}
        </h2>
        {user.bookings.length === 0 ? (
          <p className="type-body muted">{t("admin.reports.none")}</p>
        ) : (
          <ul className="cards" aria-labelledby={ids.bookings}>
            {user.bookings.map((booking) => (
              <li key={booking.id} className="card entry">
                <ConsoleLink to={`${tripsPath}/${booking.tripId}`} className="type-label">
                  {routeText(t, locale, booking)}
                </ConsoleLink>
                <p className="type-body">
                  {t("admin.users.bookingLine", {
                    driver: personName(t, booking.driver),
                    when: plannedText(t, locale, booking.departsAt),
                    status: t(bookingStatusKeys[booking.status]),
                    price: formatMoney(booking.totalPrice, locale),
                  })}
                </p>
                {booking.status === "declined" && booking.declineReason !== null ? (
                  <p className="type-small">
                    {t("admin.trips.declinedBecause", {
                      reason: t(declineReasonKeys[booking.declineReason]),
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {user.bookings.length < historyShown ? null : (
          <p className="type-small muted">{t("admin.users.latest", { count: historyShown })}</p>
        )}
      </section>

      <section className="panel stack" aria-labelledby={ids.cars}>
        <h2 id={ids.cars} className="type-heading">
          {t("admin.users.cars")}
        </h2>
        {user.vehicles.length === 0 ? (
          <p className="type-body muted">{t("admin.reports.none")}</p>
        ) : (
          <ul className="cards" aria-labelledby={ids.cars}>
            {user.vehicles.map((car) => (
              <li key={car.id} className="card entry">
                <p className="type-body">
                  {`${carText(t, car)} · ${car.registration ?? t("admin.trips.noPlate")}`}
                </p>
                {car.removed ? (
                  <p className="tags">
                    <span className="tag type-small">{t("admin.trips.removedTag")}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

/** The most trips, bookings, reports and actions a person's page lists, the latest first. */
const historyShown = 20;

type Saving =
  | { readonly kind: "none" }
  | { readonly kind: "saving" }
  | { readonly kind: "added" }
  | { readonly kind: "failed" };

/**
 * Notes about the person (3.5.3), the latest first, and a new one. Only
 * operators see them here; the person gets them in Download my data,
 * without who wrote them (A48), so the hint asks for facts.
 */
function Notes({
  userId,
  notes,
  onAdded,
}: {
  readonly userId: string;
  readonly notes: readonly AdminOperatorNote[];
  readonly onAdded: (note: AdminOperatorNote) => void;
}) {
  const { t, locale, call } = useConsole();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<"note_missing" | "too_long" | null>(null);
  const [saving, setSaving] = useState<Saving>({ kind: "none" });
  const field = useRef<HTMLTextAreaElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  // A refused note takes the focus once its problem is on the page.
  const [checks, setChecks] = useState(0);
  const ids = { heading: useId(), field: useId(), hint: useId(), error: useId(), list: useId() };

  useEffect(() => {
    if (saving.kind === "added" || saving.kind === "failed") said.current?.focus();
  }, [saving.kind]);

  useEffect(() => {
    if (checks > 0) field.current?.focus();
  }, [checks]);

  async function add() {
    const checked = checkOperatorNote(text);
    if (!checked.ok) {
      setProblem(checked.error.code);
      setSaving({ kind: "none" });
      setChecks((count) => count + 1);
      return;
    }
    setSaving({ kind: "saving" });
    const result = await call(adminAddNoteRoute, {
      params: { id: userId },
      body: { text: checked.value },
    });
    if (!result.ok) {
      setSaving({ kind: "failed" });
      return;
    }
    setText("");
    setSaving({ kind: "added" });
    onAdded(result.data.note);
  }

  return (
    <section className="panel stack" aria-labelledby={ids.heading}>
      <h2 id={ids.heading} className="type-heading">
        {t("admin.users.notes")}
      </h2>
      <p className="type-body muted">{t("admin.users.notesHint")}</p>
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className="field">
          <label htmlFor={ids.field} className="type-label">
            {t("admin.users.newNote")}
          </label>
          <textarea
            id={ids.field}
            ref={field}
            className="input type-body"
            rows={3}
            aria-invalid={problem !== null}
            aria-describedby={problem === null ? ids.hint : `${ids.hint} ${ids.error}`}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setProblem(null);
            }}
          />
          <p id={ids.hint} className="hint type-small">
            {t("admin.users.noteLimit", { count: defaultSafetySettings.textMaxLength })}
          </p>
          {problem === null ? null : (
            <p id={ids.error} className="field-error type-small">
              {t(
                problem === "note_missing" ? "admin.users.noteMissing" : "admin.users.noteTooLong",
              )}
            </p>
          )}
        </div>
        <div className="actions">
          <button
            type="submit"
            className="button-primary type-button"
            disabled={saving.kind === "saving"}
          >
            {t("admin.users.addNote")}
          </button>
        </div>
      </form>
      <div className="message">
        {saving.kind === "added" ? (
          <p ref={said} className="type-body" role="status" tabIndex={-1}>
            {t("admin.users.noteAdded")}
          </p>
        ) : saving.kind === "failed" ? (
          <p ref={said} className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.users.noteFailed")}
          </p>
        ) : null}
      </div>
      {notes.length === 0 ? (
        <p className="type-body muted">{t("admin.users.noNotes")}</p>
      ) : (
        <ul className="cards" aria-labelledby={ids.heading}>
          {notes.map((note) => (
            <li key={note.id} className="card entry">
              <p className="type-body">{note.text}</p>
              <p className="type-small muted">
                {t("admin.users.noteBy", {
                  who: note.by?.firstName ?? t("admin.users.someOperator"),
                  when: atText(t, locale, note.at),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
