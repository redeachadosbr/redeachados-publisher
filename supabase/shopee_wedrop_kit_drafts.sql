-- Rede Achados BR: kits propostos da WeDrop por loja autenticada.
-- Somente backend com service_role deve acessar. Nunca publicar por triggers.
CREATE TABLE IF NOT EXISTS public.shopee_wedrop_kit_drafts (
 shop_id bigint NOT NULL,
 kit_sku text NOT NULL,
 component_skus jsonb NOT NULL DEFAULT '[]'::jsonb,
 draft jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT shopee_wedrop_kit_drafts_pkey PRIMARY KEY (shop_id,kit_sku),
 CONSTRAINT shopee_kit_sku_length CHECK (length(kit_sku) BETWEEN 5 AND 120),
 CONSTRAINT shopee_kit_component_array CHECK (jsonb_typeof(component_skus)='array' AND jsonb_array_length(component_skus) BETWEEN 2 AND 3)
);
ALTER TABLE public.shopee_wedrop_kit_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shopee_wedrop_kit_drafts FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.shopee_wedrop_kit_drafts TO service_role;
-- Sem políticas para anon/authenticated: acesso limitado ao backend.
