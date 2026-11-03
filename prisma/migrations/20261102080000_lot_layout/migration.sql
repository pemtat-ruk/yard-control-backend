-- ผังลานจริง: แถวของช่อง/ทางรถ/ป้าย ต่อลาน และรอบที่กันช่องไว้ทุกวัน
ALTER TABLE "parking_lots" ADD COLUMN "layout" JSONB;
ALTER TABLE "parking_slots" ADD COLUMN "held_rounds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
