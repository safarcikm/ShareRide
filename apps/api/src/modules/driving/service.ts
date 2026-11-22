import type { DriverReadiness, Vehicle } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  driverReadiness,
  photoShown,
  err,
  ok,
  validateVehicle,
  type Result,
  type VehicleError,
  type VehicleInput,
} from "@shareride/domain";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { PhotoStorage } from "../../platform/photo-storage.ts";
import type { AccountService } from "../account/index.ts";

const { trips, users, vehicles } = schema;

type VehicleRow = typeof vehicles.$inferSelect;

const toVehicle = (row: VehicleRow): Vehicle => ({
  id: row.id,
  make: row.make,
  model: row.model,
  colour: row.colour as Vehicle["colour"],
  registration: row.registration,
});

export interface NotFound {
  readonly code: "not_found";
}

/** A driver's cars and what they still need before publishing (spec 3, 3.1 to 3.3). */
export interface DrivingService {
  readiness(userId: string): Promise<DriverReadiness>;
  /** Stores the date of the first declaration only (spec 3, 3.3). */
  declareLicence(userId: string): Promise<DriverReadiness>;
  vehicles(userId: string): Promise<Vehicle[]>;
  addVehicle(userId: string, input: VehicleInput): Promise<Result<Vehicle, VehicleError>>;
  updateVehicle(
    userId: string,
    vehicleId: string,
    input: VehicleInput,
  ): Promise<Result<Vehicle, VehicleError | NotFound>>;
  /**
   * Takes the car off my drafts and deletes it with its plate, or keeps it
   * (`removed_at`) for the published trips that used it. A car on a trip
   * that has not ended stays (spec 3, 3.2).
   */
  removeVehicle(userId: string, vehicleId: string): Promise<"removed" | "not_found" | "in_use">;
}

export function createDrivingService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly account: AccountService;
  /** Photo storage: while there is some, a driver needs a photo to publish (spec 1, 3.5). */
  readonly photos?: PhotoStorage;
}): DrivingService {
  const { db, clock, account } = dependencies;
  /** One of my cars that I have not removed. */
  const mine = (userId: string, vehicleId: string) =>
    and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, userId), isNull(vehicles.removedAt));

  async function listVehicles(userId: string): Promise<Vehicle[]> {
    const rows = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.ownerId, userId), isNull(vehicles.removedAt)))
      .orderBy(asc(vehicles.createdAt), asc(vehicles.id));
    return rows.map(toVehicle);
  }

  async function readiness(userId: string): Promise<DriverReadiness> {
    const [me, cars, [user]] = await Promise.all([
      account.me(userId),
      listVehicles(userId),
      db
        .select({
          licenceDeclaredAt: users.licenceDeclaredAt,
          photoKey: users.photoKey,
          photoHiddenAt: users.photoHiddenAt,
        })
        .from(users)
        .where(eq(users.id, userId)),
    ]);
    const licenceDeclaredAt = user?.licenceDeclaredAt ?? null;
    const { ready, items } = driverReadiness({
      accountComplete: me.missingSteps.length === 0,
      hasPhoto: user === undefined ? false : photoShown(user),
      // A server without photo storage takes none, so it cannot ask for one.
      photosOn: dependencies.photos !== undefined,
      hasCar: cars.length > 0,
      licenceDeclared: licenceDeclaredAt !== null,
    });
    return {
      ready,
      items: [...items],
      licenceDeclaredAt: licenceDeclaredAt?.toISOString() ?? null,
    };
  }

  return {
    readiness,

    async declareLicence(userId) {
      await db
        .update(users)
        .set({ licenceDeclaredAt: clock() })
        .where(and(eq(users.id, userId), isNull(users.licenceDeclaredAt)));
      return readiness(userId);
    },

    vehicles: listVehicles,

    async addVehicle(userId, input) {
      const valid = validateVehicle(input);
      if (!valid.ok) return valid;
      const [row] = await db
        .insert(vehicles)
        .values({ ...valid.value, ownerId: userId })
        .returning();
      if (row === undefined) throw new Error("The car was not stored.");
      return ok(toVehicle(row));
    },

    async updateVehicle(userId, vehicleId, input) {
      const valid = validateVehicle(input);
      if (!valid.ok) return valid;
      const [row] = await db
        .update(vehicles)
        .set(valid.value)
        .where(mine(userId, vehicleId))
        .returning();
      return row === undefined ? err({ code: "not_found" }) : ok(toVehicle(row));
    },

    async removeVehicle(userId, vehicleId) {
      return db.transaction(async (tx) => {
        // The lock publishing takes first, so a trip cannot be published
        // with this car while it is being removed.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        const [car] = await tx
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(mine(userId, vehicleId))
          .for("update");
        if (car === undefined) return "not_found";
        const used = await tx
          .select({ status: trips.status, arrivesAt: trips.arrivesAt })
          .from(trips)
          .where(and(eq(trips.vehicleId, vehicleId), ne(trips.status, "draft")));
        const now = clock();
        const ongoing = (trip: (typeof used)[number]) =>
          (trip.status === "published" || trip.status === "departed") &&
          (trip.arrivesAt === null || trip.arrivesAt > now);
        if (used.some(ongoing)) return "in_use";
        await tx
          .update(trips)
          .set({ vehicleId: null })
          .where(and(eq(trips.vehicleId, vehicleId), eq(trips.status, "draft")));
        if (used.length > 0) {
          await tx.update(vehicles).set({ removedAt: now }).where(eq(vehicles.id, vehicleId));
        } else {
          await tx.delete(vehicles).where(eq(vehicles.id, vehicleId));
        }
        return "removed";
      });
    },
  };
}
