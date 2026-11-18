import { schema, type Database } from "@shareride/db";
import {
  checkAnnouncement,
  err,
  notificationRetention,
  ok,
  type AnnouncementAudience,
  type AnnouncementDraft,
  type AnnouncementProblem,
  type Result,
} from "@shareride/domain";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { recordAudit, type AuditEntry } from "../admin/audit.ts";
import type { Queryable } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";

// Announcements (spec 10, 3.5; R10.7): the operator writes one in both
// languages for an audience, sees its reach, sends it to themselves, and
// sends it once. The worker makes each person's notification.

const { announcements, corridors, notifications } = schema;

type Stored = typeof announcements.$inferSelect;

export interface AnnouncementView {
  readonly id: string;
  readonly audience: AnnouncementAudience;
  readonly corridor: { readonly id: string; readonly name: string } | null;
  readonly titleIs: string;
  readonly titleEn: string;
  readonly messageIs: string;
  readonly messageEn: string;
  readonly createdAt: Date;
  readonly testSentAt: Date | null;
  readonly sentAt: Date | null;
  readonly reach: number | null;
  /** From the delivery log; null for a draft, and once the log is past its days. */
  readonly delivered: { readonly push: number; readonly email: number } | null;
}

export interface AnnouncementReach {
  readonly people: number;
  readonly push: number;
  readonly email: number;
}

/** An announcement as the person it was sent to reads it. */
export interface SentAnnouncement {
  readonly id: string;
  readonly titleIs: string;
  readonly titleEn: string;
  readonly messageIs: string;
  readonly messageEn: string;
  readonly sentAt: Date;
}

type By = Pick<AuditEntry, "operator" | "request">;
type NotFound = { readonly code: "not_found" };
type AlreadySent = { readonly code: "already_sent" };
export type AnnouncementError = AnnouncementProblem | { readonly code: "corridor_unknown" };

export interface AnnouncementService {
  /** Newest first, at most 100, and the corridors one can be for. */
  overview(): Promise<{
    readonly announcements: readonly AnnouncementView[];
    readonly corridors: readonly { readonly id: string; readonly name: string }[];
  }>;
  create(draft: AnnouncementDraft, by: By): Promise<Result<AnnouncementView, AnnouncementError>>;
  /** A draft only: what was sent stays as it was sent. */
  update(
    id: string,
    draft: AnnouncementDraft,
    by: By,
  ): Promise<Result<AnnouncementView, AnnouncementError | NotFound | AlreadySent>>;
  /** Who it would go to now. */
  reach(id: string): Promise<AnnouncementReach | undefined>;
  /** "Send to me": the operator's own copy, in both languages, as often as they like. */
  test(id: string, by: By): Promise<Result<AnnouncementView, NotFound>>;
  /** To the audience, once. */
  send(id: string, by: By): Promise<Result<AnnouncementView, NotFound | AlreadySent>>;
  /** The announcements sent to the person, newest first. */
  sentTo(userId: string): Promise<readonly SentAnnouncement[]>;
}

export interface AnnouncementReader {
  readonly id: string;
  readonly push: boolean;
  readonly email: boolean;
}

/**
 * Who an announcement is for (3.5.1 and 3.5.4), as `receivesAnnouncement`
 * in the domain says it, asked of the database: accounts in good standing
 * (not suspended, not waiting to be deleted) with "Beta news" on, and of
 * those: everyone; who has published a trip; who has made a booking or a
 * request; or who has a trip or a booking on the corridor, both ends in
 * two different places of it, as the weekly figures count (`onCorridor`).
 */
export async function announcementReaders(
  q: Queryable,
  { audience, corridorId }: { readonly audience: string; readonly corridorId: string | null },
): Promise<readonly AnnouncementReader[]> {
  // Each meeting point with the corridor's places that cover it, as a search for the place does.
  const covered = sql`(
    select mp.id as point, p.id as place
    from meeting_points mp
    join places p on (
      cardinality(p.municipalities) > 0 and mp.municipality = any(p.municipalities)
    ) or (
      cardinality(p.municipalities) = 0 and st_dwithin(mp.location, p.location, p.match_radius_m)
    )
    where p.id in (select unnest(c.place_ids) from corridors c where c.id = ${corridorId}::uuid)
  )`;
  const between = (from: ReturnType<typeof sql>, to: ReturnType<typeof sql>) => sql`exists (
    select 1 from ${covered} a join ${covered} b on a.place <> b.place
    where a.point = ${from} and b.point = ${to}
  )`;
  const posted = sql`exists (
    select 1 from trips t where t.driver_id = u.id and t.status <> 'draft'
  )`;
  const booked = sql`exists (select 1 from bookings b where b.passenger_id = u.id)`;
  const end = (order: "asc" | "desc") => sql`(
    select s.meeting_point_id from trip_stops s
    where s.trip_id = t.id and s.removed_at is null
    order by s.position ${sql.raw(order)} limit 1
  )`;
  const onCorridor = sql`(
    exists (
      select 1 from trips t
      where t.driver_id = u.id and t.status <> 'draft' and ${between(end("asc"), end("desc"))}
    ) or exists (
      select 1 from bookings b
      join trip_stops fs on fs.id = b.from_stop_id
      join trip_stops ts on ts.id = b.to_stop_id
      where b.passenger_id = u.id
        and ${between(sql`fs.meeting_point_id`, sql`ts.meeting_point_id`)}
    )
  )`;
  const audiences: Record<AnnouncementAudience, ReturnType<typeof sql>> = {
    everyone: sql`true`,
    drivers: posted,
    passengers: booked,
    corridor: corridorId === null ? sql`false` : onCorridor,
  };
  const forThem = (audiences as Partial<Record<string, ReturnType<typeof sql>>>)[audience];
  if (forThem === undefined) return [];
  const found = await q.execute<{ id: string; push: boolean; email: boolean }>(sql`
    select u.id,
      exists (
        select 1 from push_tokens pt join sessions s on s.id = pt.session_id
        where pt.user_id = u.id and s.ended_at is null
      ) as push,
      (u.email is not null and u.email_verified_at is not null) as email
    from users u
    left join notification_preferences np on np.user_id = u.id
    where u.status = 'active' and u.delete_after is null
      and coalesce(np.beta_news, true) and ${forThem}
    order by u.id
  `);
  return found.rows;
}

const listLimit = 100;
const dayMs = 24 * 60 * 60 * 1000;

export function createAnnouncementService({
  db,
  clock,
}: {
  readonly db: Database;
  readonly clock: () => Date;
}): AnnouncementService {
  const delivered = (channel: "push" | "email") => sql<number>`(
    select count(*)::int from notification_deliveries d
    join notifications n on n.id = d.notification_id
    where n.announcement_id = ${announcements.id} and n.kind = 'announcement'
      and d.channel = ${channel} and d.status = 'sent'
  )`;

  const rows = (where?: ReturnType<typeof eq>) =>
    db
      .select({
        row: announcements,
        corridorName: corridors.name,
        push: delivered("push"),
        email: delivered("email"),
      })
      .from(announcements)
      .leftJoin(corridors, eq(corridors.id, announcements.corridorId))
      .where(where)
      .orderBy(desc(announcements.createdAt), desc(announcements.id))
      .limit(listLimit);

  const viewOf = (
    found: {
      readonly row: Stored;
      readonly corridorName: string | null;
      readonly push: number;
      readonly email: number;
    },
    now: Date,
  ): AnnouncementView => {
    const { row } = found;
    const logKept =
      row.sentAt !== null &&
      row.sentAt.getTime() > now.getTime() - notificationRetention.logDays * dayMs;
    return {
      id: row.id,
      audience: row.audience as AnnouncementAudience,
      corridor:
        row.corridorId === null ? null : { id: row.corridorId, name: found.corridorName ?? "" },
      titleIs: row.titleIs,
      titleEn: row.titleEn,
      messageIs: row.messageIs,
      messageEn: row.messageEn,
      createdAt: row.createdAt,
      testSentAt: row.testSentAt,
      sentAt: row.sentAt,
      reach: row.reach,
      delivered: logKept ? { push: found.push, email: found.email } : null,
    };
  };

  const one = async (id: string) => {
    const [found] = await rows(eq(announcements.id, id));
    return found === undefined ? undefined : viewOf(found, clock());
  };

  const corridorKnown = async (q: Queryable, corridorId: string | null) => {
    if (corridorId === null) return true;
    const [found] = await q
      .select({ id: corridors.id })
      .from(corridors)
      .where(eq(corridors.id, corridorId));
    return found !== undefined;
  };

  // The log keeps who it is for and that the texts changed, not the texts:
  // they stay with the announcement, which is never deleted.
  const audited = (row: Pick<Stored, "audience" | "corridorId">) => ({
    audience: row.audience,
    corridorId: row.corridorId,
  });

  return {
    async overview() {
      const now = clock();
      const [found, all] = await Promise.all([
        rows(),
        db
          .select({ id: corridors.id, name: corridors.name })
          .from(corridors)
          .where(eq(corridors.active, true))
          .orderBy(asc(corridors.name), asc(corridors.id)),
      ]);
      return { announcements: found.map((row) => viewOf(row, now)), corridors: all };
    },

    async create(draft, by) {
      const checked = checkAnnouncement(draft);
      if (!checked.ok) return checked;
      const now = clock();
      const id = await db.transaction(async (tx) => {
        if (!(await corridorKnown(tx, checked.value.corridorId))) return undefined;
        const [row] = await tx
          .insert(announcements)
          .values({
            ...checked.value,
            createdBy: by.operator.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (row === undefined) throw new Error("The announcement was not stored.");
        await recordAudit(tx, {
          ...by,
          action: "announcement.created",
          subjectType: "announcement",
          subjectId: row.id,
          after: audited(row),
        });
        return row.id;
      });
      if (id === undefined) return err({ code: "corridor_unknown" });
      const view = await one(id);
      if (view === undefined) throw new Error("The announcement was not stored.");
      return ok(view);
    },

    async update(id, draft, by) {
      const checked = checkAnnouncement(draft);
      if (!checked.ok) return checked;
      const now = clock();
      const outcome = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(announcements)
          .where(eq(announcements.id, id))
          .for("update");
        if (current === undefined) return "not_found" as const;
        if (current.sentAt !== null) return "already_sent" as const;
        if (!(await corridorKnown(tx, checked.value.corridorId))) {
          return "corridor_unknown" as const;
        }
        await tx
          .update(announcements)
          .set({ ...checked.value, updatedAt: now })
          .where(eq(announcements.id, id));
        await recordAudit(tx, {
          ...by,
          action: "announcement.changed",
          subjectType: "announcement",
          subjectId: id,
          before: audited(current),
          after: audited(checked.value),
        });
        return "done" as const;
      });
      if (outcome !== "done") return err({ code: outcome });
      const view = await one(id);
      return view === undefined ? err({ code: "not_found" }) : ok(view);
    },

    async reach(id) {
      const [row] = await db
        .select({ audience: announcements.audience, corridorId: announcements.corridorId })
        .from(announcements)
        .where(eq(announcements.id, id));
      if (row === undefined) return undefined;
      const readers = await announcementReaders(db, row);
      return {
        people: readers.length,
        push: readers.filter((reader) => reader.push).length,
        email: readers.filter((reader) => reader.email).length,
      };
    },

    async test(id, by) {
      const now = clock();
      const found = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(announcements)
          .set({ testSentAt: now, updatedAt: now })
          .where(eq(announcements.id, id))
          .returning({ id: announcements.id });
        if (row === undefined) return false;
        await recordAudit(tx, {
          ...by,
          action: "announcement.tested",
          subjectType: "announcement",
          subjectId: id,
        });
        await recordEvents(
          tx,
          [{ type: "AnnouncementTested", announcementId: id, operatorId: by.operator.userId }],
          now,
        );
        return true;
      });
      const view = found ? await one(id) : undefined;
      return view === undefined ? err({ code: "not_found" }) : ok(view);
    },

    async send(id, by) {
      const now = clock();
      const outcome = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(announcements)
          .where(eq(announcements.id, id))
          .for("update");
        if (current === undefined) return "not_found" as const;
        if (current.sentAt !== null) return "already_sent" as const;
        const readers = await announcementReaders(tx, current);
        await tx
          .update(announcements)
          .set({ sentAt: now, reach: readers.length, updatedAt: now })
          .where(eq(announcements.id, id));
        await recordAudit(tx, {
          ...by,
          action: "announcement.sent",
          subjectType: "announcement",
          subjectId: id,
          after: { ...audited(current), reach: readers.length },
        });
        await recordEvents(tx, [{ type: "AnnouncementSent", announcementId: id }], now);
        return "done" as const;
      });
      if (outcome !== "done") return err({ code: outcome });
      const view = await one(id);
      return view === undefined ? err({ code: "not_found" }) : ok(view);
    },

    async sentTo(userId) {
      const found = await db
        .select({
          id: announcements.id,
          titleIs: announcements.titleIs,
          titleEn: announcements.titleEn,
          messageIs: announcements.messageIs,
          messageEn: announcements.messageEn,
          sentAt: announcements.sentAt,
        })
        .from(notifications)
        .innerJoin(announcements, eq(announcements.id, notifications.announcementId))
        .where(and(eq(notifications.recipientId, userId), eq(notifications.kind, "announcement")))
        .orderBy(desc(announcements.sentAt), desc(announcements.id));
      return found.flatMap((row) => (row.sentAt === null ? [] : [{ ...row, sentAt: row.sentAt }]));
    },
  };
}
