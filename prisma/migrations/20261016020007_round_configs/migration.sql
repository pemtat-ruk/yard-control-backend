-- CreateTable
CREATE TABLE "round_configs" (
    "id" SERIAL NOT NULL,
    "effective_from" DATE NOT NULL,
    "first_hour" INTEGER NOT NULL,
    "round_hours" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "round_configs_effective_from_key" ON "round_configs"("effective_from");
