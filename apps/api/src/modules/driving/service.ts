import type { DriverReadiness, Vehicle } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  driverReadiness,
  err,
  ok,
  validateVehicle,
  type Result,
  type VehicleError,
  type VehicleInput,
} from "@shareride/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { AccountService } from "../account/index.ts";

const { users, vehicles } = schema;

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
   * Deletes the car with its plate: no trip uses a car yet. With trips (PR 5),
   * a car that trips used is kept for them, and one on a future trip stays.
   */
  removeVehicle(userId: string, vehicleId: string): Promise<boolean>;
}

export function createDrivingService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly account: AccountService;
}): DrivingService {
  const { db, clock, account } = dependencies;
  const mine = (userId: string, vehicleId: string) =>
    and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, userId));

  async function listVehicles(userId: string): Promise<Vehicle[]> {
    const rows = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.ownerId, userId))
      .orderBy(asc(vehicles.createdAt), asc(vehicles.id));
    return rows.map(toVehicle);
  }

  async function readiness(userId: string): Promise<DriverReadiness> {
    const [me, cars, [user]] = await Promise.all([
      account.me(userId),
      listVehicles(userId),
      db
        .select({ licenceDeclaredAt: users.licenceDeclaredAt })
        .from(users)
        .where(eq(users.id, userId)),
    ]);
    const licenceDeclaredAt = user?.licenceDeclaredAt ?? null;
    const { ready, items } = driverReadiness({
      accountComplete: me.missingSteps.length === 0,
      // Photo upload comes with milestone 2, PR 7.
      hasPhoto: false,
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
      const removed = await db
        .delete(vehicles)
        .where(mine(userId, vehicleId))
        .returning({ id: vehicles.id });
      return removed.length > 0;
    },
  };
}
