-- Data Dictionary พ.ย. 2569: ปิด/สงวนสิทธิ์ช่องจอดย้ายไปตาราง ParkingSlotControl ของ SA (แทน ParkingSlotExtra ของเรา)
-- ParkingSlot.Is_Active = 0 ใช้หมายถึงช่องที่ถูกลบแล้ว — ย้ายข้อมูลก่อนลบตารางเดิม
-- และลบกลุ่มสิทธิ์ Manager ที่ไม่มีใน Master data แล้ว (เฉพาะเมื่อไม่มีพนักงานอยู่ในกลุ่มนี้)
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ParkingSlotControl] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [ParkingSlotID] BIGINT NOT NULL,
    [SlotStatusCode] NVARCHAR(500) NOT NULL,
    [StartDateTime] DATETIME NOT NULL,
    [EndDateTime] DATETIME,
    [RoundID] BIGINT,
    [Reason] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [ParkingSlotControl_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [ParkingSlotControl_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ParkingSlotControl_pkey] PRIMARY KEY CLUSTERED ([ID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ParkingSlotControl_ParkingSlotID_Is_Active_idx] ON [dbo].[ParkingSlotControl]([ParkingSlotID], [Is_Active]);

-- AddForeignKey
ALTER TABLE [dbo].[ParkingSlotControl] ADD CONSTRAINT [ParkingSlotControl_ParkingSlotID_fkey] FOREIGN KEY ([ParkingSlotID]) REFERENCES [dbo].[ParkingSlot]([ParkingSlotID]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ParkingSlotControl] ADD CONSTRAINT [ParkingSlotControl_SlotStatusCode_fkey] FOREIGN KEY ([SlotStatusCode]) REFERENCES [dbo].[ParkingSlotStatus]([StatusCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ParkingSlotControl] ADD CONSTRAINT [ParkingSlotControl_RoundID_fkey] FOREIGN KEY ([RoundID]) REFERENCES [dbo].[BookingRound]([RoundID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- สถานะที่อ้างถึงต้องมีก่อน (ฐานข้อมูลที่ seed แล้วมีอยู่แล้ว; ค่าตาม Master data)
IF NOT EXISTS (SELECT 1 FROM [dbo].[ParkingSlotStatus] WHERE [StatusCode] = 'CLOSED')
    INSERT INTO [dbo].[ParkingSlotStatus] ([StatusCode], [StatusName_TH], [StatusName_EN], [Description], [Color_Th], [Color_En], [HtmlColorCode])
    VALUES ('CLOSED', N'ปิดใช้งาน', 'CLOSED', N'ช่องจอดปิดใช้งาน (Closed)', N'ดำ', 'Black', '#000000');
IF NOT EXISTS (SELECT 1 FROM [dbo].[ParkingSlotStatus] WHERE [StatusCode] = 'RESERVED')
    INSERT INTO [dbo].[ParkingSlotStatus] ([StatusCode], [StatusName_TH], [StatusName_EN], [Description], [Color_Th], [Color_En], [HtmlColorCode])
    VALUES ('RESERVED', N'สงวนสิทธิ์', 'RESERVED', N'ช่องจอดที่จัดสรร/สงวนสิทธิ์ (Reserved)', N'ฟ้า', 'Sky Blue', '#87CEEB');

-- ช่องสงวนสิทธิ์เดิม (ที่ยังไม่ลบและไม่ได้ปิด)
INSERT INTO [dbo].[ParkingSlotControl] ([ParkingSlotID], [SlotStatusCode], [StartDateTime], [CreatedBy])
SELECT s.[ParkingSlotID], 'RESERVED', CURRENT_TIMESTAMP, 'migration'
FROM [dbo].[ParkingSlot] s
JOIN [dbo].[ParkingSlotExtra] e ON e.[ParkingSlotID] = s.[ParkingSlotID]
WHERE e.[Reserved] = 1 AND e.[DeletedAt] IS NULL AND s.[Is_Active] = 1;

-- ช่องปิดเดิม (Is_Active = 0 ที่ไม่ได้ลบ) → ควบคุมสถานะ CLOSED แล้วคืน Is_Active = 1
INSERT INTO [dbo].[ParkingSlotControl] ([ParkingSlotID], [SlotStatusCode], [StartDateTime], [CreatedBy])
SELECT s.[ParkingSlotID], 'CLOSED', CURRENT_TIMESTAMP, 'migration'
FROM [dbo].[ParkingSlot] s
LEFT JOIN [dbo].[ParkingSlotExtra] e ON e.[ParkingSlotID] = s.[ParkingSlotID]
WHERE s.[Is_Active] = 0 AND e.[DeletedAt] IS NULL;

UPDATE s SET s.[Is_Active] = 1
FROM [dbo].[ParkingSlot] s
LEFT JOIN [dbo].[ParkingSlotExtra] e ON e.[ParkingSlotID] = s.[ParkingSlotID]
WHERE s.[Is_Active] = 0 AND e.[DeletedAt] IS NULL;

-- ช่องที่ลบแล้ว → Is_Active = 0
UPDATE s SET s.[Is_Active] = 0
FROM [dbo].[ParkingSlot] s
JOIN [dbo].[ParkingSlotExtra] e ON e.[ParkingSlotID] = s.[ParkingSlotID]
WHERE e.[DeletedAt] IS NOT NULL;

-- DropForeignKey / DropTable
ALTER TABLE [dbo].[ParkingSlotExtra] DROP CONSTRAINT [ParkingSlotExtra_ParkingSlotID_fkey];
DROP TABLE [dbo].[ParkingSlotExtra];

-- กลุ่มสิทธิ์ Manager (ไม่อยู่ใน Master data พ.ย. 2569) — ข้ามถ้ายังมีพนักงานในกลุ่ม
DELETE m FROM [dbo].[Role_Permission_Matrix] m
JOIN [dbo].[Roles] r ON r.[RoleID] = m.[RoleID]
WHERE r.[RoleName] = 'Manager'
  AND NOT EXISTS (SELECT 1 FROM [dbo].[Accounts_Roles] a WHERE a.[RoleID] = r.[RoleID])
  AND NOT EXISTS (SELECT 1 FROM [dbo].[NotificationSetting] n WHERE n.[RoleID] = r.[RoleID]);
DELETE r FROM [dbo].[Roles] r
WHERE r.[RoleName] = 'Manager'
  AND NOT EXISTS (SELECT 1 FROM [dbo].[Accounts_Roles] a WHERE a.[RoleID] = r.[RoleID])
  AND NOT EXISTS (SELECT 1 FROM [dbo].[NotificationSetting] n WHERE n.[RoleID] = r.[RoleID]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
