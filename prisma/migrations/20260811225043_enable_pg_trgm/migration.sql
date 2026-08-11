-- Powers the "did you mean" spelling suggestion on zero-result searches:
-- trigram similarity between the typed query and Card/SealedProduct names.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Card_name_trgm_idx" ON "Card" USING GIN (name gin_trgm_ops);
CREATE INDEX "SealedProduct_name_trgm_idx" ON "SealedProduct" USING GIN (name gin_trgm_ops);
