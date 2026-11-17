import type { MessageKey } from "@shareride/i18n";
import { useId, useRef, useState, type ReactNode } from "react";
import { useConsole } from "./console.tsx";
import { sections } from "./sections.ts";

export interface LayoutProps {
  /** The path of the section on show. */
  readonly current: string;
  readonly onSignOut: () => Promise<void>;
  readonly onSwitchLanguage: () => void;
  /** A problem with the frame itself, such as signing out failing. */
  readonly problem?: MessageKey | undefined;
  readonly children: ReactNode;
}

/**
 * The console's frame (spec 10, 3.1): the menu on the left on a laptop,
 * behind a menu button on a phone; the page beside or below it.
 */
export function Layout({ current, onSignOut, onSwitchLanguage, problem, children }: LayoutProps) {
  const { t, navigate, operator } = useConsole();
  const [menuOpen, setMenuOpen] = useState(false);
  const page = useRef<HTMLElement>(null);
  const menuId = useId();
  const name = operator?.firstName ?? null;

  return (
    <div className="frame">
      <a className="skip-link type-label" href="#page">
        {t("admin.skipToContent")}
      </a>
      <header className="top-bar">
        <button
          type="button"
          className="menu-button button-secondary type-label"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => {
            setMenuOpen(!menuOpen);
          }}
        >
          {menuOpen ? t("admin.menuClose") : t("admin.menuOpen")}
        </button>
        <p className="console-name type-heading">{t("admin.title")}</p>
        <div className="top-actions">
          {name === null ? null : (
            <p className="signed-in type-small">{t("admin.signedInAs", { name })}</p>
          )}
          <button
            type="button"
            className="button-quiet type-label"
            aria-label={t("language.switchLabel")}
            onClick={onSwitchLanguage}
          >
            {t("language.switch")}
          </button>
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => void onSignOut()}
          >
            {t("admin.signOut")}
          </button>
        </div>
      </header>
      <nav
        id={menuId}
        className={menuOpen ? "menu menu-open" : "menu"}
        aria-label={t("admin.menu")}
      >
        <ul>
          {sections.map((section) => (
            <li key={section.path}>
              <a
                href={section.path}
                className="menu-link type-label"
                aria-current={section.path === current ? "page" : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                    return;
                  event.preventDefault();
                  setMenuOpen(false);
                  navigate(section.path);
                  // The new page takes the focus, so it is read from the top.
                  page.current?.focus();
                }}
              >
                {t(section.title)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main ref={page} id="page" className="page" tabIndex={-1}>
        {problem === undefined ? null : (
          <p className="problem type-body" role="alert">
            {t(problem)}
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
