import { useState } from "react";
import { usersPath } from "../reports/texts.ts";
import { UserDetail } from "./detail.tsx";
import { UserSearch } from "./search.tsx";

/**
 * The Users section (spec 9, 3.5): finding people and the drivers' decline
 * rates at its own path, and each person's page at their ID.
 */
export function UsersPage() {
  const [rest] = useState(() =>
    window.location.pathname.slice(usersPath.length).replace(/^\/+|\/+$/g, ""),
  );
  return rest === "" ? <UserSearch /> : <UserDetail id={rest} />;
}
