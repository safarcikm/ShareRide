import { useConsole } from "../console.tsx";

export function HomePage() {
  const { t, operator } = useConsole();
  const name = operator?.firstName ?? null;
  return (
    <section className="stack">
      <h1 className="type-title">
        {name === null ? t("admin.home.welcomeNoName") : t("admin.home.welcome", { name })}
      </h1>
      <p className="type-body muted">{t("admin.home.body")}</p>
    </section>
  );
}
