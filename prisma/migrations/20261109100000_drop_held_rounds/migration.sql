-- โลจิสติกส์เป็นสถานที่ข้างลาน ไม่ใช่ช่องที่ต้องกันรอบ — เลิกใช้ HeldRounds
ALTER TABLE [dbo].[ParkingSlotExtra] DROP CONSTRAINT [ParkingSlotExtra_HeldRounds_json];
ALTER TABLE [dbo].[ParkingSlotExtra] DROP CONSTRAINT [ParkingSlotExtra_HeldRounds_df];
ALTER TABLE [dbo].[ParkingSlotExtra] DROP COLUMN [HeldRounds];
