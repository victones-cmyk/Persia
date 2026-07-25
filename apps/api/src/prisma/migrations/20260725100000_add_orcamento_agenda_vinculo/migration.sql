-- Vínculo entre orçamento da Pérsia e OS (appointment) do app Agenda/CurtainField.
-- Sem FK para o appointment: ele vive em outro database (curtainfield) no mesmo
-- servidor Postgres; a leitura é feita ao vivo por conexão dedicada.
CREATE TABLE "orcamento_agenda_vinculos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orcamento_id" UUID NOT NULL,
    "agenda_appointment_id" INTEGER NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "criado_por" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orcamento_agenda_vinculos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orcamento_agenda_vinculos_orcamento_id_idx" ON "orcamento_agenda_vinculos"("orcamento_id");

CREATE UNIQUE INDEX "orcamento_agenda_vinculos_orcamento_id_agenda_appointment_i_key" ON "orcamento_agenda_vinculos"("orcamento_id", "agenda_appointment_id");

ALTER TABLE "orcamento_agenda_vinculos" ADD CONSTRAINT "orcamento_agenda_vinculos_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
