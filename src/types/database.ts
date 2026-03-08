// Database types generated from Supabase schema
// This will be updated once the database schema is created

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
      accounts: {
        Row: {
          id: string
          account_name: string
          email_domain: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_name: string
          email_domain: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_name?: string
          email_domain?: string
          created_at?: string
          updated_at?: string
        }
      }
      processes: {
        Row: {
          id: string
          process_name: string
          process_unique_id: string
          pm_process_id: number | null
          owner_username: string | null
          process_expert: string | null
          process_status: string | null
          process_owner_data: Json | null
          process_expert_data: Json | null
          input_processes: string[] | null
          output_processes: string[] | null
          canvas_position: Json | null
          metadata: Json | null
          regions: string[] | null
          is_cps230_tagged: boolean
          tags: string[] | null
          inputs: Json | null
          outputs: Json | null
          triggers: Json | null
          targets: Json | null
          modified_by: string
          modified_date: string
          created_at: string
          account_id: string | null
        }
        Insert: {
          id?: string
          process_name: string
          process_unique_id: string
          pm_process_id?: number | null
          owner_username?: string | null
          process_expert?: string | null
          process_status?: string | null
          process_owner_data?: Json | null
          process_expert_data?: Json | null
          input_processes?: string[] | null
          output_processes?: string[] | null
          canvas_position?: Json | null
          metadata?: Json | null
          regions?: string[] | null
          is_cps230_tagged?: boolean
          tags?: string[] | null
          inputs?: Json | null
          outputs?: Json | null
          triggers?: Json | null
          targets?: Json | null
          modified_by: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
        Update: {
          id?: string
          process_name?: string
          process_unique_id?: string
          pm_process_id?: number | null
          owner_username?: string | null
          process_expert?: string | null
          process_status?: string | null
          process_owner_data?: Json | null
          process_expert_data?: Json | null
          input_processes?: string[] | null
          output_processes?: string[] | null
          canvas_position?: Json | null
          metadata?: Json | null
          regions?: string[] | null
          is_cps230_tagged?: boolean
          tags?: string[] | null
          inputs?: Json | null
          outputs?: Json | null
          triggers?: Json | null
          targets?: Json | null
          modified_by?: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
      }
      systems: {
        Row: {
          id: string
          system_name: string
          system_id: string
          pm_tag_id: string | null
          description: string | null
          metadata: Json | null
          modified_by: string
          modified_date: string
          created_at: string
          account_id: string | null
        }
        Insert: {
          id?: string
          system_name: string
          system_id: string
          pm_tag_id?: string | null
          description?: string | null
          metadata?: Json | null
          modified_by: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
        Update: {
          id?: string
          system_name?: string
          system_id?: string
          pm_tag_id?: string | null
          description?: string | null
          metadata?: Json | null
          modified_by?: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
      }
      critical_operations: {
        Row: {
          id: string
          operation_name: string
          description: string | null
          system_id: string | null
          process_id: string | null
          color_code: string | null
          modified_by: string
          modified_date: string
          created_at: string
          account_id: string | null
        }
        Insert: {
          id?: string
          operation_name: string
          description?: string | null
          system_id?: string | null
          process_id?: string | null
          color_code?: string | null
          modified_by: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
        Update: {
          id?: string
          operation_name?: string
          description?: string | null
          system_id?: string | null
          process_id?: string | null
          color_code?: string | null
          modified_by?: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
      }
      controls: {
        Row: {
          id: string
          control_name: string
          description: string | null
          critical_operation_id: string | null
          process_id: string | null
          system_id: string | null
          regions: string[] | null
          control_type: string | null
          pm_control_id: string | null
          modified_by: string
          modified_date: string
          created_at: string
          account_id: string | null
        }
        Insert: {
          id?: string
          control_name: string
          description?: string | null
          critical_operation_id?: string | null
          process_id?: string | null
          system_id?: string | null
          regions?: string[] | null
          control_type?: string | null
          pm_control_id?: string | null
          modified_by: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
        Update: {
          id?: string
          control_name?: string
          description?: string | null
          critical_operation_id?: string | null
          process_id?: string | null
          system_id?: string | null
          regions?: string[] | null
          control_type?: string | null
          pm_control_id?: string | null
          modified_by?: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
      }
      process_controls: {
        Row: {
          id: string
          process_id: string
          control_id: string
          process_step: string | null
          activity_description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          process_id: string
          control_id: string
          process_step?: string | null
          activity_description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          process_id?: string
          control_id?: string
          process_step?: string | null
          activity_description?: string | null
          created_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          entra_id_object_id: string | null
          email: string
          full_name: string | null
          role: 'user' | 'business_analyst' | 'promaster'
          auth_type: 'azure_sso' | 'local'
          account_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entra_id_object_id?: string | null
          email: string
          full_name?: string | null
          role?: 'user' | 'business_analyst' | 'promaster'
          auth_type?: 'azure_sso' | 'local'
          account_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          entra_id_object_id?: string | null
          email?: string
          full_name?: string | null
          role?: 'user' | 'business_analyst' | 'promaster'
          auth_type?: 'azure_sso' | 'local'
          account_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      settings: {
        Row: {
          id: string
          key: string
          value: Json
          modified_by: string
          modified_date: string
          created_at: string
          account_id: string | null
        }
        Insert: {
          id?: string
          key: string
          value: Json
          modified_by: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
        Update: {
          id?: string
          key?: string
          value?: Json
          modified_by?: string
          modified_date?: string
          created_at?: string
          account_id?: string | null
        }
      }
      sync_history: {
        Row: {
          id: string
          sync_type: string
          status: string
          records_synced: number
          error_message: string | null
          initiated_by: string
          started_at: string
          completed_at: string | null
          account_id: string | null
          total_processes: number
          processed_count: number
          current_batch: number
          total_batches: number
          batch_size: number
          last_processed_index: number
          processed_pm_ids: number[]
          examined_pm_ids: number[]
        }
        Insert: {
          id?: string
          sync_type: string
          status: string
          records_synced?: number
          error_message?: string | null
          initiated_by: string
          started_at?: string
          completed_at?: string | null
          account_id?: string | null
          total_processes?: number
          processed_count?: number
          current_batch?: number
          total_batches?: number
          batch_size?: number
          last_processed_index?: number
          processed_pm_ids?: number[]
          examined_pm_ids?: number[]
        }
        Update: {
          id?: string
          sync_type?: string
          status?: string
          records_synced?: number
          error_message?: string | null
          initiated_by?: string
          started_at?: string
          completed_at?: string | null
          account_id?: string | null
          total_processes?: number
          processed_count?: number
          current_batch?: number
          total_batches?: number
          batch_size?: number
          last_processed_index?: number
          processed_pm_ids?: number[]
          examined_pm_ids?: number[]
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
      user_role: 'user' | 'business_analyst' | 'promaster'
    }
  }
}

export type UserRole = Database['public']['Enums']['user_role'];
export type Account = Database['public']['Tables']['accounts']['Row'];
export type Process = Database['public']['Tables']['processes']['Row'];
export type System = Database['public']['Tables']['systems']['Row'];
export type CriticalOperation = Database['public']['Tables']['critical_operations']['Row'];
export type Control = Database['public']['Tables']['controls']['Row'];
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type Setting = Database['public']['Tables']['settings']['Row'];
export type SyncHistory = Database['public']['Tables']['sync_history']['Row'];
