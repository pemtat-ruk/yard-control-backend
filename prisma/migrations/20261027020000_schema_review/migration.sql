-- ปรับตามผลตรวจฐานข้อมูล (27 ต.ค. 2569)
-- 1) ใบเสร็จเก็บภาษี ณ วันที่ออก  2) foreign key ของผู้ทำรายการ  3) index บน FK ที่ค้นบ่อย
-- 4) เวลาเป็น timestamptz  5) เหตุยกเลิกเป็น enum  6) ลบค่า/คอลัมน์ที่ไม่ได้ใช้  7) CHECK กันข้อมูลผิด

-- CreateEnum
CREATE TYPE "BookingCancelReason" AS ENUM ('PAYMENT_EXPIRED', 'DAILY_PAYMENT_OVERDUE');

-- เหตุยกเลิกเดิมเป็นข้อความ แปลงชนิดโดยไม่ลบข้อมูล (มีแค่ 2 ค่าที่ตรงกับ enum)
ALTER TABLE "bookings"
  ALTER COLUMN "cancel_reason" SET DATA TYPE "BookingCancelReason" USING "cancel_reason"::"BookingCancelReason";

-- PaymentStatus.FAILED ไม่มีโค้ดใช้และไม่มีข้อมูล
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'PAID', 'EXPIRED');
ALTER TABLE "public"."payments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- ตำแหน่ง grid บนผังไม่มีโค้ดอ่าน (ผังเรียงตามรหัสช่อง)
ALTER TABLE "parking_slots" DROP COLUMN "grid_col", DROP COLUMN "grid_row";

-- ภาษีของใบเสร็จ: เพิ่มเป็น nullable → เติมย้อนหลังด้วยอัตรา 7% (ราคารวมภาษี) → บังคับ NOT NULL
ALTER TABLE "receipts"
  ADD COLUMN "vat_rate_percent" DECIMAL(5,2),
  ADD COLUMN "amount_before_vat" DECIMAL(12,2),
  ADD COLUMN "vat_amount" DECIMAL(12,2);
UPDATE "receipts" r
SET "vat_rate_percent" = 7,
    "vat_amount" = ROUND(p."amount" * 7 / 107, 2),
    "amount_before_vat" = p."amount" - ROUND(p."amount" * 7 / 107, 2)
FROM "payments" p
WHERE p."id" = r."payment_id";
ALTER TABLE "receipts"
  ALTER COLUMN "vat_rate_percent" SET NOT NULL,
  ALTER COLUMN "amount_before_vat" SET NOT NULL,
  ALTER COLUMN "vat_amount" SET NOT NULL;

-- เวลาเดิมเก็บเป็น UTC (Prisma) จึงตีความเป็น UTC ตอนแปลง
ALTER TABLE "audit_logs"
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "booking_days"
  ALTER COLUMN "due_at" SET DATA TYPE TIMESTAMPTZ(3) USING "due_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "paid_at" SET DATA TYPE TIMESTAMPTZ(3) USING "paid_at" AT TIME ZONE 'UTC';
ALTER TABLE "bookings"
  ALTER COLUMN "cancelled_at" SET DATA TYPE TIMESTAMPTZ(3) USING "cancelled_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "fines"
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "notifications"
  ALTER COLUMN "read_at" SET DATA TYPE TIMESTAMPTZ(3) USING "read_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "parking_lots"
  ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ(3) USING "deleted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "parking_slots"
  ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ(3) USING "deleted_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "payments"
  ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "paid_at" SET DATA TYPE TIMESTAMPTZ(3) USING "paid_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "rate_configs"
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "receipts"
  ALTER COLUMN "issued_at" SET DATA TYPE TIMESTAMPTZ(3) USING "issued_at" AT TIME ZONE 'UTC';
ALTER TABLE "round_configs"
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "slot_inspections"
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "slot_status_logs"
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "system_settings"
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "tickets"
  ALTER COLUMN "issued_at" SET DATA TYPE TIMESTAMPTZ(3) USING "issued_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_permissions"
  ALTER COLUMN "granted_at" SET DATA TYPE TIMESTAMPTZ(3) USING "granted_at" AT TIME ZONE 'UTC';
ALTER TABLE "users"
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

-- CreateIndex
CREATE INDEX "booking_days_payment_id_idx" ON "booking_days"("payment_id");

-- CreateIndex
CREATE INDEX "booking_slots_slot_id_idx" ON "booking_slots"("slot_id");

-- CreateIndex
CREATE INDEX "fines_customer_id_idx" ON "fines"("customer_id");

-- CreateIndex
CREATE INDEX "fines_booking_id_idx" ON "fines"("booking_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_status_logs" ADD CONSTRAINT "slot_status_logs_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_configs" ADD CONSTRAINT "round_configs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_configs" ADD CONSTRAINT "rate_configs_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "parking_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_configs" ADD CONSTRAINT "rate_configs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_inspections" ADD CONSTRAINT "slot_inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK: กันข้อมูลผิดที่ระดับฐานข้อมูล (backend ตรวจอยู่แล้ว นี่คือชั้นสุดท้าย)
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_amounts_check" CHECK ("total_amount" >= 0 AND "price_per_slot_round" >= 0),
  ADD CONSTRAINT "bookings_dates_check" CHECK ("start_date" <= "end_date"),
  ADD CONSTRAINT "bookings_rounds_check" CHECK ("start_round" >= 0 AND "round_count" >= 1);
ALTER TABLE "booking_days" ADD CONSTRAINT "booking_days_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "fines" ADD CONSTRAINT "fines_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "rate_configs" ADD CONSTRAINT "rate_configs_price_check" CHECK ("price_per_slot_round" >= 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_vat_check"
  CHECK ("vat_rate_percent" >= 0 AND "vat_amount" >= 0 AND "amount_before_vat" >= 0);
ALTER TABLE "round_configs" ADD CONSTRAINT "round_configs_hours_check"
  CHECK ("first_hour" BETWEEN 0 AND 23 AND "round_hours" > 0 AND 24 % "round_hours" = 0);
ALTER TABLE "slot_occupancies" ADD CONSTRAINT "slot_occupancies_round_check" CHECK ("round_index" >= 0);
