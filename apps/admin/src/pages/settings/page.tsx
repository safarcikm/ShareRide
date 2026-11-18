import {
  adminChangeSettingRoute,
  adminPreviewSettingRoute,
  adminSettingsHistoryRoute,
  adminSettingsRoute,
  type AdminSetting,
  type AdminSettingChange,
  type AdminSettingPreview,
  type AdminSettings,
} from "@shareride/contracts";
import {
  checkSettingValue,
  defaultSettingValues,
  icelandDate,
  isPriceSettingKey,
  isSettingKey,
  settingDefinitions,
  settingGroups,
  settingReasonMaxLength,
  type SettingValues,
} from "@shareride/domain";
import { formatClock, formatCount, formatDate, formatMoney } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";
import {
  groupKeys,
  groupNotes,
  settingHelp,
  settingName,
  valueFieldLabel,
  valueText,
} from "./texts.ts";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly settings: AdminSettings };

/** Every value as the page loaded it, for the check across values. */
const valuesOf = (settings: AdminSettings): SettingValues => ({
  ...defaultSettingValues,
  ...Object.fromEntries(
    settings.settings.filter(({ key }) => isSettingKey(key)).map(({ key, value }) => [key, value]),
  ),
});

/** How long the page waits after a keystroke before it asks for the example price. */
const previewDelayMs = 300;

type History =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | {
      readonly state: "ready";
      readonly changes: readonly AdminSettingChange[];
      readonly next: number | null;
      readonly older: "idle" | "loading" | "failed";
    };

/**
 * Settings (spec 10, 3.2; ADR 0032): every value the operator can change,
 * group by group, with its default and range. A change needs a reason,
 * shows what it does first, and lands in the history below.
 */
export function SettingsPage() {
  const { t, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [history, setHistory] = useState<History>({ state: "loading" });
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [changedMeanwhile, setChangedMeanwhile] = useState(false);
  const historyId = useId();

  const loadHistory = useCallback(async () => {
    const result = await call(adminSettingsHistoryRoute, { query: {} });
    setHistory(
      result.ok
        ? { state: "ready", changes: result.data.changes, next: result.data.next, older: "idle" }
        : { state: "failed" },
    );
  }, [call]);

  const load = useCallback(async () => {
    const result = await call(adminSettingsRoute, {});
    setLoaded(result.ok ? { state: "ready", settings: result.data } : { state: "failed" });
  }, [call]);

  useEffect(() => {
    void load();
    void loadHistory();
  }, [load, loadHistory]);

  async function loadOlder() {
    if (history.state !== "ready" || history.next === null) return;
    setHistory({ ...history, older: "loading" });
    const result = await call(adminSettingsHistoryRoute, { query: { before: history.next } });
    setHistory(
      result.ok
        ? {
            state: "ready",
            changes: [...history.changes, ...result.data.changes],
            next: result.data.next,
            older: "idle",
          }
        : { ...history, older: "failed" },
    );
  }

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.settings.title")}</h1>
      <p className="type-body muted">{t("admin.settings.intro")}</p>
      {saved === null ? null : (
        <p className="notice type-body" role="status">
          {t("admin.settings.saved", { name: settingName(t, saved) })}
        </p>
      )}
      {changedMeanwhile ? (
        <p className="problem type-body" role="alert">
          {t("admin.settings.changedMeanwhile")}
        </p>
      ) : null}
      {loaded.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : loaded.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.settings.loadFailed")}
          </p>
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
      ) : (
        settingGroups.map((group) => {
          // A group with no settings yet has no heading.
          const inGroup = loaded.settings.settings.filter(
            (setting) => (setting.group as string) === group,
          );
          if (inGroup.length === 0) return null;
          return (
            <Group
              key={group}
              title={t(groupKeys[group])}
              note={groupNotes[group] === undefined ? null : t(groupNotes[group])}
              settings={inGroup}
              version={loaded.settings.version}
              values={valuesOf(loaded.settings)}
              editing={editing}
              onEdit={(key) => {
                setEditing(key);
                setSaved(null);
                setChangedMeanwhile(false);
              }}
              onSaved={(key, settings) => {
                setLoaded({ state: "ready", settings });
                setEditing(null);
                setSaved(key);
                void loadHistory();
              }}
              onChangedMeanwhile={() => {
                setEditing(null);
                setChangedMeanwhile(true);
                void load();
                void loadHistory();
              }}
            />
          );
        })
      )}
      <h2 id={historyId} className="type-heading">
        {t("admin.settings.history")}
      </h2>
      {history.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : history.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.settings.historyFailed")}
          </p>
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => {
              setHistory({ state: "loading" });
              void loadHistory();
            }}
          >
            {t("admin.retry")}
          </button>
        </div>
      ) : history.changes.length === 0 ? (
        <p className="type-body muted">{t("admin.settings.historyEmpty")}</p>
      ) : (
        <>
          <ol className="cards" aria-labelledby={historyId}>
            {history.changes.map((change) => (
              <HistoryEntry key={change.version} change={change} />
            ))}
          </ol>
          {history.older === "failed" ? (
            <p className="problem type-body" role="alert">
              {t("admin.settings.historyFailed")}
            </p>
          ) : null}
          {history.next === null ? null : (
            <button
              type="button"
              className="button-secondary type-label"
              disabled={history.older === "loading"}
              aria-busy={history.older === "loading"}
              onClick={() => void loadOlder()}
            >
              {t("admin.settings.older")}
            </button>
          )}
        </>
      )}
    </section>
  );
}

interface GroupProps {
  readonly title: string;
  /** What to know before changing anything in the group. */
  readonly note: string | null;
  readonly settings: readonly AdminSetting[];
  readonly version: number;
  readonly values: SettingValues;
  readonly editing: string | null;
  readonly onEdit: (key: string | null) => void;
  readonly onSaved: (key: string, settings: AdminSettings) => void;
  readonly onChangedMeanwhile: () => void;
}

function Group({ title, note, settings, editing, onEdit, ...rest }: GroupProps) {
  const id = useId();
  return (
    <>
      <h2 id={id} className="type-heading">
        {title}
      </h2>
      {note === null ? null : <p className="type-body muted">{note}</p>}
      <ul className="cards" aria-labelledby={id}>
        {settings.map((setting) => (
          <SettingCard
            key={setting.key}
            setting={setting}
            open={editing === setting.key}
            onOpen={(open) => {
              onEdit(open ? setting.key : null);
            }}
            {...rest}
          />
        ))}
      </ul>
    </>
  );
}

interface SettingCardProps extends Pick<
  GroupProps,
  "version" | "values" | "onSaved" | "onChangedMeanwhile"
> {
  readonly setting: AdminSetting;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
}

function SettingCard({ setting, open, onOpen, ...rest }: SettingCardProps) {
  const { t, locale } = useConsole();
  const name = settingName(t, setting.key);
  const help = settingHelp(t, setting.key);
  const shown = (value: number) => valueText(t, locale, setting, value);
  return (
    <li className="card stack">
      <h3 className="type-label">{name}</h3>
      <p className="type-heading">{shown(setting.value)}</p>
      {help === null ? null : <p className="type-body">{help}</p>}
      <p className="type-small muted">
        {setting.kind === "switch"
          ? t("admin.settings.defaultSwitch", { value: shown(setting.default) })
          : t("admin.settings.default", {
              value: shown(setting.default),
              min: formatCount(setting.min, locale),
              max: formatCount(setting.max, locale),
            })}
      </p>
      {open ? (
        <ChangeForm
          setting={setting}
          onCancel={() => {
            onOpen(false);
          }}
          {...rest}
        />
      ) : (
        <div className="actions">
          <button
            type="button"
            className="button-secondary type-label"
            aria-label={t("admin.settings.changeLabel", { name })}
            onClick={() => {
              onOpen(true);
            }}
          >
            {t("admin.settings.change")}
          </button>
        </div>
      )}
    </li>
  );
}

interface ChangeFormProps extends Pick<
  GroupProps,
  "version" | "values" | "onSaved" | "onChangedMeanwhile"
> {
  readonly setting: AdminSetting;
  readonly onCancel: () => void;
}

type FormProblem = "save_failed" | "unchanged" | null;

type PriceEffect =
  | { readonly state: "ready"; readonly price: NonNullable<AdminSettingPreview["price"]> }
  | { readonly state: "failed" };

function ChangeForm({
  setting,
  version,
  values,
  onSaved,
  onChangedMeanwhile,
  onCancel,
}: ChangeFormProps) {
  const { t, locale, call } = useConsole();
  const isSwitch = setting.kind === "switch";
  const [typed, setTyped] = useState(String(setting.value));
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<FormProblem>(null);
  const valueInput = useRef<HTMLInputElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const ids = { value: useId(), valueError: useId(), reason: useId(), reasonError: useId() };

  // A switch has one other value; a number is what was typed, when it is one the setting takes.
  const value = isSwitch ? 1 - setting.value : Number(typed);
  const valueFits =
    isSwitch ||
    (typed.trim() !== "" &&
      Number.isInteger(value) &&
      value >= setting.min &&
      value <= setting.max &&
      (value - setting.min) % setting.step === 0);
  const changed = valueFits && value !== setting.value;
  // The one check across values (ADR 0032), before anything is sent.
  const across = changed ? checkSettingValue(setting.key, value, values) : null;
  const highestRate =
    across !== null && !across.ok && across.error.code === "suggested_over_cap"
      ? across.error.highestRate
      : null;
  const previewed = changed && highestRate === null && isPriceSettingKey(setting.key);
  const [effect, setEffect] = useState<{ readonly of: number; readonly effect: PriceEffect }>();
  const why = reason.trim();
  const reasonProblem =
    why === ""
      ? t("admin.settings.reasonMissing")
      : why.length > settingReasonMaxLength
        ? t("admin.settings.reasonTooLong")
        : null;
  const shown = (of: number) => valueText(t, locale, setting, of);
  const fieldLabel = valueFieldLabel(t, setting) ?? settingName(t, setting.key);

  useEffect(() => {
    (isSwitch ? reasonInput.current : valueInput.current)?.focus();
  }, [isSwitch]);

  // A price value's effect is the example's price, as it is and as it would be (spec 10, 3.2.2).
  useEffect(() => {
    if (!previewed) return;
    let stale = false;
    const timer = setTimeout(() => {
      void call(adminPreviewSettingRoute, {
        params: { key: setting.key },
        body: { value },
      }).then((result) => {
        if (stale) return;
        setEffect({
          of: value,
          effect:
            result.ok && result.data.price !== null
              ? { state: "ready", price: result.data.price }
              : { state: "failed" },
        });
      });
    }, previewDelayMs);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [previewed, value, setting.key, call]);
  const priceEffect = previewed && effect?.of === value ? effect.effect : null;
  const money = (amount: number) => formatMoney({ amount, currency: "ISK" }, locale);

  async function save() {
    setChecked(true);
    setProblem(null);
    if (!valueFits || highestRate !== null) {
      valueInput.current?.focus();
      return;
    }
    if (reasonProblem !== null) {
      reasonInput.current?.focus();
      return;
    }
    if (value === setting.value) {
      setProblem("unchanged");
      return;
    }
    setSaving(true);
    const result = await call(adminChangeSettingRoute, {
      params: { key: setting.key },
      body: { value, reason: why, version },
    });
    setSaving(false);
    if (result.ok) onSaved(setting.key, result.data);
    else if (result.error.code === "settings_changed") onChangedMeanwhile();
    else setProblem(result.error.code === "unchanged" ? "unchanged" : "save_failed");
  }

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {isSwitch ? null : (
        <div className="field">
          <label htmlFor={ids.value} className="type-label">
            {fieldLabel}
          </label>
          <input
            ref={valueInput}
            id={ids.value}
            className="input type-body"
            type="number"
            inputMode="numeric"
            min={setting.min}
            max={setting.max}
            step={setting.step}
            value={typed}
            aria-invalid={(checked && !valueFits) || highestRate !== null}
            aria-describedby={
              (checked && !valueFits) || highestRate !== null ? ids.valueError : undefined
            }
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          {checked && !valueFits ? (
            <p id={ids.valueError} className="field-error type-small">
              {t("admin.settings.valueWrong", {
                min: formatCount(setting.min, locale),
                max: formatCount(setting.max, locale),
              })}
            </p>
          ) : highestRate !== null ? (
            <p id={ids.valueError} className="field-error type-small" role="alert">
              {t("admin.settings.suggestedOverCap", { rate: formatCount(highestRate, locale) })}
            </p>
          ) : null}
        </div>
      )}
      {changed && highestRate === null ? (
        <div className="notice stack" aria-live="polite">
          <p className="type-body">
            {t("admin.settings.effect", { before: shown(setting.value), after: shown(value) })}
          </p>
          {priceEffect === null ? null : priceEffect.state === "failed" ? (
            <p className="type-body">{t("admin.settings.effectFailed")}</p>
          ) : (
            <>
              <p className="type-body">
                {t("admin.settings.priceEffect", {
                  distance: formatCount(priceEffect.price.distanceKm, locale),
                  seats: priceEffect.price.seats,
                  before: money(priceEffect.price.before.price),
                  after: money(priceEffect.price.after.price),
                  beforeLevel: priceEffect.price.before.highestLevel,
                  afterLevel: priceEffect.price.after.highestLevel,
                })}
              </p>
              <p className="type-body">{t("admin.settings.priceEffectNew")}</p>
            </>
          )}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={ids.reason} className="type-label">
          {t("admin.settings.reason")}
        </label>
        <textarea
          ref={reasonInput}
          id={ids.reason}
          className="textarea type-body"
          rows={2}
          value={reason}
          aria-invalid={checked && reasonProblem !== null}
          aria-describedby={checked && reasonProblem !== null ? ids.reasonError : undefined}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        {checked && reasonProblem !== null ? (
          <p id={ids.reasonError} className="field-error type-small">
            {reasonProblem}
          </p>
        ) : null}
      </div>
      {problem === null ? null : (
        <p className="problem type-body" role="alert">
          {t(problem === "unchanged" ? "admin.settings.unchanged" : "admin.settings.saveFailed")}
        </p>
      )}
      <div className="actions">
        <button
          type="submit"
          className="button-primary type-button"
          disabled={saving}
          aria-busy={saving}
        >
          {t("admin.settings.save")}
        </button>
        <button type="button" className="button-quiet type-label" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function HistoryEntry({ change }: { readonly change: AdminSettingChange }) {
  const { t, locale } = useConsole();
  const moment = new Date(change.changedAt);
  // The history outlives the catalogue: a setting that has left it shows its bare numbers.
  const setting = isSettingKey(change.key)
    ? settingDefinitions[change.key]
    : ({ kind: "number", unit: null } as const);
  const shown = (value: number) => valueText(t, locale, setting, value);
  const by = change.changedBy;
  return (
    <li className="card stack">
      <p className="type-label">
        {t("admin.settings.historyEntry", {
          name: settingName(t, change.key),
          before: shown(change.oldValue),
          after: shown(change.newValue),
        })}
      </p>
      <p className="type-body line-breaks">{change.reason}</p>
      <p className="type-small muted">
        {t("admin.auditLog.at", {
          date: formatDate(icelandDate(moment), locale),
          time: formatClock(moment),
        })}
        {" · "}
        {by === null
          ? t("admin.settings.byCommand")
          : by.firstName === null
            ? t("admin.auditLog.byNoName")
            : t("admin.auditLog.by", { name: by.firstName })}
      </p>
    </li>
  );
}
