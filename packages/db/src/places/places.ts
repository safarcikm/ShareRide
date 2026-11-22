// The places of place search (spec 4, 3.1; spec 19, 3.2): every settlement
// in Iceland that people live in and can drive to, and the landmarks.
// Reference data, not personal data, so every environment has them:
// `seedPlaces` adds or updates them on each deploy.
//
// The settlements are Statistics Iceland's byggðakjarnar on 1 January 2026
// (table MAN030101, free to reuse with the source named): the 118 with at
// least 50 people, less the 5 with nobody registered in 2026 and the 3
// islands reached only by ferry (Vestmannaeyjar, Hrísey, Grímsey). Each
// centre is the settlement's place node in OpenStreetMap
// (© OpenStreetMap contributors, ODbL) and its region follows its 2026
// municipality. A place the sample data had keeps its key, name, spot, kind
// and reach, so its ID and what a search there finds stay as they were.
import type { PlaceKind, Region } from "@shareride/domain";
import type { Position } from "../schema/columns.ts";

export interface Place {
  /** Stable: the place's ID is made from it (`placeId`). */
  readonly key: string;
  readonly nameIs: string;
  readonly nameEn?: string;
  readonly aliases?: readonly string[];
  readonly position: Position;
  /** A town from 1 000 people, otherwise a village (spec 19, 3.2). */
  readonly kind: PlaceKind;
  readonly region: Region;
  /** How far a search reaches, when not the kind's default (spec 4, R4.2). */
  readonly matchRadiusM?: number;
  /** The municipalities whose points it covers, instead of a radius. */
  readonly municipalities?: readonly string[];
  /** Statistics Iceland's number for the settlement, and its people on 1 January 2026. */
  readonly settlement?: { readonly code: number; readonly population: number };
}

const at = (latitude: number, longitude: number): Position => ({ latitude, longitude });

/** The six municipalities of the capital area, which its place covers. */
export const capitalArea = [
  "Reykjavík",
  "Kópavogur",
  "Garðabær",
  "Hafnarfjörður",
  "Seltjarnarnes",
  "Mosfellsbær",
] as const;

/**
 * The settlements, by Statistics Iceland's number. The other capital area
 * towns are limited to their own municipality (spec 4, decision 1).
 */
// prettier-ignore
export const settlementPlaces: readonly Place[] = [
  { key: "hafnarfjordur", nameIs: "Hafnarfjörður", position: at(64.0671, -21.9377), kind: "town", region: "capital", municipalities: ["Hafnarfjörður"], settlement: { code: 10, population: 32398 } },
  { key: "gardabaer", nameIs: "Garðabær", position: at(64.0886, -21.9227), kind: "town", region: "capital", municipalities: ["Garðabær"], settlement: { code: 20, population: 17755 } },
  { key: "alftanes", nameIs: "Álftanes", position: at(64.1056, -22.0202), kind: "town", region: "capital", municipalities: ["Garðabær"], settlement: { code: 30, population: 2916 } },
  { key: "kopavogur", nameIs: "Kópavogur", position: at(64.1123, -21.9123), kind: "town", region: "capital", municipalities: ["Kópavogur"], settlement: { code: 40, population: 40228 } },
  { key: "capital-area", nameIs: "Reykjavík", aliases: ["Höfuðborgarsvæðið", "Capital area"], position: at(64.1466, -21.9426), kind: "area", region: "capital", municipalities: capitalArea, settlement: { code: 50, population: 138753 } },
  { key: "seltjarnarnes", nameIs: "Seltjarnarnes", position: at(64.153, -21.995), kind: "town", region: "capital", municipalities: ["Seltjarnarnes"], settlement: { code: 60, population: 4609 } },
  { key: "mosfellsbaer-town", nameIs: "Mosfellsbær", position: at(64.1667, -21.7), kind: "town", region: "capital", municipalities: ["Mosfellsbær"], settlement: { code: 70, population: 13417 } },
  { key: "mosfellsdalur", nameIs: "Mosfellsdalur", position: at(64.1803, -21.6189), kind: "village", region: "capital", settlement: { code: 80, population: 245 } },
  { key: "grundarhverfi", nameIs: "Grundarhverfi", aliases: ["Kjalarnes"], position: at(64.2402, -21.8322), kind: "village", region: "capital", settlement: { code: 90, population: 655 } },
  { key: "grindavik", nameIs: "Grindavík", position: at(63.8424, -22.4338), kind: "town", region: "southern-peninsula", settlement: { code: 110, population: 817 } },
  { key: "hafnir", nameIs: "Hafnir", position: at(63.934, -22.6841), kind: "village", region: "southern-peninsula", settlement: { code: 111, population: 122 } },
  { key: "sandgerdi", nameIs: "Sandgerði", position: at(64.0388, -22.7059), kind: "town", region: "southern-peninsula", settlement: { code: 120, population: 2188 } },
  { key: "gardur", nameIs: "Garður", position: at(64.0704, -22.6512), kind: "town", region: "southern-peninsula", settlement: { code: 130, population: 2006 } },
  { key: "reykjanesbaer", nameIs: "Reykjanesbær", aliases: ["Keflavík", "Njarðvík"], position: at(63.9998, -22.5583), kind: "town", region: "southern-peninsula", settlement: { code: 141, population: 22572 } },
  { key: "vogar", nameIs: "Vogar", position: at(63.9832, -22.3874), kind: "town", region: "southern-peninsula", settlement: { code: 160, population: 1818 } },
  { key: "innnes", nameIs: "Innnes", position: at(64.3099, -22.0404), kind: "village", region: "west", settlement: { code: 189, population: 178 } },
  { key: "akranes-town", nameIs: "Akranes", position: at(64.3218, -22.0749), kind: "town", region: "west", settlement: { code: 190, population: 8429 } },
  { key: "hvanneyri", nameIs: "Hvanneyri", position: at(64.5633, -21.7665), kind: "village", region: "west", settlement: { code: 191, population: 270 } },
  { key: "kleppjarnsreykir", nameIs: "Kleppjárnsreykir", position: at(64.6568, -21.3993), kind: "village", region: "west", settlement: { code: 192, population: 54 } },
  { key: "reykholt-i-borgarfirdi", nameIs: "Reykholt í Borgarfirði", aliases: ["Reykholt"], position: at(64.6648, -21.292), kind: "village", region: "west", settlement: { code: 193, population: 72 } },
  { key: "melahverfi", nameIs: "Melahverfi", position: at(64.3815, -21.8411), kind: "village", region: "west", settlement: { code: 195, population: 165 } },
  { key: "borgarnes-town", nameIs: "Borgarnes", position: at(64.5383, -21.9206), kind: "town", region: "west", settlement: { code: 200, population: 2250 } },
  { key: "bifrost", nameIs: "Bifröst", position: at(64.7653, -21.5583), kind: "village", region: "west", matchRadiusM: 5_000, settlement: { code: 205, population: 247 } },
  { key: "hellissandur", nameIs: "Hellissandur", position: at(64.9172, -23.8825), kind: "village", region: "west", settlement: { code: 210, population: 365 } },
  { key: "rif", nameIs: "Rif", position: at(64.9219, -23.8223), kind: "village", region: "west", settlement: { code: 211, population: 139 } },
  { key: "olafsvik", nameIs: "Ólafsvík", position: at(64.8959, -23.7084), kind: "village", region: "west", settlement: { code: 220, population: 978 } },
  { key: "grundarfjordur", nameIs: "Grundarfjörður", position: at(64.925, -23.2593), kind: "village", region: "west", settlement: { code: 230, population: 810 } },
  { key: "stykkisholmur", nameIs: "Stykkishólmur", position: at(65.0753, -22.7297), kind: "town", region: "west", settlement: { code: 240, population: 1218 } },
  { key: "budardalur", nameIs: "Búðardalur", position: at(65.1098, -21.7668), kind: "village", region: "west", settlement: { code: 250, population: 239 } },
  { key: "reykholar", nameIs: "Reykhólar", position: at(65.4486, -22.2015), kind: "village", region: "westfjords", settlement: { code: 339, population: 125 } },
  { key: "patreksfjordur", nameIs: "Patreksfjörður", position: at(65.5973, -24.0009), kind: "village", region: "westfjords", settlement: { code: 340, population: 714 } },
  { key: "talknafjordur", nameIs: "Tálknafjörður", position: at(65.6274, -23.8249), kind: "village", region: "westfjords", settlement: { code: 350, population: 218 } },
  { key: "bildudalur", nameIs: "Bíldudalur", position: at(65.6859, -23.5989), kind: "village", region: "westfjords", settlement: { code: 360, population: 237 } },
  { key: "thingeyri", nameIs: "Þingeyri", position: at(65.8791, -23.4924), kind: "village", region: "westfjords", settlement: { code: 370, population: 289 } },
  { key: "flateyri", nameIs: "Flateyri", position: at(66.0488, -23.513), kind: "village", region: "westfjords", settlement: { code: 380, population: 223 } },
  { key: "sudureyri", nameIs: "Suðureyri", position: at(66.1296, -23.5268), kind: "village", region: "westfjords", settlement: { code: 390, population: 301 } },
  { key: "bolungarvik", nameIs: "Bolungarvík", position: at(66.1576, -23.2507), kind: "village", region: "westfjords", settlement: { code: 400, population: 985 } },
  { key: "isafjordur", nameIs: "Ísafjörður", position: at(66.0727, -23.1194), kind: "town", region: "westfjords", settlement: { code: 410, population: 2807 } },
  { key: "hnifsdalur", nameIs: "Hnífsdalur", position: at(66.1097, -23.1202), kind: "village", region: "westfjords", settlement: { code: 420, population: 212 } },
  { key: "sudavik", nameIs: "Súðavík", position: at(66.026, -22.9915), kind: "village", region: "westfjords", settlement: { code: 430, population: 174 } },
  { key: "drangsnes", nameIs: "Drangsnes", position: at(65.6886, -21.4429), kind: "village", region: "westfjords", settlement: { code: 431, population: 75 } },
  { key: "holmavik", nameIs: "Hólmavík", position: at(65.7065, -21.6692), kind: "village", region: "westfjords", settlement: { code: 440, population: 309 } },
  { key: "laugarbakki", nameIs: "Laugarbakki", position: at(65.3275, -20.8921), kind: "village", region: "northwest", settlement: { code: 529, population: 65 } },
  { key: "hvammstangi", nameIs: "Hvammstangi", position: at(65.3955, -20.9433), kind: "village", region: "northwest", settlement: { code: 530, population: 597 } },
  { key: "blonduos-town", nameIs: "Blönduós", position: at(65.6605, -20.2789), kind: "town", region: "northwest", settlement: { code: 540, population: 853 } },
  { key: "skagastrond", nameIs: "Skagaströnd", position: at(65.8264, -20.3198), kind: "village", region: "northwest", settlement: { code: 550, population: 440 } },
  { key: "saudarkrokur-town", nameIs: "Sauðárkrókur", position: at(65.7461, -19.6394), kind: "town", region: "northwest", settlement: { code: 560, population: 2672 } },
  { key: "varmahlid-village", nameIs: "Varmahlíð", position: at(65.5525, -19.452), kind: "village", region: "northwest", settlement: { code: 561, population: 155 } },
  { key: "holar-i-hjaltadal", nameIs: "Hólar í Hjaltadal", aliases: ["Hólar"], position: at(65.732, -19.1111), kind: "village", region: "northwest", settlement: { code: 562, population: 93 } },
  { key: "hofsos", nameIs: "Hofsós", position: at(65.8975, -19.411), kind: "village", region: "northwest", settlement: { code: 570, population: 164 } },
  { key: "siglufjordur", nameIs: "Siglufjörður", position: at(66.1505, -18.9096), kind: "town", region: "northeast", settlement: { code: 580, population: 1159 } },
  { key: "olafsfjordur", nameIs: "Ólafsfjörður", position: at(66.072, -18.648), kind: "village", region: "northeast", settlement: { code: 650, population: 771 } },
  { key: "dalvik", nameIs: "Dalvík", position: at(65.9702, -18.5287), kind: "town", region: "northeast", settlement: { code: 660, population: 1385 } },
  { key: "arskogssandur", nameIs: "Árskógssandur", aliases: ["Litli-Árskógssandur"], position: at(65.9444, -18.3539), kind: "village", region: "northeast", settlement: { code: 671, population: 111 } },
  { key: "hauganes", nameIs: "Hauganes", position: at(65.9249, -18.3055), kind: "village", region: "northeast", settlement: { code: 672, population: 118 } },
  { key: "lonsbakki", nameIs: "Lónsbakki", position: at(65.7027, -18.1559), kind: "village", region: "northeast", settlement: { code: 679, population: 400 } },
  { key: "akureyri-town", nameIs: "Akureyri", position: at(65.6826, -18.0907), kind: "town", region: "northeast", settlement: { code: 680, population: 20067 } },
  { key: "hrafnagil", nameIs: "Hrafnagil", position: at(65.5735, -18.0945), kind: "village", region: "northeast", settlement: { code: 682, population: 398 } },
  { key: "ongulsstadir", nameIs: "Öngulsstaðir", position: at(65.5977, -18.0365), kind: "village", region: "northeast", settlement: { code: 684, population: 89 } },
  { key: "brunahlid", nameIs: "Brúnahlíð", position: at(65.6547, -18.0258), kind: "village", region: "northeast", settlement: { code: 685, population: 143 } },
  { key: "veigastadir", nameIs: "Veigastaðir", position: at(65.6813, -18.0401), kind: "village", region: "northeast", settlement: { code: 687, population: 74 } },
  { key: "solberg", nameIs: "Sólberg", position: at(65.7069, -18.0664), kind: "village", region: "northeast", settlement: { code: 688, population: 56 } },
  { key: "svalbardseyri", nameIs: "Svalbarðseyri", position: at(65.7459, -18.083), kind: "village", region: "northeast", settlement: { code: 689, population: 285 } },
  { key: "grenivik", nameIs: "Grenivík", position: at(65.9475, -18.1801), kind: "village", region: "northeast", settlement: { code: 690, population: 298 } },
  { key: "reykjahlid", nameIs: "Reykjahlíð", aliases: ["Mývatn"], position: at(65.6416, -16.91), kind: "village", region: "northeast", settlement: { code: 700, population: 270 } },
  { key: "laugar", nameIs: "Laugar", aliases: ["Laugar í Reykjadal"], position: at(65.7216, -17.3728), kind: "village", region: "northeast", settlement: { code: 701, population: 120 } },
  { key: "vogar-vid-myvatn", nameIs: "Vogar við Mývatn", position: at(65.6236, -16.9184), kind: "village", region: "northeast", settlement: { code: 705, population: 60 } },
  { key: "husavik", nameIs: "Húsavík", position: at(66.0433, -17.341), kind: "town", region: "northeast", settlement: { code: 710, population: 2403 } },
  { key: "kopasker", nameIs: "Kópasker", position: at(66.3009, -16.4466), kind: "village", region: "northeast", settlement: { code: 711, population: 126 } },
  { key: "raufarhofn", nameIs: "Raufarhöfn", position: at(66.453, -15.9509), kind: "village", region: "northeast", settlement: { code: 720, population: 166 } },
  { key: "thorshofn", nameIs: "Þórshöfn", position: at(66.1981, -15.3359), kind: "village", region: "northeast", settlement: { code: 730, population: 341 } },
  { key: "bakkafjordur", nameIs: "Bakkafjörður", position: at(66.0365, -14.8041), kind: "village", region: "northeast", settlement: { code: 869, population: 65 } },
  { key: "vopnafjordur", nameIs: "Vopnafjörður", position: at(65.7541, -14.8295), kind: "village", region: "east", settlement: { code: 870, population: 503 } },
  { key: "fellabaer", nameIs: "Fellabær", position: at(65.2823, -14.4245), kind: "village", region: "east", settlement: { code: 890, population: 408 } },
  { key: "borgarfjordur-eystri", nameIs: "Borgarfjörður eystri", aliases: ["Bakkagerði"], position: at(65.527, -13.8161), kind: "village", region: "east", settlement: { code: 891, population: 99 } },
  { key: "seydisfjordur", nameIs: "Seyðisfjörður", position: at(65.2598, -14.0049), kind: "village", region: "east", settlement: { code: 900, population: 648 } },
  { key: "hallormsstadur", nameIs: "Hallormsstaður", position: at(65.0932, -14.7438), kind: "village", region: "east", settlement: { code: 901, population: 56 } },
  { key: "egilsstadir", nameIs: "Egilsstaðir", position: at(65.262, -14.4035), kind: "town", region: "east", settlement: { code: 902, population: 2719 } },
  { key: "neskaupstadur", nameIs: "Neskaupstaður", position: at(65.1487, -13.6889), kind: "town", region: "east", settlement: { code: 910, population: 1478 } },
  { key: "eskifjordur", nameIs: "Eskifjörður", position: at(65.0713, -14.0124), kind: "town", region: "east", settlement: { code: 920, population: 1063 } },
  { key: "reydarfjordur", nameIs: "Reyðarfjörður", position: at(65.0341, -14.2085), kind: "town", region: "east", settlement: { code: 930, population: 1470 } },
  { key: "faskrudsfjordur", nameIs: "Fáskrúðsfjörður", position: at(64.93, -14.0084), kind: "village", region: "east", settlement: { code: 940, population: 707 } },
  { key: "stodvarfjordur", nameIs: "Stöðvarfjörður", position: at(64.8338, -13.8737), kind: "village", region: "east", settlement: { code: 950, population: 167 } },
  { key: "breiddalsvik", nameIs: "Breiðdalsvík", position: at(64.7929, -14.0064), kind: "village", region: "east", settlement: { code: 960, population: 153 } },
  { key: "djupivogur", nameIs: "Djúpivogur", position: at(64.6558, -14.2821), kind: "village", region: "east", settlement: { code: 970, population: 407 } },
  { key: "nesjahverfi", nameIs: "Nesjahverfi", aliases: ["Nesjar"], position: at(64.3144, -15.2252), kind: "village", region: "south", matchRadiusM: 8_000, settlement: { code: 971, population: 105 } },
  { key: "hofn", nameIs: "Höfn", aliases: ["Höfn í Hornafirði", "Hornafjörður"], position: at(64.2533, -15.208), kind: "town", region: "south", settlement: { code: 980, population: 1813 } },
  { key: "hof-i-oraefum", nameIs: "Hof í Öræfum", aliases: ["Hof", "Öræfi"], position: at(63.9069, -16.7071), kind: "village", region: "south", settlement: { code: 990, population: 68 } },
  { key: "kirkjubaejarklaustur", nameIs: "Kirkjubæjarklaustur", aliases: ["Klaustur"], position: at(63.7931, -18.0419), kind: "village", region: "south", settlement: { code: 1089, population: 210 } },
  { key: "vik-town", nameIs: "Vík", aliases: ["Vík í Mýrdal"], position: at(63.4186, -19.006), kind: "village", region: "south", settlement: { code: 1090, population: 740 } },
  { key: "hvolsvollur-town", nameIs: "Hvolsvöllur", position: at(63.7513, -20.226), kind: "village", region: "south", settlement: { code: 1110, population: 1181 } },
  { key: "hella-town", nameIs: "Hella", position: at(63.8344, -20.3973), kind: "village", region: "south", settlement: { code: 1120, population: 1083 } },
  { key: "thykkvibaer", nameIs: "Þykkvibær", position: at(63.7466, -20.6099), kind: "village", region: "south", settlement: { code: 1125, population: 85 } },
  { key: "stokkseyri", nameIs: "Stokkseyri", position: at(63.837, -21.0612), kind: "village", region: "south", settlement: { code: 1130, population: 523 } },
  { key: "eyrarbakki", nameIs: "Eyrarbakki", position: at(63.8634, -21.1524), kind: "village", region: "south", settlement: { code: 1140, population: 615 } },
  { key: "tjarnabyggd", nameIs: "Tjarnabyggð", position: at(63.8953, -21.0952), kind: "village", region: "south", settlement: { code: 1145, population: 230 } },
  { key: "selfoss-town", nameIs: "Selfoss", aliases: ["Árborg"], position: at(63.9331, -20.9971), kind: "town", region: "south", settlement: { code: 1150, population: 11000 } },
  { key: "brautarholt-a-skeidum", nameIs: "Brautarholt á Skeiðum", aliases: ["Brautarholt"], position: at(64.0221, -20.5203), kind: "village", region: "south", settlement: { code: 1155, population: 92 } },
  { key: "arnes", nameIs: "Árnes", position: at(64.0417, -20.2509), kind: "village", region: "south", settlement: { code: 1157, population: 74 } },
  { key: "fludir", nameIs: "Flúðir", position: at(64.1306, -20.3209), kind: "village", region: "south", settlement: { code: 1160, population: 539 } },
  { key: "laugaras", nameIs: "Laugarás", position: at(64.1157, -20.5022), kind: "village", region: "south", settlement: { code: 1161, population: 116 } },
  { key: "reykholt-i-biskupstungum", nameIs: "Reykholt í Biskupstungum", aliases: ["Reykholt"], position: at(64.1783, -20.4461), kind: "village", region: "south", settlement: { code: 1162, population: 474 } },
  { key: "laugarvatn", nameIs: "Laugarvatn", position: at(64.2172, -20.7334), kind: "village", region: "south", settlement: { code: 1163, population: 280 } },
  { key: "solheimar-i-grimsnesi", nameIs: "Sólheimar í Grímsnesi", aliases: ["Sólheimar"], position: at(64.0668, -20.6433), kind: "village", region: "south", settlement: { code: 1164, population: 91 } },
  { key: "arbaejarhverfi", nameIs: "Árbæjarhverfi", position: at(63.9458, -21.027), kind: "village", region: "south", settlement: { code: 1166, population: 66 } },
  { key: "borg-i-grimsnesi", nameIs: "Borg í Grímsnesi", aliases: ["Borg"], position: at(64.0752, -20.7657), kind: "village", region: "south", settlement: { code: 1167, population: 275 } },
  { key: "gljufurarholt", nameIs: "Gljúfurárholt", position: at(63.9833, -21.1429), kind: "village", region: "south", settlement: { code: 1168, population: 101 } },
  { key: "vellir", nameIs: "Vellir", position: at(63.984, -21.1739), kind: "village", region: "south", settlement: { code: 1169, population: 55 } },
  { key: "hveragerdi-town", nameIs: "Hveragerði", position: at(64.0001, -21.1859), kind: "town", region: "south", settlement: { code: 1170, population: 3342 } },
  { key: "thorlakshofn-town", nameIs: "Þorlákshöfn", position: at(63.8558, -21.3829), kind: "town", region: "south", settlement: { code: 1180, population: 2316 } },
];

/** Places that are not settlements, for trips to and from them. */
export const landmarkPlaces: readonly Place[] = [
  {
    key: "thingvellir",
    nameIs: "Þingvellir",
    nameEn: "Thingvellir National Park",
    position: at(64.2559, -21.1299),
    kind: "landmark",
    region: "south",
  },
  {
    key: "geysir",
    nameIs: "Geysir",
    position: at(64.3104, -20.3024),
    kind: "landmark",
    region: "south",
  },
  {
    key: "gullfoss",
    nameIs: "Gullfoss",
    position: at(64.3271, -20.1199),
    kind: "landmark",
    region: "south",
  },
  {
    key: "seljalandsfoss",
    nameIs: "Seljalandsfoss",
    position: at(63.6156, -19.9886),
    kind: "landmark",
    region: "south",
  },
  {
    key: "skogafoss",
    nameIs: "Skógafoss",
    position: at(63.5321, -19.5114),
    kind: "landmark",
    region: "south",
  },
  {
    key: "reynisfjara",
    nameIs: "Reynisfjara",
    nameEn: "Reynisfjara beach",
    position: at(63.4044, -19.0447),
    kind: "landmark",
    region: "south",
  },
  {
    key: "blue-lagoon",
    nameIs: "Bláa lónið",
    nameEn: "Blue Lagoon",
    position: at(63.8804, -22.4495),
    kind: "landmark",
    region: "southern-peninsula",
  },
];

/** Every place of place search. */
export const allPlaces: readonly Place[] = [...settlementPlaces, ...landmarkPlaces];
