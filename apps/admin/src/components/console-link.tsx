import type { ReactNode } from "react";
import { useConsole } from "../console.tsx";

/**
 * A link to another console page: opens it in place, or in a new tab as
 * any link does. The new page takes the focus, so it is read from the top.
 */
export function ConsoleLink({
  to,
  className,
  children,
}: {
  readonly to: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { navigate } = useConsole();
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
        document.getElementById("page")?.focus();
      }}
    >
      {children}
    </a>
  );
}
