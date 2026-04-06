export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      ops_mission_proposals: {
        Row: {
          id: string
          title: string
          description: string | null
          source: 'api' | 'trigger' | 'reaction' | 'agent'
          proposer_agent: string | null
          step_kind: string
          step_payload: Json
          status: 'pending' | 'accepted' | 'rejected'
          rejection_reason: string | null
          created_at: string
          processed_at: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          source: 'api' | 'trigger' | 'reaction' | 'agent'
          proposer_agent?: string | null
          step_kind: string
          step_payload?: Json
          status?: 'pending' | 'accepted' | 'rejected'
          rejection_reason?: string | null
          created_at?: string
          processed_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          source?: 'api' | 'trigger' | 'reaction' | 'agent'
          proposer_agent?: string | null
          step_kind?: string
          step_payload?: Json
          status?: 'pending' | 'accepted' | 'rejected'
          rejection_reason?: string | null
          created_at?: string
          processed_at?: string | null
        }
      }
      ops_missions: {
        Row: {
          id: string
          proposal_id: string | null
          title: string
          status: 'approved' | 'running' | 'succeeded' | 'failed'
          created_at: string
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          proposal_id?: string | null
          title: string
          status?: 'approved' | 'running' | 'succeeded' | 'failed'
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          proposal_id?: string | null
          title?: string
          status?: 'approved' | 'running' | 'succeeded' | 'failed'
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
      }
      ops_mission_steps: {
        Row: {
          id: string
          mission_id: string
          step_kind: string
          step_payload: Json
          status: 'queued' | 'running' | 'succeeded' | 'failed'
          reserved_at: string | null
          reserved_by: string | null
          started_at: string | null
          completed_at: string | null
          result: Json | null
          last_error: string | null
          retry_count: number
          created_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          step_kind: string
          step_payload?: Json
          status?: 'queued' | 'running' | 'succeeded' | 'failed'
          reserved_at?: string | null
          reserved_by?: string | null
          started_at?: string | null
          completed_at?: string | null
          result?: Json | null
          last_error?: string | null
          retry_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          mission_id?: string
          step_kind?: string
          step_payload?: Json
          status?: 'queued' | 'running' | 'succeeded' | 'failed'
          reserved_at?: string | null
          reserved_by?: string | null
          started_at?: string | null
          completed_at?: string | null
          result?: Json | null
          last_error?: string | null
          retry_count?: number
          created_at?: string
        }
      }
      ops_agent_events: {
        Row: {
          id: string
          event_type: string
          agent_name: string | null
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          event_type: string
          agent_name?: string | null
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          event_type?: string
          agent_name?: string | null
          payload?: Json
          created_at?: string
        }
      }
      ops_policy: {
        Row: {
          key: string
          value: Json
          description: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value?: Json
          description?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          description?: string | null
          updated_at?: string
        }
      }
      ops_trigger_rules: {
        Row: {
          id: string
          name: string
          condition: Json
          proposal_template: Json
          cooldown_minutes: number
          last_fired_at: string | null
          enabled: boolean
        }
        Insert: {
          id?: string
          name: string
          condition: Json
          proposal_template: Json
          cooldown_minutes?: number
          last_fired_at?: string | null
          enabled?: boolean
        }
        Update: {
          id?: string
          name?: string
          condition?: Json
          proposal_template?: Json
          cooldown_minutes?: number
          last_fired_at?: string | null
          enabled?: boolean
        }
      }
      ops_agent_reactions: {
        Row: {
          id: string
          source_agent: string
          target_agent: string
          reaction_type: string
          payload: Json
          status: 'queued' | 'processing' | 'completed'
          created_at: string
          processed_at: string | null
        }
        Insert: {
          id?: string
          source_agent: string
          target_agent: string
          reaction_type: string
          payload?: Json
          status?: 'queued' | 'processing' | 'completed'
          created_at?: string
          processed_at?: string | null
        }
        Update: {
          id?: string
          source_agent?: string
          target_agent?: string
          reaction_type?: string
          payload?: Json
          status?: 'queued' | 'processing' | 'completed'
          created_at?: string
          processed_at?: string | null
        }
      }
      ops_action_runs: {
        Row: {
          id: string
          step_id: string | null
          agent_name: string | null
          action: string
          input: Json | null
          output: Json | null
          error: string | null
          duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          step_id?: string | null
          agent_name?: string | null
          action: string
          input?: Json | null
          output?: Json | null
          error?: string | null
          duration_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          step_id?: string | null
          agent_name?: string | null
          action?: string
          input?: Json | null
          output?: Json | null
          error?: string | null
          duration_ms?: number | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}