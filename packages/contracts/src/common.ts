import { z } from "zod";

/** The app languages (ADR 0011). */
export const localeSchema = z.enum(["is", "en"]);

export const platformSchema = z.enum(["ios", "android", "web"]);

/** A point in time in ISO 8601, always in UTC (for example 2026-11-13T12:00:00.000Z). */
export const timestampSchema = z.iso.datetime();
