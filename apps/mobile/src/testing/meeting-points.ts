// Meeting points and places as the API returns them, for screen tests.
import type { MeetingPointDetails, MeetingPointSummary, Place } from "@shareride/contracts";

export const bsi: MeetingPointSummary = {
  id: "0190a1d6-0000-7000-8000-0000000000b1",
  name: { is: "BSÍ umferðarmiðstöð", en: "BSÍ bus terminal" },
  region: "capital",
  municipality: "Reykjavíkurborg",
  type: "bus-hub",
  amenities: ["shelter", "toilets", "shop"],
  position: { latitude: 64.1376, longitude: -21.9365 },
  status: "active",
  season: null,
  pauseReason: null,
  sample: true,
};

export const hof: MeetingPointSummary = {
  id: "0190a1d6-0000-7000-8000-0000000000b2",
  name: { is: "Hof, Akureyri", en: "Hof, Akureyri" },
  region: "northeast",
  municipality: "Akureyrarbær",
  type: "other",
  amenities: ["parking"],
  position: { latitude: 65.6839, longitude: -18.0878 },
  status: "active",
  season: { startMonth: 5, endMonth: 9 },
  pauseReason: null,
  sample: true,
};

export const fitjar: MeetingPointSummary = {
  id: "0190a1d6-0000-7000-8000-0000000000b3",
  name: { is: "Fitjar", en: "Fitjar" },
  region: "southern-peninsula",
  municipality: "Reykjanesbær",
  type: "fuel-station",
  amenities: [],
  position: { latitude: 63.9897, longitude: -22.5482 },
  status: "paused",
  season: null,
  pauseReason: { is: "Lokað vegna framkvæmda", en: "Closed for roadworks" },
  sample: true,
};

export const kef: MeetingPointSummary = {
  id: "0190a1d6-0000-7000-8000-0000000000b4",
  name: { is: "Keflavíkurflugvöllur", en: "Keflavík Airport" },
  region: "southern-peninsula",
  municipality: "Suðurnesjabær",
  type: "airport",
  amenities: ["shelter", "toilets", "shop", "step-free"],
  position: { latitude: 63.9971, longitude: -22.6245 },
  status: "active",
  season: null,
  pauseReason: null,
  sample: true,
};

export const meetingPoints = [hof, fitjar, bsi, kef];

/** A meeting point's details, with nothing more than its summary unless given. */
export function details(
  point: MeetingPointSummary,
  more: Partial<MeetingPointDetails> = {},
): MeetingPointDetails {
  return {
    ...point,
    aliases: [],
    whereToStand: null,
    pausedUntil: null,
    lastCheckedOn: null,
    ...more,
  };
}

export const thorlakshofn: Place = {
  id: "0190a1d6-0000-7000-8000-0000000000c1",
  name: { is: "Þorlákshöfn", en: "Þorlákshöfn" },
  kind: "town",
  region: "south",
};
