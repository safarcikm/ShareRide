// Adding meeting points in bulk from a CSV file (spec 2, 3.6.9; milestone 8
// plan, 4.6): one point per row, read and checked as the form would check
// it, so the console can show each row and its problems before saving the
// rows without problems as drafts.
import { err, ok, type Result } from "../result.ts";
import {
  validateMeetingPointDraft,
  type DraftIssue,
  type MeetingPointDraft,
  type ValidMeetingPointDraft,
} from "./draft.ts";
import { normaliseSearchText } from "./search.ts";

/** The columns a file may have, named in its first row, in any order. */
export const importColumns = [
  "name_is",
  "name_en",
  "aliases",
  "latitude",
  "longitude",
  "type",
  "region",
  "municipality",
  "where_to_stand_is",
  "where_to_stand_en",
  "amenities",
  "season_start",
  "season_end",
] as const;
export type ImportColumn = (typeof importColumns)[number];

/** What a draft needs; the other columns may be left out. */
export const requiredImportColumns: readonly ImportColumn[] = [
  "name_is",
  "latitude",
  "longitude",
  "type",
  "region",
  "municipality",
];

export const importLimits = {
  /** Points in one file: the first corridors, a few hundred at most. */
  maxRows: 500,
  /** The file's size in bytes. */
  maxBytes: 1_000_000,
} as const;

/** Separates aliases and amenities within a cell, whatever separates the cells. */
export const importListSeparator = "|";

export type ImportFileIssue =
  | "empty"
  | "not_utf8"
  | "unclosed_quote"
  | "too_many_rows"
  | "unknown_column"
  | "repeated_column"
  | "missing_column";

/** Why a whole file cannot be read: with the column, or the line a quote opened on. */
export interface ImportFileProblem {
  readonly issue: ImportFileIssue;
  readonly column?: string;
  readonly line?: number;
}

/** A draft's problems, a cell that is not a number, a name already used, or a row's cells. */
export type ImportIssue = DraftIssue | "unreadable" | "duplicate" | "cells";

/** "position" is the latitude and longitude together; "row" the row as a whole. */
export interface ImportProblem {
  readonly column: ImportColumn | "position" | "row";
  readonly issue: ImportIssue;
}

/** A row of the file, from the line it starts on: its draft, or its problems. */
export type ImportRow =
  | {
      readonly line: number;
      readonly nameIs: string;
      readonly ok: true;
      readonly draft: ValidMeetingPointDraft;
    }
  | {
      readonly line: number;
      readonly nameIs: string;
      readonly ok: false;
      readonly problems: readonly ImportProblem[];
    };

const columnOrder: readonly ImportProblem["column"][] = [
  "row",
  "name_is",
  "name_en",
  "aliases",
  "latitude",
  "longitude",
  "position",
  "type",
  "region",
  "municipality",
  "where_to_stand_is",
  "where_to_stand_en",
  "amenities",
  "season_start",
  "season_end",
];

/** The draft's fields as the file's columns. */
const columnOfField: Readonly<Record<string, ImportProblem["column"]>> = {
  nameIs: "name_is",
  nameEn: "name_en",
  aliases: "aliases",
  position: "position",
  region: "region",
  municipality: "municipality",
  type: "type",
  amenities: "amenities",
  whereToStandIs: "where_to_stand_is",
  whereToStandEn: "where_to_stand_en",
  season: "season_start",
};

const isColumn = (name: string): name is ImportColumn =>
  importColumns.some((column) => column === name);

/**
 * Reads a file of meeting points (UTF-8 text) into its rows, each tidied
 * and checked as the form checks a draft, with every problem by its column.
 * Cells are separated by commas, or by semicolons or tabs as spreadsheets
 * in Iceland save them; a decimal comma is taken in the coordinates.
 * `existingNames` are the names of the points there already: a row with one
 * of them, or with the name of an earlier row, is a duplicate. `today` is
 * the date in Iceland.
 */
export function readMeetingPointImport(
  text: string,
  context: { readonly today: string; readonly existingNames: readonly string[] },
): Result<readonly ImportRow[], readonly ImportFileProblem[]> {
  const content = text.startsWith("﻿") ? text.slice(1) : text;
  // A file in another encoding, read as UTF-8, has replacement characters.
  if (content.includes("�")) return err([{ issue: "not_utf8" }]);

  const parsed = parseCsv(content, delimiterOf(content));
  if (!parsed.ok) return err([{ issue: "unclosed_quote", line: parsed.error }]);
  const lines = parsed.value.filter((line) => line.cells.some((cell) => cell.trim() !== ""));
  const [head, ...body] = lines;
  if (head === undefined || body.length === 0) return err([{ issue: "empty" }]);

  const names = head.cells.map((cell) => cell.trim().toLowerCase());
  const problems: ImportFileProblem[] = [];
  names.forEach((name, index) => {
    if (names.indexOf(name) !== index) problems.push({ issue: "repeated_column", column: name });
  });
  for (const name of names) {
    if (!isColumn(name)) problems.push({ issue: "unknown_column", column: name });
  }
  for (const column of requiredImportColumns) {
    if (!names.includes(column)) problems.push({ issue: "missing_column", column });
  }
  if (problems.length > 0) return err(problems);
  if (body.length > importLimits.maxRows) return err([{ issue: "too_many_rows" }]);

  const seen = new Set(context.existingNames.map(normaliseSearchText));
  return ok(
    body.map(({ line, cells }) => {
      const cell = (column: ImportColumn) => {
        const index = names.indexOf(column);
        return index === -1 ? "" : (cells[index] ?? "");
      };
      const row = readRow(cell, cells.length === names.length, context.today);
      const name = normaliseSearchText(row.nameIs);
      const duplicate = name !== "" && seen.has(name);
      seen.add(name);
      const found = duplicate
        ? [...row.problems, { column: "name_is", issue: "duplicate" } as const]
        : row.problems;
      if (found.length > 0 || row.draft === null) {
        return { line, nameIs: row.nameIs, ok: false, problems: inColumnOrder(found) };
      }
      return { line, nameIs: row.nameIs, ok: true, draft: row.draft };
    }),
  );
}

function readRow(
  cell: (column: ImportColumn) => string,
  whole: boolean,
  today: string,
): {
  readonly nameIs: string;
  readonly draft: ValidMeetingPointDraft | null;
  readonly problems: readonly ImportProblem[];
} {
  const nameIs = cell("name_is").normalize("NFC").trim();
  if (!whole) return { nameIs, draft: null, problems: [{ column: "row", issue: "cells" }] };

  const problems: ImportProblem[] = [];
  const latitude = degrees(cell("latitude"), "latitude", problems);
  const longitude = degrees(cell("longitude"), "longitude", problems);
  const season = seasonOf(cell("season_start"), cell("season_end"), problems);
  const draft: MeetingPointDraft = {
    nameIs,
    nameEn: cell("name_en"),
    aliases: listOf(cell("aliases")),
    position: { latitude: latitude ?? 0, longitude: longitude ?? 0 },
    region: cell("region").trim().toLowerCase(),
    municipality: cell("municipality"),
    type: cell("type").trim().toLowerCase(),
    amenities: listOf(cell("amenities")).map((amenity) => amenity.toLowerCase()),
    whereToStandIs: cell("where_to_stand_is"),
    whereToStandEn: cell("where_to_stand_en"),
    shelterHours: null,
    shelterNoteIs: null,
    shelterNoteEn: null,
    season,
    lastCheckedOn: null,
  };
  const checked = validateMeetingPointDraft(draft, today);
  if (checked.ok) return { nameIs, draft: problems.length > 0 ? null : checked.value, problems };
  const coordinatesRead = latitude !== null && longitude !== null;
  for (const { field, issue } of checked.error) {
    const column = columnOfField[field.split(".")[0] ?? field];
    if (column === undefined) continue;
    // A spot that could not be read is said once, by its column.
    if (column === "position" && !coordinatesRead) continue;
    if (!problems.some((known) => known.column === column && known.issue === issue)) {
      problems.push({ column, issue });
    }
  }
  return { nameIs, draft: null, problems };
}

/** Decimal degrees, with a point or a decimal comma; null with a problem if not. */
function degrees(
  value: string,
  column: "latitude" | "longitude",
  problems: ImportProblem[],
): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    problems.push({ column, issue: "required" });
    return null;
  }
  if (!/^[-+]?\d+(?:[.,]\d+)?$/.test(trimmed)) {
    problems.push({ column, issue: "unreadable" });
    return null;
  }
  return Number(trimmed.replace(",", "."));
}

/** All year when both are empty; otherwise two whole months, 1 to 12. */
function seasonOf(
  start: string,
  end: string,
  problems: ImportProblem[],
): MeetingPointDraft["season"] {
  const startMonth = monthOf(start, "season_start", problems);
  const endMonth = monthOf(end, "season_end", problems);
  if (startMonth === undefined && endMonth === undefined) return null;
  if (startMonth === undefined) problems.push({ column: "season_start", issue: "required" });
  if (endMonth === undefined) problems.push({ column: "season_end", issue: "required" });
  if (
    startMonth === undefined ||
    endMonth === undefined ||
    startMonth === null ||
    endMonth === null
  )
    return null;
  return { startMonth, endMonth };
}

/** Undefined when empty; null with a problem when not a month. */
function monthOf(
  value: string,
  column: "season_start" | "season_end",
  problems: ImportProblem[],
): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const month = /^\d{1,2}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (month >= 1 && month <= 12) return month;
  problems.push({ column, issue: "invalid" });
  return null;
}

const listOf = (value: string): string[] =>
  value
    .split(importListSeparator)
    .map((item) => item.trim())
    .filter((item) => item !== "");

const inColumnOrder = (problems: readonly ImportProblem[]): readonly ImportProblem[] =>
  [...problems].sort((a, b) => columnOrder.indexOf(a.column) - columnOrder.indexOf(b.column));

/** The separator the header row uses most: a comma, a semicolon or a tab. */
function delimiterOf(text: string): string {
  const header = text.split(/\r\n|\n|\r/u, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((delimiter) => ({
    delimiter,
    count: header.split(delimiter).length - 1,
  }));
  const [most] = counts.sort((a, b) => b.count - a.count);
  return most !== undefined && most.count > 0 ? most.delimiter : ",";
}

interface CsvLine {
  /** The line of the file the row starts on, from 1. */
  readonly line: number;
  readonly cells: readonly string[];
}

/**
 * Splits CSV text into rows of cells (RFC 4180): a cell in double quotes may
 * hold the separator, line breaks and quotes written twice. Fails with the
 * line of a quote that is never closed.
 */
function parseCsv(text: string, delimiter: string): Result<readonly CsvLine[], number> {
  const rows: CsvLine[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let quoteLine = 0;
  let line = 1;
  let rowLine = 1;
  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push({ line: rowLine, cells });
    cells = [];
  };
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] ?? "";
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        cell += '"';
        at += 1;
      } else if (char === '"') {
        quoted = false;
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && text[at + 1] === "\n") at += 1;
        cell += "\n";
        line += 1;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
      quoteLine = line;
    } else if (char === delimiter) {
      endCell();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[at + 1] === "\n") at += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      cell += char;
    }
  }
  if (quoted) return err(quoteLine);
  if (cell !== "" || cells.length > 0) endRow();
  return ok(rows);
}
