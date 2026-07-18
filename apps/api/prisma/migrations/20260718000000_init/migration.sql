-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'employee');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('pending', 'approved', 'inactive');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('published', 'started', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('booked', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('booked', 'started', 'in_progress', 'completed', 'payment_pending', 'payment_completed');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('recharge', 'trip_payment', 'trip_earning', 'refund');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'upi', 'wallet');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "SafetyEventKind" AS ENUM ('route_deviation', 'sos');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Ahmedabad',
    "registered_address" TEXT,
    "industry" TEXT,
    "admin_contact" TEXT,
    "fuel_cost_per_litre" DECIMAL(8,2) NOT NULL DEFAULT 96.50,
    "default_mileage_kmpl" DECIMAL(5,2) NOT NULL DEFAULT 18.0,
    "cost_per_km" DECIMAL(8,2) NOT NULL DEFAULT 8.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'employee',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "photo_url" TEXT,
    "department" TEXT,
    "manager" TEXT,
    "location" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "registration_no" TEXT NOT NULL,
    "seating_capacity" INTEGER NOT NULL,
    "mileage_kmpl" DECIMAL(5,2),
    "color" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "place_name" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "origin_label" TEXT NOT NULL,
    "dest_label" TEXT NOT NULL,
    "origin_pt" geography(Point, 4326) NOT NULL,
    "dest_pt" geography(Point, 4326) NOT NULL,
    "route_geom" geography(LineString, 4326),
    "route_distance_m" INTEGER,
    "route_duration_s" INTEGER,
    "departure_at" TIMESTAMP(3) NOT NULL,
    "seats_total" INTEGER NOT NULL,
    "seats_available" INTEGER NOT NULL,
    "fare_per_seat" DECIMAL(8,2) NOT NULL,
    "recurrence_rule" TEXT,
    "status" "RideStatus" NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "pickup_label" TEXT NOT NULL,
    "drop_label" TEXT NOT NULL,
    "pickup_pt" geography(Point, 4326) NOT NULL,
    "drop_pt" geography(Point, 4326) NOT NULL,
    "fare_total" DECIMAL(8,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'booked',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'booked',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_locations" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "pt" geography(Point, 4326) NOT NULL,
    "speed" DECIMAL(6,2),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" "LedgerType" NOT NULL,
    "trip_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(8,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "gateway_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_events" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "kind" "SafetyEventKind" NOT NULL,
    "pt" geography(Point, 4326),
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_org_id_email_key" ON "users"("org_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registration_no_key" ON "vehicles"("registration_no");

-- CreateIndex
CREATE INDEX "vehicles_org_id_idx" ON "vehicles"("org_id");

-- CreateIndex
CREATE INDEX "vehicles_owner_id_idx" ON "vehicles"("owner_id");

-- CreateIndex
CREATE INDEX "saved_places_user_id_idx" ON "saved_places"("user_id");

-- CreateIndex
CREATE INDEX "rides_org_id_departure_at_idx" ON "rides"("org_id", "departure_at");

-- CreateIndex
CREATE INDEX "rides_driver_id_idx" ON "rides"("driver_id");

-- CreateIndex
CREATE INDEX "bookings_passenger_id_idx" ON "bookings"("passenger_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_ride_id_passenger_id_key" ON "bookings"("ride_id", "passenger_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_ride_id_key" ON "trips"("ride_id");

-- CreateIndex
CREATE INDEX "trip_locations_trip_id_recorded_at_idx" ON "trip_locations"("trip_id", "recorded_at");

-- CreateIndex
CREATE INDEX "messages_trip_id_created_at_idx" ON "messages"("trip_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "safety_events_trip_id_idx" ON "safety_events"("trip_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_locations" ADD CONSTRAINT "trip_locations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

