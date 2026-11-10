-- ค่าปรับ 1 ใบต่อ 1 ช่อง (Data Dictionary — SA ยืนยัน 10 พ.ย. 2569): Fine.BookingDetailID แทนตาราง FineSlot ของเรา
-- ใบเดิมทุกใบมีช่องเดียว: ผูกกับรายการจองของช่องนั้นในรอบสุดท้ายที่ใช้ก่อนวันที่ออกค่าปรับ
-- คำสั่งที่อ้างคอลัมน์ใหม่ใช้ EXEC เพราะ SQL Server ตรวจชื่อคอลัมน์ทั้ง batch ก่อนรัน
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Fine] ADD [BookingDetailID] BIGINT NULL,
    [EndDateTime] DATETIME NULL,
    [OvertimeMinute] INT NULL;

EXEC('UPDATE f SET f.[BookingDetailID] = (
        SELECT TOP 1 d.[BookingDetailID]
        FROM [dbo].[FineSlot] fs
        JOIN [dbo].[BookingDetail] d ON d.[ParkingSlotID] = fs.[ParkingSlotID] AND d.[BookingNo] = f.[BookingNo]
        JOIN [dbo].[BookingRound] r ON r.[RoundID] = d.[RoundID]
        WHERE fs.[FineID] = f.[ID]
        ORDER BY CASE WHEN d.[UsageDate] <= CAST(f.[CreatedDate] AS DATE) THEN 0 ELSE 1 END,
                 d.[UsageDate] DESC, r.[RoundSequence] DESC)
      FROM [dbo].[Fine] f');

EXEC('ALTER TABLE [dbo].[Fine] ALTER COLUMN [BookingDetailID] BIGINT NOT NULL');
EXEC('CREATE NONCLUSTERED INDEX [Fine_BookingDetailID_idx] ON [dbo].[Fine]([BookingDetailID])');
EXEC('ALTER TABLE [dbo].[Fine] ADD CONSTRAINT [Fine_BookingDetailID_fkey] FOREIGN KEY ([BookingDetailID]) REFERENCES [dbo].[BookingDetail]([BookingDetailID]) ON DELETE NO ACTION ON UPDATE NO ACTION');

ALTER TABLE [dbo].[FineSlot] DROP CONSTRAINT [FineSlot_FineID_fkey];
ALTER TABLE [dbo].[FineSlot] DROP CONSTRAINT [FineSlot_ParkingSlotID_fkey];
DROP TABLE [dbo].[FineSlot];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
