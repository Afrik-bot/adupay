export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      consents: {
        Row: {
          granted_at: string
          id: string
          purpose: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          purpose: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          purpose?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contribution_penalties: {
        Row: {
          amount: number
          charged_contribution_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          member_id: string
          status: string
        }
        Insert: {
          amount: number
          charged_contribution_id?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          id?: string
          member_id: string
          status?: string
        }
        Update: {
          amount?: number
          charged_contribution_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          cycle_id?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          id?: string
          member_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribution_penalties_charged_contribution_id_fkey"
            columns: ["charged_contribution_id"]
            isOneToOne: false
            referencedRelation: "contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_penalties_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_penalties_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_penalties_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_penalties_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          id: string
          member_id: string
          paid_by: string
          payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          id?: string
          member_id: string
          paid_by: string
          payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          cycle_id?: string
          id?: string
          member_id?: string
          paid_by?: string
          payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contributions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      cycles: {
        Row: {
          created_at: string
          due_date: string
          group_id: string
          id: string
          number: number
          recipient_id: string | null
          status: Database["public"]["Enums"]["cycle_status"]
        }
        Insert: {
          created_at?: string
          due_date: string
          group_id: string
          id?: string
          number: number
          recipient_id?: string | null
          status?: Database["public"]["Enums"]["cycle_status"]
        }
        Update: {
          created_at?: string
          due_date?: string
          group_id?: string
          id?: string
          number?: number
          recipient_id?: string | null
          status?: Database["public"]["Enums"]["cycle_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cycles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycles_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      directed_payment_schedules: {
        Row: {
          amount: number
          beneficiary_name: string
          card_brand: string | null
          card_last4: string | null
          card_token: string
          created_at: string
          frequency: string
          group_id: string | null
          id: string
          last_directed_payment_id: string | null
          next_run_on: string
          payee_id: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          reference: string | null
          sender_id: string
          source_currency: Database["public"]["Enums"]["currency_code"]
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          beneficiary_name: string
          card_brand?: string | null
          card_last4?: string | null
          card_token: string
          created_at?: string
          frequency: string
          group_id?: string | null
          id?: string
          last_directed_payment_id?: string | null
          next_run_on: string
          payee_id?: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          reference?: string | null
          sender_id: string
          source_currency: Database["public"]["Enums"]["currency_code"]
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          beneficiary_name?: string
          card_brand?: string | null
          card_last4?: string | null
          card_token?: string
          created_at?: string
          frequency?: string
          group_id?: string | null
          id?: string
          last_directed_payment_id?: string | null
          next_run_on?: string
          payee_id?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          reference?: string | null
          sender_id?: string
          source_currency?: Database["public"]["Enums"]["currency_code"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "directed_payment_schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directed_payment_schedules_last_directed_payment_id_fkey"
            columns: ["last_directed_payment_id"]
            isOneToOne: false
            referencedRelation: "directed_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directed_payment_schedules_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directed_payment_schedules_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      directed_payments: {
        Row: {
          all_in_pct: number | null
          amount: number
          beneficiary_name: string
          card_brand: string | null
          card_last4: string | null
          confirmed_at: string | null
          contribution_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          failure_code: string | null
          fee_amount: number
          fx_rate: number
          group_id: string | null
          id: string
          paid_at: string | null
          payee_id: string | null
          payment_id: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_at: string | null
          reference: string | null
          request_key: string | null
          schedule_id: string | null
          schedule_run_on: string | null
          sender_id: string
          share_token: string
          source_amount: number
          source_currency: Database["public"]["Enums"]["currency_code"]
          status: Database["public"]["Enums"]["directed_payment_status"]
        }
        Insert: {
          all_in_pct?: number | null
          amount: number
          beneficiary_name: string
          card_brand?: string | null
          card_last4?: string | null
          confirmed_at?: string | null
          contribution_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          failure_code?: string | null
          fee_amount: number
          fx_rate: number
          group_id?: string | null
          id?: string
          paid_at?: string | null
          payee_id?: string | null
          payment_id?: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_at?: string | null
          reference?: string | null
          request_key?: string | null
          schedule_id?: string | null
          schedule_run_on?: string | null
          sender_id: string
          share_token?: string
          source_amount: number
          source_currency: Database["public"]["Enums"]["currency_code"]
          status?: Database["public"]["Enums"]["directed_payment_status"]
        }
        Update: {
          all_in_pct?: number | null
          amount?: number
          beneficiary_name?: string
          card_brand?: string | null
          card_last4?: string | null
          confirmed_at?: string | null
          contribution_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          failure_code?: string | null
          fee_amount?: number
          fx_rate?: number
          group_id?: string | null
          id?: string
          paid_at?: string | null
          payee_id?: string | null
          payment_id?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          received_at?: string | null
          reference?: string | null
          request_key?: string | null
          schedule_id?: string | null
          schedule_run_on?: string | null
          sender_id?: string
          share_token?: string
          source_amount?: number
          source_currency?: Database["public"]["Enums"]["currency_code"]
          status?: Database["public"]["Enums"]["directed_payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "directed_payments_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directed_payments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directed_payments_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directed_payments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directed_payments_schedule_fk"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "directed_payment_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directed_payments_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"]
          fee_bps: number
          fx_margin_bps: number
          updated_at: string
          updated_by: string | null
          xof_per_unit: number
        }
        Insert: {
          currency: Database["public"]["Enums"]["currency_code"]
          fee_bps: number
          fx_margin_bps?: number
          updated_at?: string
          updated_by?: string | null
          xof_per_unit: number
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"]
          fee_bps?: number
          fx_margin_bps?: number
          updated_at?: string
          updated_by?: string | null
          xof_per_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          payout_position: number | null
          role: Database["public"]["Enums"]["member_role"]
          sponsored_member_id: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          payout_position?: number | null
          role?: Database["public"]["Enums"]["member_role"]
          sponsored_member_id?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          payout_position?: number | null
          role?: Database["public"]["Enums"]["member_role"]
          sponsored_member_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_sponsored_member_id_fkey"
            columns: ["sponsored_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_rule_proposals: {
        Row: {
          created_at: string
          decided_at: string | null
          grace_days: number
          group_id: string
          id: string
          late_penalty_amount: number
          proposed_by: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          grace_days: number
          group_id: string
          id?: string
          late_penalty_amount: number
          proposed_by: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          grace_days?: number
          group_id?: string
          id?: string
          late_penalty_amount?: number
          proposed_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_rule_proposals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_rule_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_rule_votes: {
        Row: {
          approve: boolean
          created_at: string
          proposal_id: string
          user_id: string
        }
        Insert: {
          approve: boolean
          created_at?: string
          proposal_id: string
          user_id: string
        }
        Update: {
          approve?: boolean
          created_at?: string
          proposal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_rule_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "group_rule_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_rule_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_rules: {
        Row: {
          grace_days: number
          group_id: string
          late_penalty_amount: number
          updated_at: string
          version: number
        }
        Insert: {
          grace_days?: number
          group_id: string
          late_penalty_amount?: number
          updated_at?: string
          version?: number
        }
        Update: {
          grace_days?: number
          group_id?: string
          late_penalty_amount?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          contribution_amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          frequency: Database["public"]["Enums"]["group_frequency"]
          id: string
          invite_code: string
          manager_id: string
          member_limit: number
          name: string
          payout_order: Database["public"]["Enums"]["payout_order"]
          start_date: string
          status: Database["public"]["Enums"]["group_status"]
        }
        Insert: {
          contribution_amount: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          frequency: Database["public"]["Enums"]["group_frequency"]
          id?: string
          invite_code?: string
          manager_id: string
          member_limit: number
          name: string
          payout_order?: Database["public"]["Enums"]["payout_order"]
          start_date: string
          status?: Database["public"]["Enums"]["group_status"]
        }
        Update: {
          contribution_amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          frequency?: Database["public"]["Enums"]["group_frequency"]
          id?: string
          invite_code?: string
          manager_id?: string
          member_limit?: number
          name?: string
          payout_order?: Database["public"]["Enums"]["payout_order"]
          start_date?: string
          status?: Database["public"]["Enums"]["group_status"]
        }
        Relationships: [
          {
            foreignKeyName: "groups_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyb_documents: {
        Row: {
          created_at: string
          document_path: string
          document_type: string
          id: string
          payee_id: string
          status: Database["public"]["Enums"]["review_status"]
        }
        Insert: {
          created_at?: string
          document_path: string
          document_type: string
          id?: string
          payee_id: string
          status?: Database["public"]["Enums"]["review_status"]
        }
        Update: {
          created_at?: string
          document_path?: string
          document_type?: string
          id?: string
          payee_id?: string
          status?: Database["public"]["Enums"]["review_status"]
        }
        Relationships: [
          {
            foreignKeyName: "kyb_documents_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_records: {
        Row: {
          created_at: string
          document_path: string | null
          document_type: string
          id: string
          id_number_hash: string | null
          id_number_last4: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["review_status"]
          tier_requested: number
          user_id: string
        }
        Insert: {
          created_at?: string
          document_path?: string | null
          document_type: string
          id?: string
          id_number_hash?: string | null
          id_number_last4?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          tier_requested: number
          user_id: string
        }
        Update: {
          created_at?: string
          document_path?: string | null
          document_type?: string
          id?: string
          id_number_hash?: string | null
          id_number_last4?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          tier_requested?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_records_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          allow_negative: boolean
          code: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          normal_side: Database["public"]["Enums"]["ledger_side"]
          owner_id: string | null
          owner_type: Database["public"]["Enums"]["ledger_owner_type"]
        }
        Insert: {
          allow_negative?: boolean
          code: string
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          normal_side: Database["public"]["Enums"]["ledger_side"]
          owner_id?: string | null
          owner_type: Database["public"]["Enums"]["ledger_owner_type"]
        }
        Update: {
          allow_negative?: boolean
          code?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          normal_side?: Database["public"]["Enums"]["ledger_side"]
          owner_id?: string | null
          owner_type?: Database["public"]["Enums"]["ledger_owner_type"]
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: number
          side: Database["public"]["Enums"]["ledger_side"]
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: never
          side: Database["public"]["Enums"]["ledger_side"]
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: never
          side?: Database["public"]["Enums"]["ledger_side"]
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          idempotency_key: string
          kind: string
          payment_id: string | null
          request_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          idempotency_key: string
          kind: string
          payment_id?: string | null
          request_hash?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          payment_id?: string | null
          request_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_payment_fk"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_accounts: {
        Row: {
          account_masked: string
          account_ref_hash: string
          account_token: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string | null
          provider: Database["public"]["Enums"]["wallet_provider"]
          user_id: string
          verified_at: string | null
        }
        Insert: {
          account_masked: string
          account_ref_hash: string
          account_token?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          provider: Database["public"]["Enums"]["wallet_provider"]
          user_id: string
          verified_at?: string | null
        }
        Update: {
          account_masked?: string
          account_ref_hash?: string
          account_token?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          provider?: Database["public"]["Enums"]["wallet_provider"]
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linked_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          claimed_at: string | null
          created_at: string
          dedupe_key: string | null
          delivery_status: string
          id: string
          last_error: string | null
          payload: Json
          provider_ref: string | null
          read_at: string | null
          sent_at: string | null
          template: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          delivery_status?: string
          id?: string
          last_error?: string | null
          payload?: Json
          provider_ref?: string | null
          read_at?: string | null
          sent_at?: string | null
          template: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          delivery_status?: string
          id?: string
          last_error?: string | null
          payload?: Json
          provider_ref?: string | null
          read_at?: string | null
          sent_at?: string | null
          template?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payees: {
        Row: {
          address: string | null
          category: Database["public"]["Enums"]["payee_category"]
          city: string
          contact_phone: string | null
          created_at: string
          id: string
          kyb_status: Database["public"]["Enums"]["review_status"]
          name: string
          owner_id: string | null
          payout_account_masked: string | null
          payout_account_token: string | null
          payout_provider: Database["public"]["Enums"]["wallet_provider"] | null
          rccm_number: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sanctions_status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category: Database["public"]["Enums"]["payee_category"]
          city: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          kyb_status?: Database["public"]["Enums"]["review_status"]
          name: string
          owner_id?: string | null
          payout_account_masked?: string | null
          payout_account_token?: string | null
          payout_provider?:
            | Database["public"]["Enums"]["wallet_provider"]
            | null
          rccm_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sanctions_status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: Database["public"]["Enums"]["payee_category"]
          city?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          kyb_status?: Database["public"]["Enums"]["review_status"]
          name?: string
          owner_id?: string | null
          payout_account_masked?: string | null
          payout_account_token?: string | null
          payout_provider?:
            | Database["public"]["Enums"]["wallet_provider"]
            | null
          rccm_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sanctions_status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payees_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payees_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["payment_direction"]
          failure_code: string | null
          id: string
          idempotency_key: string
          ledger_account_id: string
          provider: string
          provider_ref: string | null
          purpose_id: string | null
          purpose_type: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["payment_direction"]
          failure_code?: string | null
          id?: string
          idempotency_key: string
          ledger_account_id: string
          provider: string
          provider_ref?: string | null
          purpose_id?: string | null
          purpose_type?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          direction?: Database["public"]["Enums"]["payment_direction"]
          failure_code?: string | null
          id?: string
          idempotency_key?: string
          ledger_account_id?: string
          provider?: string
          provider_ref?: string | null
          purpose_id?: string | null
          purpose_type?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          attempts: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          id: string
          payment_id: string | null
          recipient_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          attempts?: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          id?: string
          payment_id?: string | null
          recipient_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          attempts?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          cycle_id?: string
          id?: string
          payment_id?: string | null
          recipient_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: true
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string | null
          country_code: string
          created_at: string
          full_name: string | null
          id: string
          kyc_tier: number
          locale: string
          onboarded_at: string | null
          phone: string | null
          sanctions_status: string
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"] | null
        }
        Insert: {
          city?: string | null
          country_code?: string
          created_at?: string
          full_name?: string | null
          id: string
          kyc_tier?: number
          locale?: string
          onboarded_at?: string | null
          phone?: string | null
          sanctions_status?: string
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"] | null
        }
        Update: {
          city?: string | null
          country_code?: string
          created_at?: string
          full_name?: string | null
          id?: string
          kyc_tier?: number
          locale?: string
          onboarded_at?: string | null
          phone?: string | null
          sanctions_status?: string
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"] | null
        }
        Relationships: []
      }
      risk_event_notes: {
        Row: {
          author_id: string
          created_at: string
          id: number
          note: string
          risk_event_id: string
          status_change: string | null
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: never
          note: string
          risk_event_id: string
          status_change?: string | null
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: never
          note?: string
          risk_event_id?: string
          status_change?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_event_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_event_notes_risk_event_id_fkey"
            columns: ["risk_event_id"]
            isOneToOne: false
            referencedRelation: "risk_events"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_events: {
        Row: {
          assigned_to: string | null
          created_at: string
          details: Json
          id: string
          kind: string
          payment_id: string | null
          severity: Database["public"]["Enums"]["risk_severity"]
          status: Database["public"]["Enums"]["risk_status"]
          subject_user_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind: string
          payment_id?: string | null
          severity?: Database["public"]["Enums"]["risk_severity"]
          status?: Database["public"]["Enums"]["risk_status"]
          subject_user_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          payment_id?: string | null
          severity?: Database["public"]["Enums"]["risk_severity"]
          status?: Database["public"]["Enums"]["risk_status"]
          subject_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_events_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_events_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctions_list: {
        Row: {
          added_at: string
          entity_type: string
          full_name: string
          id: string
          source: string
        }
        Insert: {
          added_at?: string
          entity_type?: string
          full_name: string
          id?: string
          source?: string
        }
        Update: {
          added_at?: string
          entity_type?: string
          full_name?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          archived_at: string | null
          auto_topup: boolean
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          kind: string
          lock_until: string | null
          name: string
          next_topup_on: string | null
          target_amount: number
          updated_at: string
          user_id: string
          weekly_topup_amount: number | null
        }
        Insert: {
          archived_at?: string | null
          auto_topup?: boolean
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          kind?: string
          lock_until?: string | null
          name: string
          next_topup_on?: string | null
          target_amount: number
          updated_at?: string
          user_id: string
          weekly_topup_amount?: number | null
        }
        Update: {
          archived_at?: string | null
          auto_topup?: boolean
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          kind?: string
          lock_until?: string | null
          name?: string
          next_topup_on?: string | null
          target_amount?: number
          updated_at?: string
          user_id?: string
          weekly_topup_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_balance: { Args: { p_account_id: string }; Returns: number }
      admin_kpis: {
        Args: never
        Returns: {
          active_tontines: number
          avg_all_in_pct: number
          contributions_on_time: number
          contributions_paid: number
          corridors: Json
          members_in_active: number
          open_risk_cases: number
          pending_kyb: number
          pending_kyc: number
        }[]
      }
      admin_search_payments: {
        Args: { p_limit?: number; p_query?: string; p_status?: string }
        Returns: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["payment_direction"]
          failure_code: string
          id: string
          provider_ref: string
          purpose_type: string
          status: Database["public"]["Enums"]["payment_status"]
          user_id: string
          user_name: string
          user_phone: string
        }[]
      }
      advance_goal_topup: {
        Args: { p_goal_id: string; p_ran_on: string }
        Returns: undefined
      }
      advance_schedule: {
        Args: {
          p_directed_payment_id: string
          p_ran_on: string
          p_schedule_id: string
        }
        Returns: undefined
      }
      attach_provider_ref: {
        Args: { p_payment_id: string; p_provider_ref: string }
        Returns: undefined
      }
      can_see_ledger_account: {
        Args: { p_account_id: string }
        Returns: boolean
      }
      can_see_ledger_transaction: {
        Args: { p_transaction_id: string }
        Returns: boolean
      }
      check_goal_payment: {
        Args: {
          p_direction: Database["public"]["Enums"]["payment_direction"]
          p_ledger_account_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      check_payout_sanctions: {
        Args: {
          p_direction: Database["public"]["Enums"]["payment_direction"]
          p_purpose_id: string
          p_purpose_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      claim_notifications: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          id: string
          locale: string
          payload: Json
          phone: string
          template: string
          user_id: string
        }[]
      }
      clear_sanctions_hit: {
        Args: { p_id: string; p_reason: string; p_subject: string }
        Returns: undefined
      }
      complete_notification: {
        Args: {
          p_error?: string
          p_id: string
          p_ok: boolean
          p_provider_ref?: string
        }
        Returns: undefined
      }
      confirm_directed_payment: {
        Args: { p_directed_payment_id: string }
        Returns: undefined
      }
      create_contribution: {
        Args: { p_cycle_id: string; p_member_id: string; p_paid_by: string }
        Returns: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          id: string
          member_id: string
          paid_by: string
          payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        SetofOptions: {
          from: "*"
          to: "contributions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_directed_payment: {
        Args: {
          p_amount_xof: number
          p_beneficiary_name: string
          p_card_brand: string
          p_card_last4: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_group_id: string
          p_payee_id: string
          p_purpose: Database["public"]["Enums"]["payment_purpose"]
          p_reference: string
          p_request_key: string
          p_schedule_id?: string
          p_schedule_run_on?: string
          p_sender_id: string
        }
        Returns: {
          all_in_pct: number | null
          amount: number
          beneficiary_name: string
          card_brand: string | null
          card_last4: string | null
          confirmed_at: string | null
          contribution_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          failure_code: string | null
          fee_amount: number
          fx_rate: number
          group_id: string | null
          id: string
          paid_at: string | null
          payee_id: string | null
          payment_id: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_at: string | null
          reference: string | null
          request_key: string | null
          schedule_id: string | null
          schedule_run_on: string | null
          sender_id: string
          share_token: string
          source_amount: number
          source_currency: Database["public"]["Enums"]["currency_code"]
          status: Database["public"]["Enums"]["directed_payment_status"]
        }
        SetofOptions: {
          from: "*"
          to: "directed_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_group: {
        Args: {
          p_contribution_amount: number
          p_frequency: Database["public"]["Enums"]["group_frequency"]
          p_grace_days: number
          p_late_penalty_amount: number
          p_member_limit: number
          p_name: string
          p_payout_order: Database["public"]["Enums"]["payout_order"]
          p_start_date: string
        }
        Returns: string
      }
      create_payment: {
        Args: {
          p_amount: number
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_direction: Database["public"]["Enums"]["payment_direction"]
          p_idempotency_key: string
          p_ledger_account_id: string
          p_provider: string
          p_purpose_id?: string
          p_purpose_type?: string
          p_user_id: string
        }
        Returns: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["payment_direction"]
          failure_code: string | null
          id: string
          idempotency_key: string
          ledger_account_id: string
          provider: string
          provider_ref: string | null
          purpose_id: string | null
          purpose_type: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_cycle: {
        Args: { p_group_id: string }
        Returns: {
          created_at: string
          due_date: string
          group_id: string
          id: string
          number: number
          recipient_id: string | null
          status: Database["public"]["Enums"]["cycle_status"]
        }
        SetofOptions: {
          from: "*"
          to: "cycles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cycle_collected: { Args: { p_cycle_id: string }; Returns: number }
      cycle_interval: {
        Args: { p_frequency: Database["public"]["Enums"]["group_frequency"] }
        Returns: string
      }
      cycle_step: {
        Args: { p_cycle_id: string; p_today: string }
        Returns: Json
      }
      cycle_unpaid: {
        Args: { p_cycle_id: string }
        Returns: {
          member_id: string
          notify_id: string
        }[]
      }
      daily_usage_xof: { Args: { p_user_id: string }; Returns: number }
      default_payment_account: {
        Args: { p_user_id: string }
        Returns: {
          account_token: string
          provider: Database["public"]["Enums"]["wallet_provider"]
        }[]
      }
      directed_payment_public: {
        Args: { p_share_token: string }
        Returns: {
          amount: number
          beneficiary_name: string
          confirmed_at: string
          created_at: string
          group_name: string
          paid_at: string
          payee_name: string
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_at: string
          reference_hint: string
          sender_first_name: string
          status: Database["public"]["Enums"]["directed_payment_status"]
        }[]
      }
      directed_payouts_due: {
        Args: never
        Returns: {
          amount: number
          attempt: number
          directed_payment_id: string
          payee_account_id: string
          payee_id: string
          payout_provider: Database["public"]["Enums"]["wallet_provider"]
          payout_token: string
        }[]
      }
      engine_cycles: {
        Args: never
        Returns: {
          created_at: string
          due_date: string
          group_id: string
          id: string
          number: number
          recipient_id: string | null
          status: Database["public"]["Enums"]["cycle_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "cycles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ensure_ledger_account: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_owner_id: string
          p_owner_type: Database["public"]["Enums"]["ledger_owner_type"]
        }
        Returns: string
      }
      finalize_cycle: {
        Args: { p_amount: number; p_cycle_id: string; p_payment_id: string }
        Returns: string
      }
      fx_quote: {
        Args: {
          p_amount_xof: number
          p_currency: Database["public"]["Enums"]["currency_code"]
        }
        Returns: {
          all_in_pct: number
          base_amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          customer_rate: number
          fee_amount: number
          fee_bps: number
          fx_margin_bps: number
          total_amount: number
          xof_per_unit: number
        }[]
      }
      goals_due_topup: {
        Args: { p_today: string }
        Returns: {
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          goal_id: string
          run_on: string
          user_id: string
        }[]
      }
      group_invite_members: {
        Args: { p_invite_code: string }
        Returns: {
          first_name: string
          user_id: string
        }[]
      }
      group_invite_preview: {
        Args: { p_invite_code: string }
        Returns: {
          already_member: boolean
          contribution_amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          frequency: Database["public"]["Enums"]["group_frequency"]
          group_id: string
          manager_name: string
          member_count: number
          member_limit: number
          name: string
          payout_order: Database["public"]["Enums"]["payout_order"]
          start_date: string
          status: Database["public"]["Enums"]["group_status"]
        }[]
      }
      group_ledger: {
        Args: { p_group_id: string; p_limit?: number }
        Returns: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_number: number
          entry_id: number
          kind: string
          member_name: string
          rail_reference: string
          side: Database["public"]["Enums"]["ledger_side"]
        }[]
      }
      group_members_status: {
        Args: { p_group_id: string }
        Returns: {
          full_name: string
          is_me: boolean
          is_recipient: boolean
          paid_current: boolean
          payout_position: number
          role: Database["public"]["Enums"]["member_role"]
          sponsored_member_id: string
          user_id: string
        }[]
      }
      group_rotation_size: { Args: { p_group_id: string }; Returns: number }
      group_statement: {
        Args: { p_group_id: string }
        Returns: {
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_number: number
          entry_type: string
          member_name: string
          occurred_at: string
          reference: string
          status: string
        }[]
      }
      group_unpaid_members: {
        Args: { p_group_id: string }
        Returns: {
          cycle_number: number
          days_late: number
          due_date: string
          full_name: string
          last_reminder_at: string
          member_id: string
          penalty_amount: number
          penalty_id: string
          penalty_status: string
        }[]
      }
      has_active_consent: { Args: { p_purpose: string }; Returns: boolean }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      join_group: { Args: { p_invite_code: string }; Returns: string }
      join_group_as_sponsor: {
        Args: { p_invite_code: string; p_member_id: string }
        Returns: string
      }
      kyc_daily_limit_xof: { Args: { p_tier: number }; Returns: number }
      manager_commission: { Args: { p_amount: number }; Returns: number }
      manager_groups: {
        Args: never
        Returns: {
          certified: boolean
          collection_rate: number
          commission_earned: number
          contribution_amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          current_cycle: number
          current_due: string
          cycles_done: number
          group_id: string
          late_count: number
          name: string
          paid_current: number
          proposed_penalties: number
          rotation: number
          status: Database["public"]["Enums"]["group_status"]
        }[]
      }
      mark_notifications_read: { Args: never; Returns: number }
      my_balances: {
        Args: never
        Returns: {
          balance: number
          currency: Database["public"]["Enums"]["currency_code"]
        }[]
      }
      my_goals: {
        Args: never
        Returns: {
          auto_topup: boolean
          balance: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          kind: string
          lock_until: string
          name: string
          next_topup_on: string
          target_amount: number
          weekly_topup_amount: number
        }[]
      }
      my_groups: {
        Args: never
        Returns: {
          contribution_amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          current_cycle: number
          frequency: Database["public"]["Enums"]["group_frequency"]
          group_id: string
          member_count: number
          my_position: number
          my_role: Database["public"]["Enums"]["member_role"]
          name: string
          next_due_date: string
          status: Database["public"]["Enums"]["group_status"]
        }[]
      }
      my_kyc_status: {
        Args: never
        Returns: {
          daily_limit_xof: number
          kyc_tier: number
          used_today_xof: number
        }[]
      }
      my_score_inputs: {
        Args: never
        Returns: {
          account_age_days: number
          contributions_on_time: number
          contributions_total: number
          cycles_completed: number
          savings_weeks: number
        }[]
      }
      my_sponsorships: {
        Args: never
        Returns: {
          contribution_amount: number
          cycle_number: number
          due_date: string
          group_id: string
          group_name: string
          group_status: Database["public"]["Enums"]["group_status"]
          member_id: string
          member_name: string
          paid: boolean
        }[]
      }
      my_upcoming_dues: {
        Args: never
        Returns: {
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          cycle_number: number
          due_date: string
          group_id: string
          group_name: string
          member_id: string
          paid: boolean
        }[]
      }
      normalize_name: { Args: { p_name: string }; Returns: string }
      owns_payee: { Args: { p_payee_id: string }; Returns: boolean }
      payee_incoming: {
        Args: {
          p_from?: string
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          amount: number
          beneficiary_name: string
          confirmed_at: string
          created_at: string
          id: string
          purpose: Database["public"]["Enums"]["payment_purpose"]
          received_at: string
          reference: string
          sender_country: string
          sender_first_name: string
          status: Database["public"]["Enums"]["directed_payment_status"]
        }[]
      }
      payments_to_reconcile: {
        Args: { p_limit?: number; p_provider: string; p_since: string }
        Returns: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["payment_direction"]
          failure_code: string | null
          id: string
          idempotency_key: string
          ledger_account_id: string
          provider: string
          provider_ref: string | null
          purpose_id: string | null
          purpose_type: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      payouts_to_retry: {
        Args: never
        Returns: {
          account_provider: Database["public"]["Enums"]["wallet_provider"]
          account_token: string
          amount: number
          attempts: number
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          payout_id: string
          pot_account_id: string
          recipient_id: string
        }[]
      }
      post_ledger_transaction: {
        Args: {
          p_created_by?: string
          p_description?: string
          p_entries: Json
          p_idempotency_key: string
          p_kind: string
          p_payment_id?: string
        }
        Returns: string
      }
      propose_group_rules: {
        Args: {
          p_grace_days: number
          p_group_id: string
          p_late_penalty_amount: number
        }
        Returns: string
      }
      purpose_categories: {
        Args: { p_purpose: Database["public"]["Enums"]["payment_purpose"] }
        Returns: Database["public"]["Enums"]["payee_category"][]
      }
      raise_risk_event: {
        Args: {
          p_details: Json
          p_kind: string
          p_payment_id: string
          p_severity: Database["public"]["Enums"]["risk_severity"]
          p_user_id: string
        }
        Returns: undefined
      }
      reconcile_payment: {
        Args: {
          p_failure_code?: string
          p_payment_id: string
          p_provider_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: string
      }
      record_limit_breach: {
        Args: {
          p_amount: number
          p_context: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_user_id: string
        }
        Returns: undefined
      }
      record_payout_retry: {
        Args: { p_payment_id: string; p_payout_id: string }
        Returns: undefined
      }
      require_group_manager: {
        Args: { p_group_id: string }
        Returns: {
          contribution_amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          frequency: Database["public"]["Enums"]["group_frequency"]
          id: string
          invite_code: string
          manager_id: string
          member_limit: number
          name: string
          payout_order: Database["public"]["Enums"]["payout_order"]
          start_date: string
          status: Database["public"]["Enums"]["group_status"]
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_kyc_record: {
        Args: {
          p_decision: Database["public"]["Enums"]["review_status"]
          p_reason?: string
          p_record_id: string
        }
        Returns: number
      }
      review_payee: {
        Args: { p_approve: boolean; p_payee_id: string; p_reason?: string }
        Returns: undefined
      }
      review_penalty: {
        Args: { p_confirm: boolean; p_penalty_id: string }
        Returns: undefined
      }
      sanctions_match: { Args: { p_name: string }; Returns: string }
      schedules_due: {
        Args: { p_today: string }
        Returns: {
          amount: number
          beneficiary_name: string
          card_brand: string | null
          card_last4: string | null
          card_token: string
          created_at: string
          frequency: string
          group_id: string | null
          id: string
          last_directed_payment_id: string | null
          next_run_on: string
          payee_id: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          reference: string | null
          sender_id: string
          source_currency: Database["public"]["Enums"]["currency_code"]
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "directed_payment_schedules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      score_inputs: {
        Args: { p_user_id: string }
        Returns: {
          account_age_days: number
          contributions_on_time: number
          contributions_total: number
          cycles_completed: number
          savings_weeks: number
        }[]
      }
      send_group_reminders: {
        Args: {
          p_channel: Database["public"]["Enums"]["notification_channel"]
          p_group_id: string
        }
        Returns: number
      }
      set_default_linked_account: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      set_fx_rate: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_fee_bps: number
          p_fx_margin_bps: number
          p_xof_per_unit: number
        }
        Returns: undefined
      }
      set_schedule_status: {
        Args: { p_schedule_id: string; p_status: string }
        Returns: undefined
      }
      settle_payment: {
        Args: {
          p_failure_code?: string
          p_payment_id: string
          p_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["payment_direction"]
          failure_code: string | null
          id: string
          idempotency_key: string
          ledger_account_id: string
          provider: string
          provider_ref: string | null
          purpose_id: string | null
          purpose_type: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_payment_by_ref: {
        Args: {
          p_failure_code?: string
          p_provider: string
          p_provider_ref: string
          p_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["payment_direction"]
          failure_code: string | null
          id: string
          idempotency_key: string
          ledger_account_id: string
          provider: string
          provider_ref: string | null
          purpose_id: string | null
          purpose_type: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_rule_proposal: { Args: { p_proposal_id: string }; Returns: string }
      shares_group_with: { Args: { p_user_id: string }; Returns: boolean }
      start_group: { Args: { p_group_id: string }; Returns: undefined }
      system_account: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_name: string
        }
        Returns: string
      }
      update_payee_contact: {
        Args: { p_address: string; p_contact_phone: string }
        Returns: undefined
      }
      update_risk_case: {
        Args: {
          p_note: string
          p_risk_event_id: string
          p_status: Database["public"]["Enums"]["risk_status"]
        }
        Returns: undefined
      }
      vote_group_rules: {
        Args: { p_approve: boolean; p_proposal_id: string }
        Returns: string
      }
      xof_equivalent: {
        Args: {
          p_amount: number
          p_currency: Database["public"]["Enums"]["currency_code"]
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "compliance" | "payee"
      currency_code: "XOF" | "EUR" | "USD" | "CAD"
      cycle_status: "open" | "collecting" | "paid_out" | "closed"
      directed_payment_status:
        | "initiated"
        | "paid"
        | "received"
        | "confirmed"
        | "failed"
      group_frequency: "weekly" | "biweekly" | "monthly"
      group_status: "draft" | "active" | "completed" | "cancelled"
      ledger_owner_type: "user" | "group" | "payee" | "system" | "savings_goal"
      ledger_side: "debit" | "credit"
      member_role: "manager" | "member" | "sponsor"
      notification_channel: "in_app" | "sms" | "whatsapp" | "ussd"
      payee_category: "school" | "clinic" | "pharmacy" | "utility" | "landlord"
      payment_direction: "collect" | "payout"
      payment_purpose: "school" | "health" | "bills" | "rent" | "tontine"
      payment_status: "pending" | "succeeded" | "failed"
      payout_order: "fixed" | "lottery" | "vote"
      review_status: "pending" | "approved" | "rejected"
      risk_severity: "low" | "medium" | "high"
      risk_status: "open" | "reviewing" | "closed" | "escalated"
      user_type: "resident" | "diaspora"
      wallet_provider:
        | "orange_money"
        | "mtn_momo"
        | "moov_money"
        | "wave"
        | "bank"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "compliance", "payee"],
      currency_code: ["XOF", "EUR", "USD", "CAD"],
      cycle_status: ["open", "collecting", "paid_out", "closed"],
      directed_payment_status: [
        "initiated",
        "paid",
        "received",
        "confirmed",
        "failed",
      ],
      group_frequency: ["weekly", "biweekly", "monthly"],
      group_status: ["draft", "active", "completed", "cancelled"],
      ledger_owner_type: ["user", "group", "payee", "system", "savings_goal"],
      ledger_side: ["debit", "credit"],
      member_role: ["manager", "member", "sponsor"],
      notification_channel: ["in_app", "sms", "whatsapp", "ussd"],
      payee_category: ["school", "clinic", "pharmacy", "utility", "landlord"],
      payment_direction: ["collect", "payout"],
      payment_purpose: ["school", "health", "bills", "rent", "tontine"],
      payment_status: ["pending", "succeeded", "failed"],
      payout_order: ["fixed", "lottery", "vote"],
      review_status: ["pending", "approved", "rejected"],
      risk_severity: ["low", "medium", "high"],
      risk_status: ["open", "reviewing", "closed", "escalated"],
      user_type: ["resident", "diaspora"],
      wallet_provider: [
        "orange_money",
        "mtn_momo",
        "moov_money",
        "wave",
        "bank",
      ],
    },
  },
} as const
