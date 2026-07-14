UPDATE "ordens_producao"
SET
  "status" = 'impressa'::"StatusOrdemProducao",
  "impresso_em" = COALESCE("impresso_em", "criado_em")
WHERE
  "status" = 'criada'::"StatusOrdemProducao"
  AND "criado_em" < NOW();
