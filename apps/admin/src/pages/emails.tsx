import {
  adminOwnEmailsRoute,
  adminSetOwnEmailsRoute,
  type AdminOwnEmails,
} from "@shareride/contracts";
import { useCallback, useEffect, useId, useState } from "react";
import { useConsole } from "../console.tsx";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly emails: AdminOwnEmails };

type Notice = "saved" | "failed" | null;

/**
 * Emails to you (spec 25, 3.1): the emails the signed-in operator chose to
 * get for themselves. A tick saves at once; nothing changes for others.
 */
export function EmailsPage() {
  const { t, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const ids = { newMembers: useId(), help: useId(), address: useId() };

  const load = useCallback(async () => {
    const result = await call(adminOwnEmailsRoute, {});
    setLoaded(result.ok ? { state: "ready", emails: result.data } : { state: "failed" });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(newMembers: boolean) {
    // The box shows the tick at once; a failed save puts back what is stored.
    setLoaded((now) =>
      now.state === "ready" ? { state: "ready", emails: { ...now.emails, newMembers } } : now,
    );
    setSaving(true);
    setNotice(null);
    const result = await call(adminSetOwnEmailsRoute, { body: { newMembers } });
    setSaving(false);
    if (result.ok) {
      setLoaded({ state: "ready", emails: result.data });
      setNotice("saved");
    } else {
      setNotice("failed");
      void load();
    }
  }

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.emails.title")}</h1>
      <p className="type-body muted">{t("admin.emails.intro")}</p>
      {notice === "saved" ? (
        <p className="notice type-body" role="status">
          {t("admin.emails.saved")}
        </p>
      ) : notice === "failed" ? (
        <p className="problem type-body" role="alert">
          {t("admin.emails.saveFailed")}
        </p>
      ) : null}
      {loaded.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : loaded.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.emails.loadFailed")}
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
        <div className="stack panel">
          <label className="check type-body-strong" htmlFor={ids.newMembers}>
            <input
              id={ids.newMembers}
              type="checkbox"
              checked={loaded.emails.newMembers}
              disabled={saving}
              aria-describedby={`${ids.help} ${ids.address}`}
              onChange={(event) => void choose(event.target.checked)}
            />
            {t("admin.emails.newMembers")}
          </label>
          <p id={ids.help} className="type-small muted">
            {t("admin.emails.newMembersHelp")}
          </p>
          {loaded.emails.address === null ? (
            <p id={ids.address} className="problem type-small">
              {t("admin.emails.noAddress")}
            </p>
          ) : (
            <p id={ids.address} className="type-small">
              {t("admin.emails.address", { address: loaded.emails.address })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
