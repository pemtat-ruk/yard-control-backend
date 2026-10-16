-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('EMPLOYEE', 'GREEN_SHIRT', 'BUYER');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('CUSTOMER_SERVICE', 'IT', 'YARD_MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('BOOKING_CREATE_SELF', 'BOOKING_CREATE_ON_BEHALF', 'BOOKING_IMPORT_LONG_TERM', 'LAYOUT_TOGGLE', 'LAYOUT_EDIT', 'PRICING_MANAGE', 'SLOT_INSPECT', 'REPORT_VIEW', 'SETTINGS_MANAGE');

-- CreateEnum
CREATE TYPE "SlotBaseStatus" AS ENUM ('OPEN', 'RESERVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('SHORT', 'LONG');

-- CreateEnum
CREATE TYPE "PaymentPlan" AS ENUM ('FULL', 'DAILY');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('SELF', 'CUSTOMER_SERVICE', 'IMPORT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('BOOKING', 'FINE');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('VACATED', 'STILL_PARKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PARKING_EXPIRING', 'PARKING_OVERTIME', 'PAYMENT_DUE', 'BOOKING_CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "type" "UserType" NOT NULL,
    "department" "Department",
    "employee_code" VARCHAR(50),
    "password_hash" VARCHAR(512),
    "phone" VARCHAR(20),
    "labor_card_no" VARCHAR(50),
    "crm_id" VARCHAR(100),
    "full_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" INTEGER NOT NULL,
    "permission" "Permission" NOT NULL,
    "granted_by_id" INTEGER,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission")
);

-- CreateTable
CREATE TABLE "parking_lots" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_slots" (
    "id" SERIAL NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "base_status" "SlotBaseStatus" NOT NULL DEFAULT 'OPEN',
    "grid_row" INTEGER NOT NULL DEFAULT 0,
    "grid_col" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_status_logs" (
    "id" SERIAL NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "from_status" "SlotBaseStatus" NOT NULL,
    "to_status" "SlotBaseStatus" NOT NULL,
    "changed_by_id" INTEGER NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_configs" (
    "id" SERIAL NOT NULL,
    "lot_id" INTEGER,
    "price_per_slot_round" DECIMAL(12,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "permit_ref" VARCHAR(100) NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" SERIAL NOT NULL,
    "booking_no" VARCHAR(30) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "source" "BookingSource" NOT NULL DEFAULT 'SELF',
    "type" "BookingType" NOT NULL,
    "payment_plan" "PaymentPlan" NOT NULL DEFAULT 'FULL',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_round" INTEGER NOT NULL,
    "round_count" INTEGER NOT NULL,
    "price_per_slot_round" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_slots" (
    "booking_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,

    CONSTRAINT "booking_slots_pkey" PRIMARY KEY ("booking_id","slot_id")
);

-- CreateTable
CREATE TABLE "booking_days" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "service_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "payment_id" INTEGER,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "booking_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_occupancies" (
    "id" SERIAL NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "service_date" DATE NOT NULL,
    "round_index" INTEGER NOT NULL,
    "booking_id" INTEGER NOT NULL,

    CONSTRAINT "slot_occupancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "transaction_no" VARCHAR(50) NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL DEFAULT 'BOOKING',
    "booking_id" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "qr_payload" TEXT,
    "gateway_ref" VARCHAR(100),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" SERIAL NOT NULL,
    "receipt_no" VARCHAR(30) NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" SERIAL NOT NULL,
    "ticket_no" VARCHAR(30) NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "service_date" DATE NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fines" (
    "id" SERIAL NOT NULL,
    "fine_no" VARCHAR(30) NOT NULL,
    "customer_id" INTEGER,
    "slot_id" INTEGER,
    "issued_by_id" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_inspections" (
    "id" SERIAL NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "service_date" DATE NOT NULL,
    "result" "InspectionResult" NOT NULL,
    "inspector_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "dedupe_key" VARCHAR(150),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by_id" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_labor_card_no_key" ON "users"("labor_card_no");

-- CreateIndex
CREATE UNIQUE INDEX "users_crm_id_key" ON "users"("crm_id");

-- CreateIndex
CREATE UNIQUE INDEX "parking_lots_code_key" ON "parking_lots"("code");

-- CreateIndex
CREATE UNIQUE INDEX "parking_slots_lot_id_code_key" ON "parking_slots"("lot_id", "code");

-- CreateIndex
CREATE INDEX "slot_status_logs_slot_id_created_at_idx" ON "slot_status_logs"("slot_id", "created_at");

-- CreateIndex
CREATE INDEX "rate_configs_lot_id_effective_from_idx" ON "rate_configs"("lot_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_no_key" ON "bookings"("booking_no");

-- CreateIndex
CREATE INDEX "bookings_customer_id_status_idx" ON "bookings"("customer_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_start_date_idx" ON "bookings"("status", "start_date");

-- CreateIndex
CREATE INDEX "booking_days_due_at_paid_at_idx" ON "booking_days"("due_at", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_days_booking_id_service_date_key" ON "booking_days"("booking_id", "service_date");

-- CreateIndex
CREATE INDEX "slot_occupancies_booking_id_idx" ON "slot_occupancies"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "slot_occupancies_slot_id_service_date_round_index_key" ON "slot_occupancies"("slot_id", "service_date", "round_index");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_no_key" ON "payments"("transaction_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_ref_key" ON "payments"("gateway_ref");

-- CreateIndex
CREATE INDEX "payments_status_expires_at_idx" ON "payments"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_no_key" ON "receipts"("receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_no_key" ON "tickets"("ticket_no");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_booking_id_service_date_key" ON "tickets"("booking_id", "service_date");

-- CreateIndex
CREATE UNIQUE INDEX "fines_fine_no_key" ON "fines"("fine_no");

-- CreateIndex
CREATE UNIQUE INDEX "fines_payment_id_key" ON "fines"("payment_id");

-- CreateIndex
CREATE INDEX "slot_inspections_slot_id_service_date_idx" ON "slot_inspections"("slot_id", "service_date");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_slots" ADD CONSTRAINT "parking_slots_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "parking_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_status_logs" ADD CONSTRAINT "slot_status_logs_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "parking_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "parking_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_days" ADD CONSTRAINT "booking_days_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_days" ADD CONSTRAINT "booking_days_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_occupancies" ADD CONSTRAINT "slot_occupancies_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "parking_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_occupancies" ADD CONSTRAINT "slot_occupancies_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "parking_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_inspections" ADD CONSTRAINT "slot_inspections_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "parking_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_inspections" ADD CONSTRAINT "slot_inspections_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
