-- ล็อกบัญชีพนักงานชั่วคราวเมื่อใส่รหัสผ่านผิดติดกันหลายครั้ง
ALTER TABLE "users" ADD COLUMN "failed_logins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMPTZ(3);
