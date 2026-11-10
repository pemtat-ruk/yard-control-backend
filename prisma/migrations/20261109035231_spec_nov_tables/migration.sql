BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Menu_Sub_Groups] ADD [CreatedBy] NVARCHAR(30),
[CreatedDate] DATETIME CONSTRAINT [Menu_Sub_Groups_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE [dbo].[NotificationSetting] ADD [RoleID] BIGINT;

-- AlterTable
ALTER TABLE [dbo].[Permission_Actions] ADD [Description] NVARCHAR(500),
[MenuID] BIGINT,
[MenuSubID] BIGINT,
[SequenceNo] INT;

-- AlterTable
ALTER TABLE [dbo].[Role_Permission_Matrix] ADD [MenuID] BIGINT,
[MenuSubID] BIGINT;

-- CreateTable
CREATE TABLE [dbo].[ParkingSlotStatus] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [StatusCode] NVARCHAR(500) NOT NULL,
    [StatusName_TH] NVARCHAR(500),
    [StatusName_EN] NVARCHAR(500),
    [Description] NVARCHAR(500),
    [Color_Th] NVARCHAR(500),
    [Color_En] NVARCHAR(500),
    [HtmlColorCode] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [ParkingSlotStatus_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [ParkingSlotStatus_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ParkingSlotStatus_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [ParkingSlotStatus_StatusCode_key] UNIQUE NONCLUSTERED ([StatusCode])
);

-- CreateTable
CREATE TABLE [dbo].[BookingHeaderHistory] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [HistoryGroupID] INT NOT NULL,
    [BookingNo] VARCHAR(14) NOT NULL,
    [BookingDate] DATETIME NOT NULL,
    [BookingCusId] NVARCHAR(6) NOT NULL,
    [BookingChannel] CHAR(1) NOT NULL,
    [BookingType] CHAR(1) NOT NULL,
    [PaymentType] CHAR(1) NOT NULL,
    [PaymentStatus] CHAR(1) NOT NULL,
    [BookingStatus] CHAR(1) NOT NULL,
    [TotalAmount] DECIMAL(10,2) NOT NULL,
    [PaidAt] DATETIME,
    [CreatedBy] NVARCHAR(30) NOT NULL,
    [CreatedDate] DATETIME NOT NULL,
    [BookingRemark] NVARCHAR(500),
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME,
    CONSTRAINT [BookingHeaderHistory_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [BookingHeaderHistory_BookingNo_HistoryGroupID_key] UNIQUE NONCLUSTERED ([BookingNo],[HistoryGroupID])
);

-- CreateTable
CREATE TABLE [dbo].[BookingDetailHistory] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [HistoryGroupID] INT NOT NULL,
    [BookingDetailID] BIGINT NOT NULL,
    [BookingNo] VARCHAR(14) NOT NULL,
    [UsageDate] DATE NOT NULL,
    [ParkingLayoutSlotID] BIGINT NOT NULL,
    [RoundID] BIGINT NOT NULL,
    [Amount] DECIMAL(10,2) NOT NULL,
    [PaidAt] DATETIME,
    [Remark] NVARCHAR(500),
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME,
    CONSTRAINT [BookingDetailHistory_pkey] PRIMARY KEY CLUSTERED ([ID])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentScheduleHistory] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [HistoryGroupID] INT NOT NULL,
    [PayScheduleID] BIGINT NOT NULL,
    [BookingDetailID] BIGINT,
    [BookingNo] VARCHAR(14) NOT NULL,
    [SequenceNo] INT NOT NULL,
    [NotiID] BIGINT,
    [DueDate] DATE NOT NULL,
    [DueTime] TIME NOT NULL,
    [Reminder] DATETIME,
    [AmountDue] DECIMAL(10,2) NOT NULL,
    [PaymentStatus] VARCHAR(1) NOT NULL,
    [PaidAt] DATETIME,
    [Remark] NVARCHAR(500),
    [CreatedBy] NVARCHAR(30) NOT NULL,
    [CreatedDate] DATETIME NOT NULL,
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME,
    CONSTRAINT [PaymentScheduleHistory_pkey] PRIMARY KEY CLUSTERED ([ID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingDetailHistory_BookingNo_HistoryGroupID_idx] ON [dbo].[BookingDetailHistory]([BookingNo], [HistoryGroupID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentScheduleHistory_BookingNo_HistoryGroupID_idx] ON [dbo].[PaymentScheduleHistory]([BookingNo], [HistoryGroupID]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
