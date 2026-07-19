import type { VehicleCreateInput, Vehicle } from '@syncroute/shared';
import { prisma } from '../db.js';
import { forbidden, notFound, conflict } from '../lib/errors.js';

type VehicleRow = {
  id: string;
  ownerId: string;
  model: string;
  registrationNo: string;
  seatingCapacity: number;
  mileageKmpl: unknown;
  color: string | null;
  status: 'pending' | 'approved' | 'inactive';
  owner?: { name: string };
};

function toVehicle(v: VehicleRow): Vehicle {
  return {
    id: v.id,
    ownerId: v.ownerId,
    ownerName: v.owner?.name,
    model: v.model,
    registrationNo: v.registrationNo,
    seatingCapacity: v.seatingCapacity,
    mileageKmpl: v.mileageKmpl === null ? null : Number(v.mileageKmpl),
    color: v.color,
    status: v.status,
  };
}

/** My Vehicle screen — a user sees only their own vehicles. */
export async function listMine(userId: string): Promise<Vehicle[]> {
  const rows = await prisma.vehicle.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toVehicle);
}

/** Admin Vehicles tab — every vehicle in the org, with owner names. */
export async function listForOrg(orgId: string): Promise<Vehicle[]> {
  const rows = await prisma.vehicle.findMany({
    where: { orgId },
    include: { owner: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toVehicle);
}

export async function create(
  userId: string,
  orgId: string,
  input: VehicleCreateInput,
): Promise<Vehicle> {
  const existing = await prisma.vehicle.findUnique({
    where: { registrationNo: input.registrationNo },
  });
  // Registration numbers are globally unique — the same car cannot be
  // registered by two people, in this org or any other.
  if (existing) throw conflict('That registration number is already registered');

  const vehicle = await prisma.vehicle.create({
    data: {
      orgId,
      ownerId: userId,
      model: input.model,
      registrationNo: input.registrationNo,
      seatingCapacity: input.seatingCapacity,
      mileageKmpl: input.mileageKmpl ?? null,
      color: input.color ?? null,
      // Employees never self-approve; the admin does it from the Vehicles tab.
      status: 'pending',
    },
  });
  return toVehicle(vehicle);
}

export async function update(
  vehicleId: string,
  userId: string,
  input: Partial<VehicleCreateInput>,
): Promise<Vehicle> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throw notFound('Vehicle not found');
  if (vehicle.ownerId !== userId) throw forbidden('You can only edit your own vehicles');

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      ...input,
      // Editing a vehicle's identifying details voids its approval — otherwise
      // a user could get a 2-seater approved and then edit it to seat 8.
      ...(input.registrationNo || input.seatingCapacity || input.model
        ? { status: 'pending' as const }
        : {}),
    },
  });
  return toVehicle(updated);
}

export async function remove(vehicleId: string, userId: string): Promise<{ deleted: boolean }> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { _count: { select: { rides: true } } },
  });
  if (!vehicle) throw notFound('Vehicle not found');
  if (vehicle.ownerId !== userId) throw forbidden('You can only remove your own vehicles');
  // Already deactivated: there is nothing left for "Remove" to do, and
  // silently re-issuing the same update reads to the caller as a no-op.
  if (vehicle.status === 'inactive') {
    throw conflict('This vehicle is already inactive');
  }

  // A vehicle attached to rides is part of trip history and cost reports;
  // deactivate instead so those records keep resolving. The caller needs to
  // know which happened — "removed" and "deactivated" read very differently.
  if (vehicle._count.rides > 0) {
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: 'inactive' } });
    return { deleted: false };
  }
  await prisma.vehicle.delete({ where: { id: vehicleId } });
  return { deleted: true };
}

/** Admin-only approve / deactivate. */
export async function setStatus(
  vehicleId: string,
  orgId: string,
  status: 'pending' | 'approved' | 'inactive',
): Promise<Vehicle> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { owner: { select: { name: true } } },
  });
  if (!vehicle) throw notFound('Vehicle not found');
  // Org check is explicit: an admin of one company must not touch another's.
  if (vehicle.orgId !== orgId) throw notFound('Vehicle not found');

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { status },
    include: { owner: { select: { name: true } } },
  });
  return toVehicle(updated);
}
