export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          from_state: string | null
          id: number
          metadata: Json
          session_id: string | null
          to_state: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          from_state?: string | null
          id?: never
          metadata?: Json
          session_id?: string | null
          to_state?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          from_state?: string | null
          id?: never
          metadata?: Json
          session_id?: string | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          attempt_no: number
          confirmed_at: string | null
          court_id: string
          created_at: string
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          expires_at: string | null
          hold_id: string | null
          id: string
          idempotency_key: string
          price_thb: number
          requested_at: string
          session_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          venue_id: string
        }
        Insert: {
          attempt_no?: number
          confirmed_at?: string | null
          court_id: string
          created_at?: string
          decided_by?: string | null
          decision_reason?: string | null
          ends_at: string
          expires_at?: string | null
          hold_id?: string | null
          id?: string
          idempotency_key: string
          price_thb: number
          requested_at?: string
          session_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          venue_id: string
        }
        Update: {
          attempt_no?: number
          confirmed_at?: string | null
          court_id?: string
          created_at?: string
          decided_by?: string | null
          decision_reason?: string | null
          ends_at?: string
          expires_at?: string | null
          hold_id?: string | null
          id?: string
          idempotency_key?: string
          price_thb?: number
          requested_at?: string
          session_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "court_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      court_availability: {
        Row: {
          closes_at: string | null
          court_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["availability_kind"]
          opens_at: string | null
          reason: string | null
          starts_at: string | null
          weekday: number | null
        }
        Insert: {
          closes_at?: string | null
          court_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["availability_kind"]
          opens_at?: string | null
          reason?: string | null
          starts_at?: string | null
          weekday?: number | null
        }
        Update: {
          closes_at?: string | null
          court_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["availability_kind"]
          opens_at?: string | null
          reason?: string | null
          starts_at?: string | null
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "court_availability_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_availability_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      court_holds: {
        Row: {
          court_id: string
          created_at: string
          ends_at: string
          expires_at: string
          id: string
          idempotency_key: string
          released_reason: string | null
          session_id: string
          starts_at: string
          status: Database["public"]["Enums"]["hold_status"]
          updated_at: string
        }
        Insert: {
          court_id: string
          created_at?: string
          ends_at: string
          expires_at: string
          id?: string
          idempotency_key: string
          released_reason?: string | null
          session_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["hold_status"]
          updated_at?: string
        }
        Update: {
          court_id?: string
          created_at?: string
          ends_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          released_reason?: string | null
          session_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["hold_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_holds_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_holds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      court_price_rules: {
        Row: {
          court_id: string
          created_at: string
          ends_time: string
          id: string
          name: string
          price_thb: number
          priority: number
          starts_time: string
          valid_from: string | null
          valid_to: string | null
          weekdays: number[]
        }
        Insert: {
          court_id: string
          created_at?: string
          ends_time?: string
          id?: string
          name: string
          price_thb: number
          priority?: number
          starts_time?: string
          valid_from?: string | null
          valid_to?: string | null
          weekdays?: number[]
        }
        Update: {
          court_id?: string
          created_at?: string
          ends_time?: string
          id?: string
          name?: string
          price_thb?: number
          priority?: number
          starts_time?: string
          valid_from?: string | null
          valid_to?: string | null
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "court_price_rules_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      court_sports: {
        Row: {
          court_id: string
          sport_id: string
        }
        Insert: {
          court_id: string
          sport_id: string
        }
        Update: {
          court_id?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_sports_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          base_price_thb: number
          capacity: number
          created_at: string
          id: string
          is_active: boolean
          min_booking_minutes: number
          name: string
          notes: string | null
          slot_step_minutes: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          base_price_thb: number
          capacity?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_booking_minutes?: number
          name: string
          notes?: string | null
          slot_step_minutes?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          base_price_thb?: number
          capacity?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_booking_minutes?: number
          name?: string
          notes?: string | null
          slot_step_minutes?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_events: {
        Row: {
          created_at: string
          delta: number
          id: string
          reason: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          reason: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          kind: string
          read_at: string | null
          sent_at: string | null
          session_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          sent_at?: string | null
          session_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          sent_at?: string | null
          session_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_thb: number
          created_at: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string
          paid_at: string | null
          participant_id: string
          provider: string
          provider_ref: string | null
          session_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_thb: number
          created_at?: string
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          paid_at?: string | null
          participant_id: string
          provider?: string
          provider_ref?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_thb?: number
          created_at?: string
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          paid_at?: string | null
          participant_id?: string
          provider?: string
          provider_ref?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
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
      player_credit: {
        Row: {
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_credit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contacts: {
        Row: {
          created_at: string
          email: string | null
          line_user_id: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          line_user_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          line_user_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_thb: number
          created_at: string
          id: string
          idempotency_key: string
          payment_id: string
          policy_snapshot: Json | null
          processed_at: string | null
          provider_ref: string | null
          reason: string
          session_id: string
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_thb: number
          created_at?: string
          id?: string
          idempotency_key: string
          payment_id: string
          policy_snapshot?: Json | null
          processed_at?: string | null
          provider_ref?: string | null
          reason: string
          session_id: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_thb?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          payment_id?: string
          policy_snapshot?: Json | null
          processed_at?: string | null
          provider_ref?: string | null
          reason?: string
          session_id?: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participants: {
        Row: {
          added_by_organizer: string | null
          amount_due_thb: number
          cancelled_at: string | null
          checked_in_at: string | null
          confirmed_at: string | null
          created_at: string
          games_played: number | null
          guest_name: string | null
          id: string
          joined_at: string
          last_chased_at: string | null
          no_show_marked_at: string | null
          pay_later_granted_at: string | null
          pay_later_granted_by: string | null
          payment_due_at: string
          session_id: string
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          added_by_organizer?: string | null
          amount_due_thb: number
          cancelled_at?: string | null
          checked_in_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          games_played?: number | null
          guest_name?: string | null
          id?: string
          joined_at?: string
          last_chased_at?: string | null
          no_show_marked_at?: string | null
          pay_later_granted_at?: string | null
          pay_later_granted_by?: string | null
          payment_due_at: string
          session_id: string
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          added_by_organizer?: string | null
          amount_due_thb?: number
          cancelled_at?: string | null
          checked_in_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          games_played?: number | null
          guest_name?: string | null
          id?: string
          joined_at?: string
          last_chased_at?: string | null
          no_show_marked_at?: string | null
          pay_later_granted_at?: string | null
          pay_later_granted_by?: string | null
          payment_due_at?: string
          session_id?: string
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_added_by_organizer_fkey"
            columns: ["added_by_organizer"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_pay_later_granted_by_fkey"
            columns: ["pay_later_granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_venue_preferences: {
        Row: {
          approved: boolean
          court_id: string
          created_at: string
          id: string
          priority: number
          session_id: string
          venue_id: string
        }
        Insert: {
          approved?: boolean
          court_id: string
          created_at?: string
          id?: string
          priority: number
          session_id: string
          venue_id: string
        }
        Update: {
          approved?: boolean
          court_id?: string
          created_at?: string
          id?: string
          priority?: number
          session_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_venue_preferences_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_venue_preferences_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_venue_preferences_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          area_text: string
          booking_id: string | null
          budget_per_person_thb: number
          cancellation_policy: Json
          cancelled_at: string | null
          cancelled_reason: string | null
          created_at: string
          description: string | null
          district: string | null
          ends_at: string
          failure_reason: string | null
          id: string
          min_players: number
          organizer_id: string
          payment_deadline: string
          public_code: string | null
          settled_at: string | null
          settled_per_person_thb: number | null
          shuttle_cost_thb: number
          split_mode: Database["public"]["Enums"]["split_mode"]
          sport_id: string
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          target_players: number
          title: string
          updated_at: string
        }
        Insert: {
          area_text: string
          booking_id?: string | null
          budget_per_person_thb: number
          cancellation_policy?: Json
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          ends_at: string
          failure_reason?: string | null
          id?: string
          min_players: number
          organizer_id: string
          payment_deadline: string
          public_code?: string | null
          settled_at?: string | null
          settled_per_person_thb?: number | null
          shuttle_cost_thb?: number
          split_mode?: Database["public"]["Enums"]["split_mode"]
          sport_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          target_players: number
          title: string
          updated_at?: string
        }
        Update: {
          area_text?: string
          booking_id?: string | null
          budget_per_person_thb?: number
          cancellation_policy?: Json
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          ends_at?: string
          failure_reason?: string | null
          id?: string
          min_players?: number
          organizer_id?: string
          payment_deadline?: string
          public_code?: string | null
          settled_at?: string | null
          settled_per_person_thb?: number | null
          shuttle_cost_thb?: number
          split_mode?: Database["public"]["Enums"]["split_mode"]
          sport_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          target_players?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_booking_fk"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          default_players: number
          emoji: string
          id: string
          is_active: boolean
          name_en: string
          name_th: string
          slug: string
          sort_order: number
        }
        Insert: {
          default_players?: number
          emoji?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_th: string
          slug: string
          sort_order?: number
        }
        Update: {
          default_players?: number
          emoji?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_th?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      venue_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["venue_member_role"]
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["venue_member_role"]
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["venue_member_role"]
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_members_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string
          auto_confirm_bookings: boolean
          booking_lead_minutes: number
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          district: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          province: string
          slug: string
          updated_at: string
        }
        Insert: {
          address: string
          auto_confirm_bookings?: boolean
          booking_lead_minutes?: number
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          district: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          province?: string
          slug: string
          updated_at?: string
        }
        Update: {
          address?: string
          auto_confirm_bookings?: boolean
          booking_lead_minutes?: number
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          district?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          province?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          created_at: string
          id: string
          position: number
          promoted_at: string | null
          promotion_expires_at: string | null
          session_id: string
          status: Database["public"]["Enums"]["waitlist_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          promoted_at?: string | null
          promotion_expires_at?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          promoted_at?: string | null
          promotion_expires_at?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_guest_participant: {
        Args: {
          p_guest_name: string
          p_paid_cash: boolean
          p_session_id: string
        }
        Returns: Json
      }
      app_log: {
        Args: {
          p_action?: string
          p_actor?: string
          p_entity_id?: string
          p_entity_type?: string
          p_from?: string
          p_metadata?: Json
          p_session_id?: string
          p_to?: string
        }
        Returns: undefined
      }
      cancel_participation: {
        Args: {
          p_actor?: string
          p_idempotency_key: string
          p_participant_id: string
          p_policy_snapshot: Json
          p_reason: string
          p_refund_thb: number
        }
        Returns: Json
      }
      cancel_session: {
        Args: { p_actor?: string; p_reason: string; p_session_id: string }
        Returns: Json
      }
      complete_finished_sessions: { Args: never; Returns: Json }
      court_availability_report: {
        Args: { p_court_id: string; p_ends_at: string; p_starts_at: string }
        Returns: Json
      }
      court_has_conflict: {
        Args: {
          p_court_id: string
          p_ends_at: string
          p_ignore_booking?: string
          p_ignore_hold?: string
          p_starts_at: string
        }
        Returns: boolean
      }
      court_is_open: {
        Args: { p_court_id: string; p_ends_at: string; p_starts_at: string }
        Returns: boolean
      }
      court_price_for: {
        Args: { p_court_id: string; p_ends_at: string; p_starts_at: string }
        Returns: number
      }
      create_venue: {
        Args: {
          p_actor?: string
          p_address: string
          p_description?: string
          p_district: string
          p_name: string
          p_phone?: string
          p_province?: string
          p_slug: string
        }
        Returns: Json
      }
      expire_overdue_payments: { Args: never; Returns: Json }
      expire_stale_holds: { Args: never; Returns: Json }
      expire_waitlist_promotions: { Args: never; Returns: Json }
      fail_session_booking: {
        Args: { p_actor?: string; p_reason: string; p_session_id: string }
        Returns: Json
      }
      generate_session_code: { Args: never; Returns: string }
      grant_pay_later: { Args: { p_participant_id: string }; Returns: Json }
      is_booking_venue_member: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      is_court_venue_member: { Args: { p_court_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_session_organizer: { Args: { p_session_id: string }; Returns: boolean }
      is_session_participant: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      is_venue_member: { Args: { p_venue_id: string }; Returns: boolean }
      join_session: {
        Args: { p_actor?: string; p_session_id: string }
        Returns: Json
      }
      list_chaseable_participants: {
        Args: never
        Returns: {
          amount_due_thb: number
          checked_in_at: string
          ends_at: string
          last_chased_at: string
          line_user_id: string
          participant_id: string
          session_id: string
          session_title: string
          status: Database["public"]["Enums"]["participant_status"]
          user_id: string
        }[]
      }
      list_stranded_sessions: {
        Args: never
        Returns: {
          id: string
          paid_participants: number
          status: Database["public"]["Enums"]["session_status"]
        }[]
      }
      mark_no_shows: { Args: never; Returns: Json }
      mark_session_holding: {
        Args: { p_actor?: string; p_session_id: string }
        Returns: Json
      }
      notify_user: {
        Args: {
          p_action_url?: string
          p_body: string
          p_kind: string
          p_session_id: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      open_pay_later_payment: {
        Args: {
          p_idempotency_key: string
          p_participant_id: string
          p_provider?: string
        }
        Returns: Json
      }
      organizes_session_with: { Args: { p_user_id: string }; Returns: boolean }
      promote_waitlist: {
        Args: {
          p_actor?: string
          p_session_id: string
          p_window_minutes?: number
        }
        Returns: Json
      }
      record_chase: {
        Args: {
          p_body: string
          p_delta: number
          p_participant_id: string
          p_reason: string
          p_title: string
        }
        Returns: Json
      }
      release_hold: {
        Args: { p_actor?: string; p_hold_id: string; p_reason?: string }
        Returns: Json
      }
      remove_guest_participant: {
        Args: { p_participant_id: string }
        Returns: Json
      }
      request_booking: {
        Args: { p_actor?: string; p_hold_id: string; p_idempotency_key: string }
        Returns: Json
      }
      revoke_pay_later: { Args: { p_participant_id: string }; Returns: Json }
      session_has_public_booking: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      session_is_public: {
        Args: { p_status: Database["public"]["Enums"]["session_status"] }
        Returns: boolean
      }
      session_is_published: { Args: { p_session_id: string }; Returns: boolean }
      session_progress: { Args: { p_session_id: string }; Returns: Json }
      session_receipt_public: { Args: { p_session_id: string }; Returns: Json }
      set_check_in: {
        Args: { p_participant_id: string; p_present: boolean }
        Returns: Json
      }
      settle_payment: {
        Args: {
          p_actor?: string
          p_failure?: string
          p_payment_id: string
          p_provider_ref?: string
          p_succeeded: boolean
        }
        Returns: Json
      }
      settle_refund: {
        Args: {
          p_actor?: string
          p_provider_ref?: string
          p_refund_id: string
          p_succeeded: boolean
        }
        Returns: Json
      }
      settle_session_costs: {
        Args: {
          p_session_id: string
          p_shuttle_cost_thb: number
          p_split_mode: Database["public"]["Enums"]["split_mode"]
        }
        Returns: Json
      }
      shares_session_with: { Args: { p_user_id: string }; Returns: boolean }
      start_payment: {
        Args: {
          p_actor?: string
          p_idempotency_key: string
          p_participant_id: string
          p_provider?: string
        }
        Returns: Json
      }
      storage_owner_id: { Args: { p_name: string }; Returns: string }
      try_hold_court: {
        Args: {
          p_actor?: string
          p_court_id: string
          p_ends_at: string
          p_hold_minutes: number
          p_idempotency_key: string
          p_session_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      venue_decide_booking: {
        Args: {
          p_actor?: string
          p_approve: boolean
          p_booking_id: string
          p_reason?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "player" | "venue_admin" | "platform_admin"
      availability_kind: "opening_hours" | "blackout" | "manual_block"
      booking_status:
        | "requested"
        | "held"
        | "confirmed"
        | "rejected"
        | "expired"
        | "cancelled"
        | "failed"
      hold_status: "active" | "converted" | "released" | "expired"
      notification_channel: "in_app" | "line" | "email"
      participant_status:
        | "joined_pending_payment"
        | "paid_confirmed"
        | "cancelled"
        | "waitlisted"
        | "payment_expired"
        | "refunded"
        | "joined_pay_later"
        | "payment_overdue"
      payment_status: "pending" | "paid" | "failed" | "refunded" | "expired"
      refund_status: "pending" | "processing" | "completed" | "failed"
      session_status:
        | "draft"
        | "open"
        | "ready_to_book"
        | "holding_court"
        | "booked"
        | "booking_failed"
        | "cancelled"
        | "completed"
      split_mode: "equal" | "by_games"
      venue_member_role: "owner" | "manager" | "staff"
      waitlist_status:
        | "waiting"
        | "promoted"
        | "converted"
        | "expired"
        | "cancelled"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["player", "venue_admin", "platform_admin"],
      availability_kind: ["opening_hours", "blackout", "manual_block"],
      booking_status: [
        "requested",
        "held",
        "confirmed",
        "rejected",
        "expired",
        "cancelled",
        "failed",
      ],
      hold_status: ["active", "converted", "released", "expired"],
      notification_channel: ["in_app", "line", "email"],
      participant_status: [
        "joined_pending_payment",
        "paid_confirmed",
        "cancelled",
        "waitlisted",
        "payment_expired",
        "refunded",
        "joined_pay_later",
        "payment_overdue",
      ],
      payment_status: ["pending", "paid", "failed", "refunded", "expired"],
      refund_status: ["pending", "processing", "completed", "failed"],
      session_status: [
        "draft",
        "open",
        "ready_to_book",
        "holding_court",
        "booked",
        "booking_failed",
        "cancelled",
        "completed",
      ],
      split_mode: ["equal", "by_games"],
      venue_member_role: ["owner", "manager", "staff"],
      waitlist_status: [
        "waiting",
        "promoted",
        "converted",
        "expired",
        "cancelled",
      ],
    },
  },
} as const

