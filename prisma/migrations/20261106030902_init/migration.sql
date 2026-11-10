BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[BookingType] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [BookingType] CHAR(1) NOT NULL,
    [BookingType_Th] NVARCHAR(500),
    [BookingType_En] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [BookingType_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [BookingType_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [BookingType_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [BookingType_BookingType_key] UNIQUE NONCLUSTERED ([BookingType])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentType] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [PaymentType] CHAR(1) NOT NULL,
    [PaymentType_Th] NVARCHAR(500),
    [PaymentType_En] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [PaymentType_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [PaymentType_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PaymentType_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [PaymentType_PaymentType_key] UNIQUE NONCLUSTERED ([PaymentType])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentStatus] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [PaymentStatus] NVARCHAR(30) NOT NULL,
    [PaymentStatus_Th] NVARCHAR(500),
    [PaymentStatus_En] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [PaymentStatus_Is_Active_df] DEFAULT 1,
    [CreateBy] NVARCHAR(30),
    [CreateDate] DATETIME CONSTRAINT [PaymentStatus_CreateDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PaymentStatus_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [PaymentStatus_PaymentStatus_key] UNIQUE NONCLUSTERED ([PaymentStatus])
);

-- CreateTable
CREATE TABLE [dbo].[BookingStatus] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [BookingStatus] CHAR(1) NOT NULL,
    [Booking_Th] NVARCHAR(500),
    [Booking_En] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [BookingStatus_Is_Active_df] DEFAULT 1,
    [CreateBy] NVARCHAR(30),
    [CreateDate] DATETIME CONSTRAINT [BookingStatus_CreateDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [BookingStatus_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [BookingStatus_BookingStatus_key] UNIQUE NONCLUSTERED ([BookingStatus])
);

-- CreateTable
CREATE TABLE [dbo].[ColorsStatus] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [ColorCode] CHAR(1) NOT NULL,
    [Color_Th] NVARCHAR(500),
    [Color_En] NVARCHAR(500),
    [Description] NVARCHAR(500),
    [HtmlColorCode] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [ColorsStatus_Is_Active_df] DEFAULT 1,
    [CreateBy] NVARCHAR(30),
    [CreateDate] DATETIME CONSTRAINT [ColorsStatus_CreateDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ColorsStatus_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [ColorsStatus_ColorCode_key] UNIQUE NONCLUSTERED ([ColorCode])
);

-- CreateTable
CREATE TABLE [dbo].[vwEmployee_List] (
    [EmpCode] NVARCHAR(30) NOT NULL,
    [Username] NVARCHAR(100) NOT NULL,
    [Password] NVARCHAR(512),
    [EmpName] NVARCHAR(255) NOT NULL,
    [DeptCode] NVARCHAR(50),
    [DeptName] NVARCHAR(255),
    [SupDeptName] NVARCHAR(255),
    [EmpPosition] NVARCHAR(255),
    [EmpEmail] NVARCHAR(255),
    [ShortName] NVARCHAR(100),
    [EmpStatus] NVARCHAR(30),
    [User_Level] INT,
    CONSTRAINT [vwEmployee_List_pkey] PRIMARY KEY CLUSTERED ([EmpCode]),
    CONSTRAINT [vwEmployee_List_Username_key] UNIQUE NONCLUSTERED ([Username])
);

-- CreateTable
CREATE TABLE [dbo].[Roles] (
    [RoleID] BIGINT NOT NULL IDENTITY(1,1),
    [RoleName] NVARCHAR(500) NOT NULL,
    [RoleDescription] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [Roles_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [Roles_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Roles_pkey] PRIMARY KEY CLUSTERED ([RoleID])
);

-- CreateTable
CREATE TABLE [dbo].[Permission_Actions] (
    [ActionID] BIGINT NOT NULL IDENTITY(1,1),
    [ActionCode] VARCHAR(50) NOT NULL,
    [ActionName] NVARCHAR(500),
    [Is_Active] BIT NOT NULL CONSTRAINT [Permission_Actions_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [Permission_Actions_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Permission_Actions_pkey] PRIMARY KEY CLUSTERED ([ActionID]),
    CONSTRAINT [Permission_Actions_ActionCode_key] UNIQUE NONCLUSTERED ([ActionCode])
);

-- CreateTable
CREATE TABLE [dbo].[Role_Permission_Matrix] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [RoleID] BIGINT NOT NULL,
    [ActionID] BIGINT NOT NULL,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [Role_Permission_Matrix_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Role_Permission_Matrix_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [Role_Permission_Matrix_RoleID_ActionID_key] UNIQUE NONCLUSTERED ([RoleID],[ActionID])
);

-- CreateTable
CREATE TABLE [dbo].[Accounts_Roles] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [EmpCode] NVARCHAR(100) NOT NULL,
    [RoleID] BIGINT NOT NULL,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [Accounts_Roles_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Accounts_Roles_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [Accounts_Roles_EmpCode_RoleID_key] UNIQUE NONCLUSTERED ([EmpCode],[RoleID])
);

-- CreateTable
CREATE TABLE [dbo].[LoginAttempt] (
    [LoginKey] NVARCHAR(100) NOT NULL,
    [FailedLogins] INT NOT NULL CONSTRAINT [LoginAttempt_FailedLogins_df] DEFAULT 0,
    [LockedUntil] DATETIME2,
    CONSTRAINT [LoginAttempt_pkey] PRIMARY KEY CLUSTERED ([LoginKey])
);

-- CreateTable
CREATE TABLE [dbo].[Menu_Groups] (
    [MenuID] BIGINT NOT NULL IDENTITY(1,1),
    [Menu_Name_Th] NVARCHAR(500),
    [Menu_Name_En] NVARCHAR(500),
    [Route_Path] NVARCHAR(500),
    [Icon] NVARCHAR(30),
    [SequenceNo] INT,
    [Is_Active] BIT NOT NULL CONSTRAINT [Menu_Groups_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [Menu_Groups_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Menu_Groups_pkey] PRIMARY KEY CLUSTERED ([MenuID])
);

-- CreateTable
CREATE TABLE [dbo].[Menu_Sub_Groups] (
    [MenuSubID] BIGINT NOT NULL IDENTITY(1,1),
    [Menu_Sub_Name_Th] NVARCHAR(500),
    [Menu_Sub_Name_En] VARCHAR(500),
    [Route_Path] VARCHAR(500),
    [Icon] NVARCHAR(30),
    [SequenceNo] INT,
    [Is_Active] BIT NOT NULL CONSTRAINT [Menu_Sub_Groups_Is_Active_df] DEFAULT 1,
    [MenuID] BIGINT NOT NULL,
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME,
    CONSTRAINT [Menu_Sub_Groups_pkey] PRIMARY KEY CLUSTERED ([MenuSubID])
);

-- CreateTable
CREATE TABLE [dbo].[CRMCustomer] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [CusId] NVARCHAR(6) NOT NULL,
    [CusType] NVARCHAR(100),
    [LaborCode] VARCHAR(20),
    [LaborCoat] VARCHAR(10),
    [LaborOrigin] VARCHAR(20),
    [LaborCountry] VARCHAR(20),
    [LaborColor] VARCHAR(20),
    [LaborStatus] VARCHAR(20),
    [CoatNo] INT,
    [Telephone] NVARCHAR(200),
    [FirstName] NVARCHAR(200),
    [LastName] NVARCHAR(200),
    [BuyerType] NVARCHAR(100),
    [BuyerNumberPlate] NVARCHAR(50),
    [BuyerProvinceToSell] NVARCHAR(200),
    [BuyerProvinceCar] NVARCHAR(100),
    [BuyerInterestedProducts] NVARCHAR(300),
    [Is_Active] BIT NOT NULL CONSTRAINT [CRMCustomer_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [CRMCustomer_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME,
    CONSTRAINT [CRMCustomer_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [CRMCustomer_CusId_key] UNIQUE NONCLUSTERED ([CusId])
);

-- CreateTable
CREATE TABLE [dbo].[Parking] (
    [ParkingID] BIGINT NOT NULL IDENTITY(1,1),
    [ParkingName] NVARCHAR(500) NOT NULL,
    [Is_Active] BIT NOT NULL CONSTRAINT [Parking_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [Parking_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Parking_pkey] PRIMARY KEY CLUSTERED ([ParkingID])
);

-- CreateTable
CREATE TABLE [dbo].[ParkingExtra] (
    [ParkingID] BIGINT NOT NULL,
    [Code] NVARCHAR(20) NOT NULL,
    [SortOrder] INT NOT NULL CONSTRAINT [ParkingExtra_SortOrder_df] DEFAULT 0,
    [DeletedAt] DATETIME2,
    CONSTRAINT [ParkingExtra_pkey] PRIMARY KEY CLUSTERED ([ParkingID]),
    CONSTRAINT [ParkingExtra_Code_key] UNIQUE NONCLUSTERED ([Code])
);

-- CreateTable
CREATE TABLE [dbo].[ParkingSlot] (
    [ParkingSlotID] BIGINT NOT NULL IDENTITY(1,1),
    [ParkingID] BIGINT NOT NULL,
    [Slot] NVARCHAR(30) NOT NULL,
    [Is_Active] BIT NOT NULL CONSTRAINT [ParkingSlot_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [ParkingSlot_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ParkingSlot_pkey] PRIMARY KEY CLUSTERED ([ParkingSlotID]),
    CONSTRAINT [ParkingSlot_ParkingID_Slot_key] UNIQUE NONCLUSTERED ([ParkingID],[Slot])
);

-- CreateTable
CREATE TABLE [dbo].[ParkingSlotExtra] (
    [ParkingSlotID] BIGINT NOT NULL,
    [Reserved] BIT NOT NULL CONSTRAINT [ParkingSlotExtra_Reserved_df] DEFAULT 0,
    [HeldRounds] NVARCHAR(200) NOT NULL CONSTRAINT [ParkingSlotExtra_HeldRounds_df] DEFAULT '[]',
    [DeletedAt] DATETIME2,
    CONSTRAINT [ParkingSlotExtra_pkey] PRIMARY KEY CLUSTERED ([ParkingSlotID])
);

-- CreateTable
CREATE TABLE [dbo].[ParkingLayoutVersion] (
    [ParkingLayoutID] BIGINT NOT NULL IDENTITY(1,1),
    [ParkingID] BIGINT NOT NULL,
    [RoundNo] VARCHAR(13) NOT NULL,
    [VersionNo] NVARCHAR(30) NOT NULL,
    [EffectiveDate] DATETIME NOT NULL,
    [Is_Active] BIT NOT NULL CONSTRAINT [ParkingLayoutVersion_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [ParkingLayoutVersion_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ParkingLayoutVersion_pkey] PRIMARY KEY CLUSTERED ([ParkingLayoutID])
);

-- CreateTable
CREATE TABLE [dbo].[ParkingLayoutSlot] (
    [ParkingLayoutSlotID] BIGINT NOT NULL IDENTITY(1,1),
    [ParkingLayoutID] BIGINT NOT NULL,
    [ParkingSlotID] BIGINT NOT NULL,
    [Is_Active] BIT NOT NULL CONSTRAINT [ParkingLayoutSlot_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [ParkingLayoutSlot_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ParkingLayoutSlot_pkey] PRIMARY KEY CLUSTERED ([ParkingLayoutSlotID]),
    CONSTRAINT [ParkingLayoutSlot_ParkingLayoutID_ParkingSlotID_key] UNIQUE NONCLUSTERED ([ParkingLayoutID],[ParkingSlotID])
);

-- CreateTable
CREATE TABLE [dbo].[ParkingRate] (
    [ParkingRateID] BIGINT NOT NULL IDENTITY(1,1),
    [ParkingLayoutID] BIGINT NOT NULL,
    [RateAmount] DECIMAL(10,2) NOT NULL,
    [Is_Active] BIT NOT NULL CONSTRAINT [ParkingRate_Is_Active_df] DEFAULT 1,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [ParkingRate_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ParkingRate_pkey] PRIMARY KEY CLUSTERED ([ParkingRateID])
);

-- CreateTable
CREATE TABLE [dbo].[BookingRound] (
    [RoundID] BIGINT NOT NULL IDENTITY(1,1),
    [RoundNo] VARCHAR(13) NOT NULL,
    [RoundSequence] INT NOT NULL,
    [StartTime] TIME NOT NULL,
    [EndTime] TIME NOT NULL,
    [DurationHour] INT NOT NULL,
    [EffectiveDate] DATETIME NOT NULL,
    [Is_Active] BIT NOT NULL CONSTRAINT [BookingRound_Is_Active_df] DEFAULT 1,
    [CreateBy] NVARCHAR(30),
    [CreateDate] DATETIME CONSTRAINT [BookingRound_CreateDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [BookingRound_pkey] PRIMARY KEY CLUSTERED ([RoundID]),
    CONSTRAINT [BookingRound_RoundNo_RoundSequence_key] UNIQUE NONCLUSTERED ([RoundNo],[RoundSequence])
);

-- CreateTable
CREATE TABLE [dbo].[BookingPolicy] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [PolicyCode] VARCHAR(30) NOT NULL,
    [PolicyValue] INT NOT NULL,
    [Unit] VARCHAR(20),
    [Is_Active] BIT NOT NULL CONSTRAINT [BookingPolicy_Is_Active_df] DEFAULT 1,
    [CreateBy] VARCHAR(30),
    [CreateDate] DATETIME CONSTRAINT [BookingPolicy_CreateDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [BookingPolicy_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [BookingPolicy_PolicyCode_key] UNIQUE NONCLUSTERED ([PolicyCode])
);

-- CreateTable
CREATE TABLE [dbo].[NotificationSetting] (
    [NotiID] BIGINT NOT NULL IDENTITY(1,1),
    [NotiType] VARCHAR(30) NOT NULL,
    [NotiName_TH] NVARCHAR(500),
    [RecipientType] NVARCHAR(50),
    [ReferTime] TIME,
    [NotiBeforeMinute] INT,
    [EffectiveDate] DATETIME,
    [Is_Active] BIT NOT NULL CONSTRAINT [NotificationSetting_Is_Active_df] DEFAULT 1,
    [CreateBy] NVARCHAR(30),
    [CreateDate] DATETIME CONSTRAINT [NotificationSetting_CreateDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [NotificationSetting_pkey] PRIMARY KEY CLUSTERED ([NotiID])
);

-- CreateTable
CREATE TABLE [dbo].[DocumentRunnings] (
    [RunningID] BIGINT NOT NULL IDENTITY(1,1),
    [Prefix] CHAR(2) NOT NULL,
    [Year] NVARCHAR(4) NOT NULL,
    [Month] NVARCHAR(2) NOT NULL,
    [LastNumber] INT NOT NULL,
    [CreatedBy] NVARCHAR(30),
    [CreatedDate] DATETIME CONSTRAINT [DocumentRunnings_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DocumentRunnings_pkey] PRIMARY KEY CLUSTERED ([RunningID]),
    CONSTRAINT [DocumentRunnings_Prefix_Year_Month_key] UNIQUE NONCLUSTERED ([Prefix],[Year],[Month])
);

-- CreateTable
CREATE TABLE [dbo].[BookingHeader] (
    [BookingNo] VARCHAR(14) NOT NULL,
    [BookingDate] DATETIME NOT NULL CONSTRAINT [BookingHeader_BookingDate_df] DEFAULT CURRENT_TIMESTAMP,
    [BookingCusId] NVARCHAR(6) NOT NULL,
    [BookingChannel] CHAR(1) NOT NULL,
    [BookingType] CHAR(1) NOT NULL,
    [PaymentType] CHAR(1) NOT NULL,
    [PaymentStatus] CHAR(1) NOT NULL,
    [BookingStatus] CHAR(1) NOT NULL,
    [TotalAmount] DECIMAL(10,2) NOT NULL,
    [PaidAt] DATETIME,
    [CreatedBy] NVARCHAR(30) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [BookingHeader_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [BookingRemark] NVARCHAR(500),
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME,
    CONSTRAINT [BookingHeader_pkey] PRIMARY KEY CLUSTERED ([BookingNo])
);

-- CreateTable
CREATE TABLE [dbo].[BookingDetail] (
    [BookingDetailID] BIGINT NOT NULL IDENTITY(1,1),
    [BookingNo] VARCHAR(14) NOT NULL,
    [UsageDate] DATE NOT NULL,
    [ParkingLayoutSlotID] BIGINT NOT NULL,
    [RoundID] BIGINT NOT NULL,
    [Amount] DECIMAL(10,2) NOT NULL,
    [PaidAt] DATETIME,
    [Remark] NVARCHAR(500),
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME,
    CONSTRAINT [BookingDetail_pkey] PRIMARY KEY CLUSTERED ([BookingDetailID])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentSchedule] (
    [PayScheduleID] BIGINT NOT NULL IDENTITY(1,1),
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
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [PaymentSchedule_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME,
    CONSTRAINT [PaymentSchedule_pkey] PRIMARY KEY CLUSTERED ([PayScheduleID]),
    CONSTRAINT [PaymentSchedule_BookingNo_SequenceNo_key] UNIQUE NONCLUSTERED ([BookingNo],[SequenceNo])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentTransaction] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [TransactionNo] NVARCHAR(50) NOT NULL,
    [Purpose] VARCHAR(30) NOT NULL CONSTRAINT [PaymentTransaction_Purpose_df] DEFAULT 'BOOKING',
    [BookingNo] VARCHAR(14),
    [Amount] DECIMAL(10,2) NOT NULL,
    [Status] VARCHAR(30) NOT NULL CONSTRAINT [PaymentTransaction_Status_df] DEFAULT 'PENDING',
    [QrPayload] NVARCHAR(max),
    [GatewayRef] NVARCHAR(100),
    [ExpiresAt] DATETIME2 NOT NULL,
    [PaidAt] DATETIME2,
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [PaymentTransaction_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [UpdatedDate] DATETIME2 NOT NULL,
    CONSTRAINT [PaymentTransaction_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [PaymentTransaction_TransactionNo_key] UNIQUE NONCLUSTERED ([TransactionNo])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentScheduleItem] (
    [PaymentID] INT NOT NULL,
    [PayScheduleID] BIGINT NOT NULL,
    CONSTRAINT [PaymentScheduleItem_pkey] PRIMARY KEY CLUSTERED ([PaymentID],[PayScheduleID])
);

-- CreateTable
CREATE TABLE [dbo].[Receipt] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [ReceiptNo] NVARCHAR(30) NOT NULL,
    [PaymentID] INT NOT NULL,
    [VatRatePercent] DECIMAL(5,2) NOT NULL,
    [AmountBeforeVat] DECIMAL(10,2) NOT NULL,
    [VatAmount] DECIMAL(10,2) NOT NULL,
    [IssuedAt] DATETIME2 NOT NULL CONSTRAINT [Receipt_IssuedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Receipt_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [Receipt_ReceiptNo_key] UNIQUE NONCLUSTERED ([ReceiptNo]),
    CONSTRAINT [Receipt_PaymentID_key] UNIQUE NONCLUSTERED ([PaymentID])
);

-- CreateTable
CREATE TABLE [dbo].[Fine] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [FineNo] NVARCHAR(30) NOT NULL,
    [CusId] NVARCHAR(6),
    [BookingNo] VARCHAR(14),
    [IssuedBy] NVARCHAR(30) NOT NULL,
    [Reason] NVARCHAR(500) NOT NULL,
    [Amount] DECIMAL(10,2) NOT NULL,
    [PaymentID] INT,
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [Fine_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Fine_pkey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [Fine_FineNo_key] UNIQUE NONCLUSTERED ([FineNo])
);

-- CreateTable
CREATE TABLE [dbo].[FineSlot] (
    [FineID] INT NOT NULL,
    [ParkingSlotID] BIGINT NOT NULL,
    CONSTRAINT [FineSlot_pkey] PRIMARY KEY CLUSTERED ([FineID],[ParkingSlotID])
);

-- CreateTable
CREATE TABLE [dbo].[SlotInspection] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [ParkingSlotID] BIGINT NOT NULL,
    [BookingNo] VARCHAR(14) NOT NULL,
    [UsageDate] DATE NOT NULL,
    [Result] VARCHAR(30) NOT NULL,
    [InspectedBy] NVARCHAR(30) NOT NULL,
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [SlotInspection_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SlotInspection_pkey] PRIMARY KEY CLUSTERED ([ID])
);

-- CreateTable
CREATE TABLE [dbo].[NotificationLog] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [RecipientType] VARCHAR(30) NOT NULL,
    [RecipientCode] NVARCHAR(30) NOT NULL,
    [Type] VARCHAR(30) NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Body] NVARCHAR(max) NOT NULL,
    [DedupeKey] NVARCHAR(150),
    [ReadAt] DATETIME2,
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [NotificationLog_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [NotificationLog_pkey] PRIMARY KEY CLUSTERED ([ID])
);

-- CreateTable
CREATE TABLE [dbo].[SystemSetting] (
    [SettingKey] NVARCHAR(100) NOT NULL,
    [SettingValue] NVARCHAR(max) NOT NULL,
    [UpdatedBy] NVARCHAR(30),
    [UpdatedDate] DATETIME2 NOT NULL,
    CONSTRAINT [SystemSetting_pkey] PRIMARY KEY CLUSTERED ([SettingKey])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [ID] INT NOT NULL IDENTITY(1,1),
    [ActorCode] NVARCHAR(30),
    [Action] NVARCHAR(100) NOT NULL,
    [Entity] NVARCHAR(100) NOT NULL,
    [EntityID] NVARCHAR(100),
    [Detail] NVARCHAR(max),
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [AuditLog_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([ID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ParkingLayoutVersion_ParkingID_EffectiveDate_idx] ON [dbo].[ParkingLayoutVersion]([ParkingID], [EffectiveDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ParkingLayoutSlot_ParkingSlotID_idx] ON [dbo].[ParkingLayoutSlot]([ParkingSlotID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ParkingRate_ParkingLayoutID_idx] ON [dbo].[ParkingRate]([ParkingLayoutID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NotificationSetting_NotiType_EffectiveDate_idx] ON [dbo].[NotificationSetting]([NotiType], [EffectiveDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingHeader_BookingCusId_BookingStatus_idx] ON [dbo].[BookingHeader]([BookingCusId], [BookingStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingHeader_BookingStatus_PaymentStatus_idx] ON [dbo].[BookingHeader]([BookingStatus], [PaymentStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingDetail_ParkingLayoutSlotID_UsageDate_RoundID_idx] ON [dbo].[BookingDetail]([ParkingLayoutSlotID], [UsageDate], [RoundID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingDetail_BookingNo_idx] ON [dbo].[BookingDetail]([BookingNo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingDetail_UsageDate_idx] ON [dbo].[BookingDetail]([UsageDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentSchedule_PaymentStatus_DueDate_idx] ON [dbo].[PaymentSchedule]([PaymentStatus], [DueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentTransaction_Status_ExpiresAt_idx] ON [dbo].[PaymentTransaction]([Status], [ExpiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentTransaction_BookingNo_idx] ON [dbo].[PaymentTransaction]([BookingNo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentScheduleItem_PayScheduleID_idx] ON [dbo].[PaymentScheduleItem]([PayScheduleID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Fine_CusId_idx] ON [dbo].[Fine]([CusId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Fine_BookingNo_idx] ON [dbo].[Fine]([BookingNo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FineSlot_ParkingSlotID_idx] ON [dbo].[FineSlot]([ParkingSlotID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SlotInspection_ParkingSlotID_UsageDate_idx] ON [dbo].[SlotInspection]([ParkingSlotID], [UsageDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NotificationLog_RecipientType_RecipientCode_ReadAt_idx] ON [dbo].[NotificationLog]([RecipientType], [RecipientCode], [ReadAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_Entity_EntityID_idx] ON [dbo].[AuditLog]([Entity], [EntityID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_CreatedDate_idx] ON [dbo].[AuditLog]([CreatedDate]);

-- AddForeignKey
ALTER TABLE [dbo].[Role_Permission_Matrix] ADD CONSTRAINT [Role_Permission_Matrix_RoleID_fkey] FOREIGN KEY ([RoleID]) REFERENCES [dbo].[Roles]([RoleID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Role_Permission_Matrix] ADD CONSTRAINT [Role_Permission_Matrix_ActionID_fkey] FOREIGN KEY ([ActionID]) REFERENCES [dbo].[Permission_Actions]([ActionID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Accounts_Roles] ADD CONSTRAINT [Accounts_Roles_RoleID_fkey] FOREIGN KEY ([RoleID]) REFERENCES [dbo].[Roles]([RoleID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Menu_Sub_Groups] ADD CONSTRAINT [Menu_Sub_Groups_MenuID_fkey] FOREIGN KEY ([MenuID]) REFERENCES [dbo].[Menu_Groups]([MenuID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ParkingExtra] ADD CONSTRAINT [ParkingExtra_ParkingID_fkey] FOREIGN KEY ([ParkingID]) REFERENCES [dbo].[Parking]([ParkingID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ParkingSlot] ADD CONSTRAINT [ParkingSlot_ParkingID_fkey] FOREIGN KEY ([ParkingID]) REFERENCES [dbo].[Parking]([ParkingID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ParkingSlotExtra] ADD CONSTRAINT [ParkingSlotExtra_ParkingSlotID_fkey] FOREIGN KEY ([ParkingSlotID]) REFERENCES [dbo].[ParkingSlot]([ParkingSlotID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ParkingLayoutVersion] ADD CONSTRAINT [ParkingLayoutVersion_ParkingID_fkey] FOREIGN KEY ([ParkingID]) REFERENCES [dbo].[Parking]([ParkingID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ParkingLayoutSlot] ADD CONSTRAINT [ParkingLayoutSlot_ParkingLayoutID_fkey] FOREIGN KEY ([ParkingLayoutID]) REFERENCES [dbo].[ParkingLayoutVersion]([ParkingLayoutID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ParkingLayoutSlot] ADD CONSTRAINT [ParkingLayoutSlot_ParkingSlotID_fkey] FOREIGN KEY ([ParkingSlotID]) REFERENCES [dbo].[ParkingSlot]([ParkingSlotID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ParkingRate] ADD CONSTRAINT [ParkingRate_ParkingLayoutID_fkey] FOREIGN KEY ([ParkingLayoutID]) REFERENCES [dbo].[ParkingLayoutVersion]([ParkingLayoutID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BookingHeader] ADD CONSTRAINT [BookingHeader_BookingCusId_fkey] FOREIGN KEY ([BookingCusId]) REFERENCES [dbo].[CRMCustomer]([CusId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BookingHeader] ADD CONSTRAINT [BookingHeader_BookingType_fkey] FOREIGN KEY ([BookingType]) REFERENCES [dbo].[BookingType]([BookingType]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BookingHeader] ADD CONSTRAINT [BookingHeader_PaymentType_fkey] FOREIGN KEY ([PaymentType]) REFERENCES [dbo].[PaymentType]([PaymentType]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BookingHeader] ADD CONSTRAINT [BookingHeader_BookingStatus_fkey] FOREIGN KEY ([BookingStatus]) REFERENCES [dbo].[BookingStatus]([BookingStatus]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BookingDetail] ADD CONSTRAINT [BookingDetail_BookingNo_fkey] FOREIGN KEY ([BookingNo]) REFERENCES [dbo].[BookingHeader]([BookingNo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BookingDetail] ADD CONSTRAINT [BookingDetail_ParkingLayoutSlotID_fkey] FOREIGN KEY ([ParkingLayoutSlotID]) REFERENCES [dbo].[ParkingLayoutSlot]([ParkingLayoutSlotID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BookingDetail] ADD CONSTRAINT [BookingDetail_RoundID_fkey] FOREIGN KEY ([RoundID]) REFERENCES [dbo].[BookingRound]([RoundID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PaymentSchedule] ADD CONSTRAINT [PaymentSchedule_BookingDetailID_fkey] FOREIGN KEY ([BookingDetailID]) REFERENCES [dbo].[BookingDetail]([BookingDetailID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PaymentSchedule] ADD CONSTRAINT [PaymentSchedule_BookingNo_fkey] FOREIGN KEY ([BookingNo]) REFERENCES [dbo].[BookingHeader]([BookingNo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PaymentSchedule] ADD CONSTRAINT [PaymentSchedule_NotiID_fkey] FOREIGN KEY ([NotiID]) REFERENCES [dbo].[NotificationSetting]([NotiID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PaymentTransaction] ADD CONSTRAINT [PaymentTransaction_BookingNo_fkey] FOREIGN KEY ([BookingNo]) REFERENCES [dbo].[BookingHeader]([BookingNo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PaymentScheduleItem] ADD CONSTRAINT [PaymentScheduleItem_PaymentID_fkey] FOREIGN KEY ([PaymentID]) REFERENCES [dbo].[PaymentTransaction]([ID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PaymentScheduleItem] ADD CONSTRAINT [PaymentScheduleItem_PayScheduleID_fkey] FOREIGN KEY ([PayScheduleID]) REFERENCES [dbo].[PaymentSchedule]([PayScheduleID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Receipt] ADD CONSTRAINT [Receipt_PaymentID_fkey] FOREIGN KEY ([PaymentID]) REFERENCES [dbo].[PaymentTransaction]([ID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Fine] ADD CONSTRAINT [Fine_BookingNo_fkey] FOREIGN KEY ([BookingNo]) REFERENCES [dbo].[BookingHeader]([BookingNo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Fine] ADD CONSTRAINT [Fine_PaymentID_fkey] FOREIGN KEY ([PaymentID]) REFERENCES [dbo].[PaymentTransaction]([ID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FineSlot] ADD CONSTRAINT [FineSlot_FineID_fkey] FOREIGN KEY ([FineID]) REFERENCES [dbo].[Fine]([ID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FineSlot] ADD CONSTRAINT [FineSlot_ParkingSlotID_fkey] FOREIGN KEY ([ParkingSlotID]) REFERENCES [dbo].[ParkingSlot]([ParkingSlotID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SlotInspection] ADD CONSTRAINT [SlotInspection_ParkingSlotID_fkey] FOREIGN KEY ([ParkingSlotID]) REFERENCES [dbo].[ParkingSlot]([ParkingSlotID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SlotInspection] ADD CONSTRAINT [SlotInspection_BookingNo_fkey] FOREIGN KEY ([BookingNo]) REFERENCES [dbo].[BookingHeader]([BookingNo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- SQL Server ให้ UNIQUE มีค่า NULL ได้แถวเดียว: คอลัมน์ที่ว่างได้ใช้ unique index เฉพาะแถวที่มีค่าแทน
CREATE UNIQUE NONCLUSTERED INDEX [CRMCustomer_LaborCode_key] ON [dbo].[CRMCustomer]([LaborCode]) WHERE [LaborCode] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [CRMCustomer_Telephone_key] ON [dbo].[CRMCustomer]([Telephone]) WHERE [Telephone] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [PaymentTransaction_GatewayRef_key] ON [dbo].[PaymentTransaction]([GatewayRef]) WHERE [GatewayRef] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [Fine_PaymentID_key] ON [dbo].[Fine]([PaymentID]) WHERE [PaymentID] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [NotificationLog_DedupeKey_key] ON [dbo].[NotificationLog]([DedupeKey]) WHERE [DedupeKey] IS NOT NULL;

-- ค่าที่ยอมรับของคอลัมน์รหัส (ค่า NULL ผ่านได้ตามคอลัมน์ที่ว่างได้)
ALTER TABLE [dbo].[BookingHeader] ADD CONSTRAINT [BookingHeader_BookingChannel_check] CHECK ([BookingChannel] IN ('N', 'I'));
ALTER TABLE [dbo].[BookingHeader] ADD CONSTRAINT [BookingHeader_PaymentStatus_check] CHECK ([PaymentStatus] IN ('W', 'P', 'O', 'C'));
ALTER TABLE [dbo].[PaymentSchedule] ADD CONSTRAINT [PaymentSchedule_PaymentStatus_check] CHECK ([PaymentStatus] IN ('W', 'P', 'O', 'C'));
ALTER TABLE [dbo].[PaymentTransaction] ADD CONSTRAINT [PaymentTransaction_Purpose_check] CHECK ([Purpose] IN ('BOOKING', 'FINE'));
ALTER TABLE [dbo].[PaymentTransaction] ADD CONSTRAINT [PaymentTransaction_Status_check] CHECK ([Status] IN ('PENDING', 'PAID', 'EXPIRED'));
ALTER TABLE [dbo].[SlotInspection] ADD CONSTRAINT [SlotInspection_Result_check] CHECK ([Result] IN ('VACATED', 'STILL_PARKED'));
ALTER TABLE [dbo].[NotificationLog] ADD CONSTRAINT [NotificationLog_RecipientType_check] CHECK ([RecipientType] IN ('CUSTOMER', 'EMPLOYEE'));
ALTER TABLE [dbo].[NotificationLog] ADD CONSTRAINT [NotificationLog_Type_check] CHECK ([Type] IN ('PARKING_EXPIRING', 'PARKING_OVERTIME', 'PAYMENT_DUE', 'BOOKING_CANCELLED'));

-- ข้อความในคอลัมน์เหล่านี้ต้องเป็น JSON ที่ถูกรูป
ALTER TABLE [dbo].[ParkingSlotExtra] ADD CONSTRAINT [ParkingSlotExtra_HeldRounds_json] CHECK (ISJSON([HeldRounds]) = 1);
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_Detail_json] CHECK (ISJSON([Detail]) = 1);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
