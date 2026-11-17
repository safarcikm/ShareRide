import { ConsoleLink } from "../components/console-link.tsx";
import { useConsole } from "../console.tsx";
import { problemsPath, useProblemQueue } from "./meeting-points/problems.tsx";

export function HomePage() {
  const { t, operator } = useConsole();
  const name = operator?.firstName ?? null;
  const { queue } = useProblemQueue();
  return (
    <section className="stack">
      <h1 className="type-title">
        {name === null ? t("admin.home.welcomeNoName") : t("admin.home.welcome", { name })}
      </h1>
      <p className="type-body muted">{t("admin.home.body")}</p>
      {queue.state === "ready" ? (
        <p className="type-body">
          <ConsoleLink to={problemsPath}>
            {t("admin.home.meetingPointProblems", { count: queue.issues.length })}
          </ConsoleLink>
        </p>
      ) : null}
    </section>
  );
}
