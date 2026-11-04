-- Phase 10, part 1: each savings goal gets its own ledger account.
-- On its own migration because a new enum value cannot be used in the same
-- transaction that adds it.
alter type public.ledger_owner_type add value if not exists 'savings_goal';
