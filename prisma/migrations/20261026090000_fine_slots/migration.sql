-- ค่าปรับหนึ่งใบมีได้หลายช่องของการจองเดียวกัน (Screen Design หน้า 16)

-- CreateTable
CREATE TABLE "fine_slots" (
    "fine_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,

    CONSTRAINT "fine_slots_pkey" PRIMARY KEY ("fine_id","slot_id")
);

-- CreateIndex
CREATE INDEX "fine_slots_slot_id_idx" ON "fine_slots"("slot_id");

-- AddForeignKey
ALTER TABLE "fine_slots" ADD CONSTRAINT "fine_slots_fine_id_fkey" FOREIGN KEY ("fine_id") REFERENCES "fines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_slots" ADD CONSTRAINT "fine_slots_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "parking_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ย้ายช่องของค่าปรับเดิม (ใบละหนึ่งช่อง) เข้าตารางใหม่ก่อนลบคอลัมน์
INSERT INTO "fine_slots" ("fine_id", "slot_id")
SELECT "id", "slot_id" FROM "fines" WHERE "slot_id" IS NOT NULL;

-- AlterTable
ALTER TABLE "fines" DROP CONSTRAINT "fines_slot_id_fkey";
ALTER TABLE "fines" DROP COLUMN "slot_id",
ADD COLUMN     "booking_id" INTEGER;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
