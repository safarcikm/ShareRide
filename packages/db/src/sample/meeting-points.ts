// Sample meeting points, places and roads for local development and
// staging (milestone 3 plan, decision 1). Real public places on three
// corridors from Reykjavík, with approximate positions and road distances.
// The operator's real list v1 and routing-engine legs replace them before
// the beta; nothing here has been checked on site.
import type { Amenity, MeetingPointType, PlaceKind, Region } from "@shareride/domain";
import type { Position } from "../schema/columns.ts";

export interface SamplePoint {
  readonly key: string;
  readonly nameIs: string;
  readonly nameEn?: string;
  readonly aliases?: readonly string[];
  readonly position: Position;
  readonly region: Region;
  readonly municipality: string;
  readonly type: MeetingPointType;
  readonly amenities: readonly Amenity[];
  readonly whereToStand: { readonly is: string; readonly en: string };
}

export interface SamplePlace {
  readonly key: string;
  readonly nameIs: string;
  readonly nameEn?: string;
  readonly aliases?: readonly string[];
  readonly position: Position;
  readonly kind: PlaceKind;
  readonly region: Region;
  readonly matchRadiusM?: number;
  readonly municipalities?: readonly string[];
}

/** A stretch of road between neighbouring points or junctions, in km and minutes. */
export type SampleRoad = readonly [from: string, to: string, km: number, minutes: number];

const at = (latitude: number, longitude: number): Position => ({ latitude, longitude });

const stand = {
  entrance: {
    is: "Sýnistaður: staðsetningin er áætluð. Við aðalinnganginn.",
    en: "Sample point: the location is approximate. By the main entrance.",
  },
  shelter: {
    is: "Sýnistaður: staðsetningin er áætluð. Við biðskýlið.",
    en: "Sample point: the location is approximate. By the bus shelter.",
  },
  forecourt: {
    is: "Sýnistaður: staðsetningin er áætluð. Á planinu fyrir framan búðina.",
    en: "Sample point: the location is approximate. On the forecourt in front of the shop.",
  },
  arrivals: {
    is: "Sýnistaður: staðsetningin er áætluð. Fyrir utan komusalinn.",
    en: "Sample point: the location is approximate. Outside the arrivals hall.",
  },
} as const;

const capitalArea = [
  "Reykjavík",
  "Kópavogur",
  "Garðabær",
  "Hafnarfjörður",
  "Seltjarnarnes",
  "Mosfellsbær",
] as const;

export const samplePoints: readonly SamplePoint[] = [
  // Capital area
  {
    key: "bsi",
    nameIs: "BSÍ",
    nameEn: "BSÍ bus terminal",
    aliases: ["Umferðarmiðstöðin"],
    position: at(64.1374, -21.9356),
    region: "capital",
    municipality: "Reykjavík",
    type: "bus-hub",
    amenities: ["shelter", "toilets", "shop", "step-free"],
    whereToStand: stand.entrance,
  },
  {
    key: "hlemmur",
    nameIs: "Hlemmur",
    position: at(64.1431, -21.9149),
    region: "capital",
    municipality: "Reykjavík",
    type: "bus-hub",
    amenities: ["shelter", "step-free"],
    whereToStand: stand.shelter,
  },
  {
    key: "kringlan",
    nameIs: "Kringlan",
    position: at(64.1297, -21.8958),
    region: "capital",
    municipality: "Reykjavík",
    type: "shopping-centre",
    amenities: ["shelter", "toilets", "shop", "parking", "step-free"],
    whereToStand: stand.entrance,
  },
  {
    key: "artun",
    nameIs: "Ártún",
    position: at(64.1229, -21.8152),
    region: "capital",
    municipality: "Reykjavík",
    type: "bus-hub",
    amenities: ["shelter"],
    whereToStand: stand.shelter,
  },
  {
    key: "mjodd",
    nameIs: "Mjódd",
    nameEn: "Mjódd bus terminal",
    position: at(64.1101, -21.8437),
    region: "capital",
    municipality: "Reykjavík",
    type: "bus-hub",
    amenities: ["shelter", "toilets", "shop", "step-free"],
    whereToStand: stand.shelter,
  },
  {
    key: "nordlingaholt",
    nameIs: "Olís Norðlingaholti",
    nameEn: "Olís Norðlingaholt",
    position: at(64.0955, -21.7698),
    region: "capital",
    municipality: "Reykjavík",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "smaralind",
    nameIs: "Smáralind",
    position: at(64.1014, -21.8841),
    region: "capital",
    municipality: "Kópavogur",
    type: "shopping-centre",
    amenities: ["shelter", "toilets", "shop", "parking", "step-free"],
    whereToStand: stand.entrance,
  },
  {
    key: "fjordur",
    nameIs: "Fjörður",
    nameEn: "Fjörður shopping centre",
    position: at(64.0679, -21.9556),
    region: "capital",
    municipality: "Hafnarfjörður",
    type: "shopping-centre",
    amenities: ["shelter", "toilets", "shop", "parking"],
    whereToStand: stand.entrance,
  },
  {
    key: "mosfellsbaer",
    nameIs: "N1 Mosfellsbæ",
    nameEn: "N1 Mosfellsbær",
    position: at(64.1667, -21.6987),
    region: "capital",
    municipality: "Mosfellsbær",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  // Southern Peninsula
  {
    key: "fitjar",
    nameIs: "N1 Fitjum",
    nameEn: "N1 Fitjar",
    aliases: ["Njarðvík"],
    position: at(63.9894, -22.5408),
    region: "southern-peninsula",
    municipality: "Reykjanesbær",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "kef",
    nameIs: "Keflavíkurflugvöllur",
    nameEn: "Keflavík Airport",
    aliases: ["KEF", "Leifsstöð"],
    position: at(63.9851, -22.6056),
    region: "southern-peninsula",
    municipality: "Reykjanesbær",
    type: "airport",
    amenities: ["shelter", "toilets", "shop", "parking", "step-free"],
    whereToStand: stand.arrivals,
  },
  // West
  {
    key: "akranes",
    nameIs: "N1 Akranesi",
    nameEn: "N1 Akranes",
    position: at(64.3187, -22.0601),
    region: "west",
    municipality: "Akranes",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "borgarnes",
    nameIs: "N1 Borgarnesi",
    nameEn: "N1 Borgarnes",
    position: at(64.5462, -21.9046),
    region: "west",
    municipality: "Borgarbyggð",
    type: "fuel-station",
    amenities: ["shelter", "toilets", "shop", "parking", "step-free"],
    whereToStand: stand.forecourt,
  },
  // Northwest
  {
    key: "stadarskali",
    nameIs: "Staðarskáli",
    position: at(65.1291, -21.0829),
    region: "northwest",
    municipality: "Húnaþing vestra",
    type: "fuel-station",
    amenities: ["shelter", "toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "blonduos",
    nameIs: "Olís Blönduósi",
    nameEn: "Olís Blönduós",
    position: at(65.6603, -20.2848),
    region: "northwest",
    municipality: "Húnabyggð",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "varmahlid",
    nameIs: "Varmahlíð",
    position: at(65.553, -19.4503),
    region: "northwest",
    municipality: "Skagafjörður",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "saudarkrokur",
    nameIs: "N1 Sauðárkróki",
    nameEn: "N1 Sauðárkrókur",
    position: at(65.7459, -19.64),
    region: "northwest",
    municipality: "Skagafjörður",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  // Northeast
  {
    key: "akureyri",
    nameIs: "Hof, Akureyri",
    nameEn: "Hof bus stop, Akureyri",
    aliases: ["Menningarhúsið Hof"],
    position: at(65.6832, -18.0871),
    region: "northeast",
    municipality: "Akureyri",
    type: "bus-hub",
    amenities: ["shelter", "toilets", "step-free"],
    whereToStand: stand.shelter,
  },
  {
    key: "aey",
    nameIs: "Akureyrarflugvöllur",
    nameEn: "Akureyri Airport",
    aliases: ["AEY"],
    position: at(65.66, -18.0727),
    region: "northeast",
    municipality: "Akureyri",
    type: "airport",
    amenities: ["shelter", "toilets", "parking", "step-free"],
    whereToStand: stand.arrivals,
  },
  // South
  {
    key: "hveragerdi",
    nameIs: "N1 Hveragerði",
    position: at(64.0003, -21.1878),
    region: "south",
    municipality: "Hveragerði",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "thorlakshofn",
    nameIs: "N1 Þorlákshöfn",
    position: at(63.8562, -21.3779),
    region: "south",
    municipality: "Ölfus",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "selfoss",
    nameIs: "N1 Selfossi",
    nameEn: "N1 Selfoss",
    position: at(63.9349, -20.9988),
    region: "south",
    municipality: "Árborg",
    type: "fuel-station",
    amenities: ["shelter", "toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "hella",
    nameIs: "N1 Hellu",
    nameEn: "N1 Hella",
    position: at(63.8353, -20.4002),
    region: "south",
    municipality: "Rangárþing ytra",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "hvolsvollur",
    nameIs: "N1 Hvolsvelli",
    nameEn: "N1 Hvolsvöllur",
    position: at(63.7522, -20.224),
    region: "south",
    municipality: "Rangárþing eystra",
    type: "fuel-station",
    amenities: ["toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
  {
    key: "vik",
    nameIs: "N1 Vík",
    aliases: ["Vík í Mýrdal"],
    position: at(63.4191, -19.0061),
    region: "south",
    municipality: "Mýrdalshreppur",
    type: "fuel-station",
    amenities: ["shelter", "toilets", "shop", "parking"],
    whereToStand: stand.forecourt,
  },
];

/**
 * Roads between neighbouring sample points, and two junctions that are not
 * meeting points. Approximate: Reykjavík to Borgarnes about 74 km, Borgarnes
 * to Blönduós 171 km and Blönduós to Akureyri 143 km, as in the worked
 * example of pricing and seats.
 */
export const sampleRoads: readonly SampleRoad[] = [
  ["bsi", "hlemmur", 2, 6],
  ["bsi", "kringlan", 3, 7],
  ["hlemmur", "kringlan", 3, 7],
  ["kringlan", "artun", 4, 6],
  ["kringlan", "mjodd", 4.5, 7],
  ["kringlan", "smaralind", 5, 8],
  ["smaralind", "mjodd", 3, 5],
  ["smaralind", "fjordur", 6, 9],
  ["mjodd", "nordlingaholt", 5, 7],
  ["artun", "nordlingaholt", 5, 6],
  ["artun", "mosfellsbaer", 9, 9],
  ["fjordur", "fitjar", 36, 27],
  ["fitjar", "kef", 5, 6],
  ["mosfellsbaer", "junction-akranes", 30, 22],
  ["junction-akranes", "akranes", 10, 9],
  ["junction-akranes", "borgarnes", 25, 18],
  ["borgarnes", "stadarskali", 88, 65],
  ["stadarskali", "blonduos", 83, 62],
  ["blonduos", "varmahlid", 48, 36],
  ["varmahlid", "saudarkrokur", 25, 20],
  ["varmahlid", "akureyri", 95, 75],
  ["akureyri", "aey", 3, 5],
  ["nordlingaholt", "hveragerdi", 37, 28],
  ["hveragerdi", "junction-thorlakshofn", 3, 3],
  ["junction-thorlakshofn", "thorlakshofn", 18, 14],
  ["hveragerdi", "selfoss", 12, 10],
  ["selfoss", "hella", 37, 28],
  ["hella", "hvolsvollur", 12, 9],
  ["hvolsvollur", "vik", 80, 60],
];

const town = (
  key: string,
  nameIs: string,
  position: Position,
  region: Region,
  extra: Partial<SamplePlace> = {},
): SamplePlace => ({ key, nameIs, position, kind: "town", region, ...extra });

export const samplePlaces: readonly SamplePlace[] = [
  {
    key: "capital-area",
    nameIs: "Reykjavík",
    aliases: ["Höfuðborgarsvæðið", "Capital area"],
    position: at(64.1466, -21.9426),
    kind: "area",
    region: "capital",
    municipalities: capitalArea,
  },
  // The other capital area towns stay limited to themselves (spec 4, decision 1).
  town("kopavogur", "Kópavogur", at(64.1123, -21.9123), "capital", {
    municipalities: ["Kópavogur"],
  }),
  town("gardabaer", "Garðabær", at(64.0886, -21.9227), "capital", { municipalities: ["Garðabær"] }),
  town("hafnarfjordur", "Hafnarfjörður", at(64.0671, -21.9377), "capital", {
    municipalities: ["Hafnarfjörður"],
  }),
  town("seltjarnarnes", "Seltjarnarnes", at(64.153, -21.995), "capital", {
    municipalities: ["Seltjarnarnes"],
  }),
  town("mosfellsbaer-town", "Mosfellsbær", at(64.1667, -21.7), "capital", {
    municipalities: ["Mosfellsbær"],
  }),
  town("reykjanesbaer", "Reykjanesbær", at(63.9998, -22.5583), "southern-peninsula", {
    aliases: ["Keflavík", "Njarðvík"],
  }),
  town("grindavik", "Grindavík", at(63.8424, -22.4338), "southern-peninsula"),
  town("akranes-town", "Akranes", at(64.3218, -22.0749), "west"),
  town("borgarnes-town", "Borgarnes", at(64.5383, -21.9206), "west"),
  {
    ...town("bifrost", "Bifröst", at(64.7653, -21.5583), "west"),
    kind: "village",
    matchRadiusM: 5_000,
  },
  town("stykkisholmur", "Stykkishólmur", at(65.0753, -22.7297), "west"),
  { ...town("hvammstangi", "Hvammstangi", at(65.3955, -20.9433), "northwest"), kind: "village" },
  town("blonduos-town", "Blönduós", at(65.6605, -20.2789), "northwest"),
  { ...town("skagastrond", "Skagaströnd", at(65.8264, -20.3198), "northwest"), kind: "village" },
  { ...town("varmahlid-village", "Varmahlíð", at(65.5525, -19.452), "northwest"), kind: "village" },
  town("saudarkrokur-town", "Sauðárkrókur", at(65.7461, -19.6394), "northwest"),
  town("akureyri-town", "Akureyri", at(65.6826, -18.0907), "northeast"),
  town("dalvik", "Dalvík", at(65.9702, -18.5287), "northeast"),
  town("hveragerdi-town", "Hveragerði", at(64.0001, -21.1859), "south"),
  town("selfoss-town", "Selfoss", at(63.9331, -20.9971), "south", { aliases: ["Árborg"] }),
  town("thorlakshofn-town", "Þorlákshöfn", at(63.8558, -21.3829), "south"),
  { ...town("eyrarbakki", "Eyrarbakki", at(63.8634, -21.1524), "south"), kind: "village" },
  { ...town("hella-town", "Hella", at(63.8344, -20.3973), "south"), kind: "village" },
  { ...town("hvolsvollur-town", "Hvolsvöllur", at(63.7513, -20.226), "south"), kind: "village" },
  {
    ...town("vik-town", "Vík", at(63.4186, -19.006), "south", { aliases: ["Vík í Mýrdal"] }),
    kind: "village",
  },
  landmark(
    "thingvellir",
    "Þingvellir",
    "Thingvellir National Park",
    at(64.2559, -21.1299),
    "south",
  ),
  landmark("geysir", "Geysir", undefined, at(64.3104, -20.3024), "south"),
  landmark("gullfoss", "Gullfoss", undefined, at(64.3271, -20.1199), "south"),
  landmark("seljalandsfoss", "Seljalandsfoss", undefined, at(63.6156, -19.9886), "south"),
  landmark("skogafoss", "Skógafoss", undefined, at(63.5321, -19.5114), "south"),
  landmark("reynisfjara", "Reynisfjara", "Reynisfjara beach", at(63.4044, -19.0447), "south"),
  landmark("blue-lagoon", "Bláa lónið", "Blue Lagoon", at(63.8804, -22.4495), "southern-peninsula"),
];

function landmark(
  key: string,
  nameIs: string,
  nameEn: string | undefined,
  position: Position,
  region: Region,
): SamplePlace {
  return {
    key,
    nameIs,
    ...(nameEn === undefined ? {} : { nameEn }),
    position,
    kind: "landmark",
    region,
  };
}
