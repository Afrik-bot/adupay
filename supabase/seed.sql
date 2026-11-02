-- Demo data for local development and tests. Fictional people and phone numbers.
-- Payees are sample Abidjan businesses with invented names, except the two public
-- utilities (CIE, SODECI), which appear as payee categories only.

insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   '2250700000001', now(), '{"provider":"phone","providers":["phone"]}', '{"full_name":"Awa Koné"}', '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   '2250500000002', now(), '{"provider":"phone","providers":["phone"]}', '{"full_name":"Koffi Yao"}', '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   '33600000003', now(), '{"provider":"phone","providers":["phone"]}', '{"full_name":"Aminata Traoré"}', '', '', '', '', now(), now());

update public.profiles set user_type = 'resident', city = 'Abidjan', country_code = 'CI', kyc_tier = 1
 where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set user_type = 'resident', city = 'Abidjan', country_code = 'CI', kyc_tier = 0
 where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set user_type = 'diaspora', city = 'Paris', country_code = 'FR', kyc_tier = 1
 where id = '33333333-3333-4333-8333-333333333333';

-- Awa is also the demo admin.
insert into public.user_roles (user_id, role) values ('11111111-1111-4111-8111-111111111111', 'admin');

insert into public.groups (id, name, manager_id, contribution_amount, frequency, start_date, member_limit, payout_order, status, invite_code)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Tontine du marché d''Adjamé', '11111111-1111-4111-8111-111111111111',
   10000, 'weekly', current_date, 20, 'lottery', 'active', 'adjame2026'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Épargne Yopougon', '22222222-2222-4222-8222-222222222222',
   25000, 'monthly', current_date, 10, 'fixed', 'draft', 'yopougon26');

insert into public.group_rules (group_id, grace_days, late_penalty_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 2, 500),
  ('aaaaaaaa-0000-4000-8000-000000000002', 3, 1000);

insert into public.group_members (group_id, user_id, role, payout_position, sponsored_member_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'manager', 1, null),
  ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'member', 2, null),
  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'manager', 1, null),
  ('aaaaaaaa-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'sponsor', null, '22222222-2222-4222-8222-222222222222');

insert into public.cycles (group_id, number, due_date, recipient_id, status) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 1, current_date + 7, '11111111-1111-4111-8111-111111111111', 'collecting');

insert into public.payees (name, category, city, address, rccm_number, contact_phone, kyb_status, payout_provider, payout_account_masked) values
  ('École Sainte-Marie d''Abobo (démo)',   'school',   'Abidjan', 'Abobo',      'CI-ABJ-DEMO-0001', '2250700001001', 'approved', 'bank',         '•••• 4401'),
  ('Groupe scolaire Les Palmiers (démo)',  'school',   'Abidjan', 'Cocody',     'CI-ABJ-DEMO-0002', '2250700001002', 'approved', 'bank',         '•••• 4402'),
  ('Pharmacie du Plateau (démo)',          'pharmacy', 'Abidjan', 'Plateau',    'CI-ABJ-DEMO-0003', '2250700001003', 'approved', 'orange_money', '•••• 4403'),
  ('Pharmacie de Yopougon (démo)',         'pharmacy', 'Abidjan', 'Yopougon',   'CI-ABJ-DEMO-0004', '2250700001004', 'approved', 'wave',         '•••• 4404'),
  ('Clinique de Treichville (démo)',       'clinic',   'Abidjan', 'Treichville','CI-ABJ-DEMO-0005', '2250700001005', 'approved', 'bank',         '•••• 4405'),
  ('Centre médical de Marcory (démo)',     'clinic',   'Abidjan', 'Marcory',    'CI-ABJ-DEMO-0006', '2250700001006', 'approved', 'mtn_momo',     '•••• 4406'),
  ('CIE — électricité',                    'utility',  'Abidjan', null,         null,               null,            'approved', 'bank',         '•••• 4407'),
  ('SODECI — eau',                         'utility',  'Abidjan', null,         null,               null,            'approved', 'bank',         '•••• 4408');
