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
      directed_payments: {
        Row: {
          amount: number
          beneficiary_name: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          fee_amount: number
          fx_rate: number
          group_id: string | null
          id: string
          payee_id: string | null
          payment_id: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          reference: string | null
          sender_id: string
          source_amount: number
          source_currency: Database["public"]["Enums"]["currency_code"]
          status: Database["public"]["Enums"]["directed_payment_status"]
        }
        Insert: {
          amount: number
          beneficiary_name: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          fee_amount: number
          fx_rate: number
          group_id?: string | null
          id?: string
          payee_id?: string | null
          payment_id?: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          reference?: string | null
          sender_id: string
          source_amount: number
          source_currency: Database["public"]["Enums"]["currency_code"]
          status?: Database["public"]["Enums"]["directed_payment_status"]
        }
        Update: {
          amount?: number
          beneficiary_name?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          fee_amount?: number
          fx_rate?: number
          group_id?: string | null
          id?: string
          payee_id?: string | null
          payment_id?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          reference?: string | null
          sender_id?: string
          source_amount?: number
          source_currency?: Database["public"]["Enums"]["currency_code"]
          status?: Database["public"]["Enums"]["directed_payment_status"]
        }
        Relationships: [
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
            foreignKeyName: "directed_payments_sender_id_fkey"
            columns: ["sender_id"]
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
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          template: string
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          template: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
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
          payout_provider: Database["public"]["Enums"]["wallet_provider"] | null
          rccm_number: string | null
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
          payout_provider?:
            | Database["public"]["Enums"]["wallet_provider"]
            | null
          rccm_number?: string | null
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
          payout_provider?:
            | Database["public"]["Enums"]["wallet_provider"]
            | null
          rccm_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payees_owner_id_fkey"
            columns: ["owner_id"]
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
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          id: string
          payment_id: string | null
          recipient_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          cycle_id: string
          id?: string
          payment_id?: string | null
          recipient_id: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          cycle_id?: string
          id?: string
          payment_id?: string | null
          recipient_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
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
          phone: string | null
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
          phone?: string | null
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
          phone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"] | null
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          payment_id: string | null
          severity: Database["public"]["Enums"]["risk_severity"]
          status: Database["public"]["Enums"]["risk_status"]
          subject_user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind: string
          payment_id?: string | null
          severity?: Database["public"]["Enums"]["risk_severity"]
          status?: Database["public"]["Enums"]["risk_status"]
          subject_user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          payment_id?: string | null
          severity?: Database["public"]["Enums"]["risk_severity"]
          status?: Database["public"]["Enums"]["risk_status"]
          subject_user_id?: string | null
        }
        Relationships: [
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
      savings_goals: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          kind: string
          lock_until: string | null
          name: string
          target_amount: number
          user_id: string
          weekly_topup_amount: number | null
        }
        Insert: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          kind?: string
          lock_until?: string | null
          name: string
          target_amount: number
          user_id: string
          weekly_topup_amount?: number | null
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          kind?: string
          lock_until?: string | null
          name?: string
          target_amount?: number
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
      ensure_ledger_account: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_owner_id: string
          p_owner_type: Database["public"]["Enums"]["ledger_owner_type"]
        }
        Returns: string
      }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      my_balances: {
        Args: never
        Returns: {
          balance: number
          currency: Database["public"]["Enums"]["currency_code"]
        }[]
      }
      owns_payee: { Args: { p_payee_id: string }; Returns: boolean }
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
      shares_group_with: { Args: { p_user_id: string }; Returns: boolean }
      system_account: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_name: string
        }
        Returns: string
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
      ledger_owner_type: "user" | "group" | "payee" | "system"
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
      ledger_owner_type: ["user", "group", "payee", "system"],
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
