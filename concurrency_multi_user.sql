-- =============================================================================
-- Multi-User Concurrency & Atomic Sequence / Stock Locks (7-8+ Machines)
-- Hualian Esan POS & Store Management
-- Run this script in Supabase SQL Editor for database-level atomic locks.
-- (Note: The frontend also includes Compare-And-Swap + 23505 Collision Retry
--  so it works safely even before this SQL script is run.)
-- =============================================================================

-- 1. Sequence tracking table for atomic document numbering
CREATE TABLE IF NOT EXISTS public.doc_sequences (
  prefix TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.doc_sequences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'doc_sequences' AND policyname = 'Allow all access to doc_sequences'
  ) THEN
    CREATE POLICY "Allow all access to doc_sequences"
      ON public.doc_sequences FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Atomic RPC to allocate the next document number without race conditions
CREATE OR REPLACE FUNCTION public.next_doc_number(
  p_table TEXT,
  p_prefix TEXT,
  p_pad INTEGER DEFAULT 3,
  p_col TEXT DEFAULT 'id'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_db INTEGER := 0;
  v_next INTEGER := 1;
  v_candidate TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Transaction-level advisory lock keyed on prefix so concurrent calls queue atomically
  PERFORM pg_advisory_xact_lock(hashtext('doc_seq_' || p_table || '_' || p_prefix));

  -- Inspect current max number in the target table for this prefix
  EXECUTE format(
    'SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(%I FROM %L), ''[^0-9]'', '''', ''g''), '''')::INTEGER), 0)
     FROM public.%I
     WHERE %I ILIKE %L
       AND length(substring(%I FROM %L)) <= 6',
    p_col, length(p_prefix) + 1, p_table, p_col, p_prefix || '%', p_col, length(p_prefix) + 1
  ) INTO v_max_db;

  INSERT INTO public.doc_sequences (prefix, last_seq, updated_at)
  VALUES (p_table || ':' || p_prefix, v_max_db + 1, now())
  ON CONFLICT (prefix) DO UPDATE
    SET last_seq = GREATEST(public.doc_sequences.last_seq + 1, v_max_db + 1),
        updated_at = now()
  RETURNING last_seq INTO v_next;

  LOOP
    v_candidate := p_prefix || lpad(v_next::TEXT, p_pad, '0');
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I = $1)',
      p_table, p_col
    ) INTO v_exists USING v_candidate;

    EXIT WHEN NOT v_exists;
    v_next := v_next + 1;
  END LOOP;

  UPDATE public.doc_sequences
  SET last_seq = v_next, updated_at = now()
  WHERE prefix = p_table || ':' || p_prefix;

  RETURN v_candidate;
END;
$$;

-- 3. Atomic RPC for adjusting product warehouse stock (3 warehouses)
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id TEXT,
  p_location TEXT,
  p_delta NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_office NUMERIC;
  v_kookkai NUMERIC;
  v_big NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT
    COALESCE(stock_office, 0),
    COALESCE(stock_kookkai, 0),
    COALESCE(stock_big, 0)
  INTO v_office, v_kookkai, v_big
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found', p_product_id;
  END IF;

  IF p_location = 'โกดังกุ๊กไก่' THEN
    v_kookkai := GREATEST(0, ROUND((v_kookkai + p_delta)::NUMERIC, 3));
  ELSIF p_location = 'ออฟฟิศ' THEN
    v_office := GREATEST(0, ROUND((v_office + p_delta)::NUMERIC, 3));
  ELSE
    v_big := GREATEST(0, ROUND((v_big + p_delta)::NUMERIC, 3));
  END IF;

  v_total := ROUND((v_office + v_kookkai + v_big)::NUMERIC, 3);

  UPDATE public.products
  SET stock_office = v_office,
      stock_kookkai = v_kookkai,
      stock_big = v_big,
      stock = v_total
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'id', p_product_id,
    'stock_office', v_office,
    'stock_kookkai', v_kookkai,
    'stock_big', v_big,
    'stock', v_total
  );
END;
$$;

-- 4. Atomic RPC for adjusting spare part stock
CREATE OR REPLACE FUNCTION public.adjust_part_stock(
  p_part_id BIGINT,
  p_delta INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_qty INTEGER;
BEGIN
  UPDATE public.parts
  SET quantity = GREATEST(0, COALESCE(quantity, 0) + p_delta),
      updated_at = now()
  WHERE id = p_part_id
  RETURNING quantity INTO v_new_qty;

  RETURN v_new_qty;
END;
$$;

-- 5. Ensure Unique Index on parts(part_code) so concurrent inserts cannot duplicate HL-xxxxxx
CREATE UNIQUE INDEX IF NOT EXISTS idx_parts_part_code_unique ON public.parts (part_code);

-- 6. Enable Realtime publication on all core operational tables so 7-8 machines stay in sync
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'products', 'parts', 'sales', 'sale_items',
    'sales_part', 'sale_items_part', 'quotations', 'quotation_items',
    'quotations_part', 'quotation_items_part', 'customers',
    'customer_repairs', 'shop_repairs', 'customer_deliveries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object OR undefined_table THEN
      -- Table already in publication or does not exist
      NULL;
    END;
  END LOOP;
END $$;
