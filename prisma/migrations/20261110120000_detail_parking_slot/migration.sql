-- Data Dictionary พ.ย. 2569: BookingDetail.ParkingSlotID อ้าง ParkingSlot ตรง ๆ (ไม่มี ParkingLayoutSlot ในรายการตารางของ SA แล้ว)
-- ย้ายค่าจาก ParkingLayoutSlot ก่อน แล้วจึงลบคอลัมน์และตารางเดิม — คำสั่งที่อ้างคอลัมน์ใหม่ใช้ EXEC
-- เพราะ SQL Server ตรวจชื่อคอลัมน์ทั้ง batch ก่อนรัน (คอลัมน์ที่เพิ่งเพิ่มในไฟล์เดียวกันยังไม่มีตอนตรวจ)
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[BookingDetail] ADD [ParkingSlotID] BIGINT NULL;
ALTER TABLE [dbo].[BookingDetailHistory] ADD [ParkingSlotID] BIGINT NULL;

EXEC('UPDATE d SET d.[ParkingSlotID] = ls.[ParkingSlotID]
      FROM [dbo].[BookingDetail] d
      JOIN [dbo].[ParkingLayoutSlot] ls ON ls.[ParkingLayoutSlotID] = d.[ParkingLayoutSlotID]');
EXEC('UPDATE h SET h.[ParkingSlotID] = ls.[ParkingSlotID]
      FROM [dbo].[BookingDetailHistory] h
      JOIN [dbo].[ParkingLayoutSlot] ls ON ls.[ParkingLayoutSlotID] = h.[ParkingLayoutSlotID]');

EXEC('ALTER TABLE [dbo].[BookingDetail] ALTER COLUMN [ParkingSlotID] BIGINT NOT NULL');
EXEC('ALTER TABLE [dbo].[BookingDetailHistory] ALTER COLUMN [ParkingSlotID] BIGINT NOT NULL');

-- คอลัมน์และตารางเดิม
ALTER TABLE [dbo].[BookingDetail] DROP CONSTRAINT [BookingDetail_ParkingLayoutSlotID_fkey];
DROP INDEX [BookingDetail_ParkingLayoutSlotID_UsageDate_RoundID_idx] ON [dbo].[BookingDetail];
ALTER TABLE [dbo].[BookingDetail] DROP COLUMN [ParkingLayoutSlotID];
ALTER TABLE [dbo].[BookingDetailHistory] DROP COLUMN [ParkingLayoutSlotID];

ALTER TABLE [dbo].[ParkingLayoutSlot] DROP CONSTRAINT [ParkingLayoutSlot_ParkingLayoutID_fkey];
ALTER TABLE [dbo].[ParkingLayoutSlot] DROP CONSTRAINT [ParkingLayoutSlot_ParkingSlotID_fkey];
DROP TABLE [dbo].[ParkingLayoutSlot];

-- ดัชนีและ FK ใหม่
EXEC('CREATE NONCLUSTERED INDEX [BookingDetail_ParkingSlotID_UsageDate_RoundID_idx] ON [dbo].[BookingDetail]([ParkingSlotID], [UsageDate], [RoundID])');
EXEC('ALTER TABLE [dbo].[BookingDetail] ADD CONSTRAINT [BookingDetail_ParkingSlotID_fkey] FOREIGN KEY ([ParkingSlotID]) REFERENCES [dbo].[ParkingSlot]([ParkingSlotID]) ON DELETE NO ACTION ON UPDATE NO ACTION');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
