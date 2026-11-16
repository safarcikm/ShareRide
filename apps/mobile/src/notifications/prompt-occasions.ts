import { readAppData, writeAppData } from "@/lib/app-data";

// The occasions (a booking, a trip posted, a request accepted) whose
// notifications prompt was answered, so it is asked once per occasion
// (plan 4.7). The newest 20 are kept in the app's own storage on the
// device (privacy register); this visit's are also kept here, should that
// storage not work.

const key = "notificationsPromptAnswered";
const kept = 20;
const answeredHere = new Set<string>();

function stored(value: string | null): string[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function wasAnswered(occasion: string): Promise<boolean> {
  if (answeredHere.has(occasion)) return true;
  return stored(await readAppData(key)).includes(occasion);
}

export async function markAnswered(occasion: string): Promise<void> {
  answeredHere.add(occasion);
  const earlier = stored(await readAppData(key)).filter((item) => item !== occasion);
  await writeAppData(key, JSON.stringify([...earlier, occasion].slice(-kept)));
}
