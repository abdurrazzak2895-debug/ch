-- Make automatic booking refunds durable and idempotent.
-- A failed upstream booking never reaches wallet_complete_booking_hold, so it
-- leaves no debit to refund. This function handles reservations that were
-- charged successfully and later become cancelled/expired/completed/etc.
CREATE OR REPLACE FUNCTION public.wallet_refund_booking(
  p_account_id TEXT,
  p_reservation_id TEXT,
  p_status TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.wallet_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_debit public.wallet_transactions%ROWTYPE;
  v_tx public.wallet_transactions%ROWTYPE;
  v_idempotency_key TEXT;
  v_status TEXT;
BEGIN
  IF btrim(coalesce(p_account_id, '')) = '' OR btrim(coalesce(p_reservation_id, '')) = '' THEN
    RAISE EXCEPTION 'account and reservation are required';
  END IF;

  v_idempotency_key := 'refund:' || btrim(p_account_id) || ':' || btrim(p_reservation_id);
  v_status := NULLIF(btrim(coalesce(p_status, '')), '');

  -- Serialize retries for the same account/reservation before checking the
  -- unique ledger key. Without this lock, two concurrent readers could both
  -- pass the existence check and one would lose on the unique constraint.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_idempotency_key, 0));

  -- Return the existing immutable credit on retries.
  SELECT * INTO v_tx
  FROM public.wallet_transactions
  WHERE idempotency_key = v_idempotency_key;
  IF FOUND THEN RETURN v_tx; END IF;

  SELECT * INTO v_debit
  FROM public.wallet_transactions
  WHERE account_id = p_account_id
    AND transaction_type = 'booking_debit'
    AND direction = 'debit'
    AND reference_type = 'reservation'
    AND reference_id = p_reservation_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking debit not found for reservation %', p_reservation_id;
  END IF;

  SELECT * INTO v_tx FROM public.wallet_post_adjustment(
    p_account_id,
    v_debit.amount,
    'credit',
    'refund',
    v_idempotency_key,
    'Automatic refund for finalized reservation #' || p_reservation_id,
    p_account_id,
    'reservation_refund',
    p_reservation_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'original_debit_id', v_debit.id,
      'reservation_status', v_status,
      'automatic', true
    )
  );
  RETURN v_tx;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_refund_booking(TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_refund_booking(TEXT, TEXT, TEXT, JSONB)
  TO service_role;
