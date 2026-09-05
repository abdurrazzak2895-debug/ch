-- Fix duplicate wallet debit bug.
-- Previously, wallet_complete_booking_hold used hold_id as idempotency key.
-- If a user double-submitted a booking, two different holds could be created
-- and both completed, resulting in TWO debits for the same reservation.
-- This fix adds a reservation_id-based idempotency check to prevent duplicates.

CREATE OR REPLACE FUNCTION public.wallet_complete_booking_hold(
  p_hold_id UUID,
  p_reservation_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.wallet_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hold public.booking_wallet_holds%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_tx public.wallet_transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_hold
  FROM public.booking_wallet_holds
  WHERE id = p_hold_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking hold not found'; END IF;

  -- Idempotency: return existing transaction if this hold was already completed
  SELECT * INTO v_tx
  FROM public.wallet_transactions
  WHERE idempotency_key = 'booking:' || p_hold_id::text;
  IF FOUND THEN RETURN v_tx; END IF;

  -- Idempotency: return existing transaction if a debit already exists for this
  -- reservation (prevents duplicate debits from double-submit / race conditions)
  SELECT * INTO v_tx
  FROM public.wallet_transactions
  WHERE account_id = v_hold.account_id
    AND transaction_type = 'booking_debit'
    AND direction = 'debit'
    AND reference_type = 'reservation'
    AND reference_id = p_reservation_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.booking_wallet_holds
    SET status = 'COMPLETED', reservation_id = p_reservation_id, completed_at = now()
    WHERE id = p_hold_id;
    RETURN v_tx;
  END IF;

  IF v_hold.status <> 'PENDING' OR v_hold.expires_at <= now() THEN
    RAISE EXCEPTION 'booking hold is not active';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE account_id = v_hold.account_id
  FOR UPDATE;

  IF v_wallet.balance < v_hold.amount THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  UPDATE public.wallets
  SET balance = balance - v_hold.amount, updated_at = now()
  WHERE account_id = v_hold.account_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.wallet_transactions(
    account_id, transaction_type, amount, direction, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata
  ) VALUES (
    v_hold.account_id, 'booking_debit', v_hold.amount, 'debit', v_wallet.balance,
    'reservation', p_reservation_id, 'booking:' || p_hold_id::text,
    'Booking completed', coalesce(p_metadata, '{}'::jsonb)
  ) RETURNING * INTO v_tx;

  UPDATE public.booking_wallet_holds
  SET status = 'COMPLETED', reservation_id = p_reservation_id, completed_at = now()
  WHERE id = p_hold_id;

  RETURN v_tx;
END;
$$;
