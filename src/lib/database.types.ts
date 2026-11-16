export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }
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
      group_blocks: {
        Row: {
          created_at: string
          group_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          group_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_blocks_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_blocks_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'member_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_blocks_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          join_code: string
          member_limit: number
          name: string
          next_seat: number
          next_task_number: number
          purpose: Database['public']['Enums']['group_purpose']
          purpose_note: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          join_code: string
          member_limit: number
          name: string
          next_seat?: number
          next_task_number?: number
          purpose: Database['public']['Enums']['group_purpose']
          purpose_note?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          join_code?: string
          member_limit?: number
          name?: string
          next_seat?: number
          next_task_number?: number
          purpose?: Database['public']['Enums']['group_purpose']
          purpose_note?: string | null
        }
        Relationships: []
      }
      logs: {
        Row: {
          action: Database['public']['Enums']['log_action']
          actor_id: string | null
          created_at: string
          group_id: string
          id: number
          meta: NonNullable<Json>
          target_member_id: string | null
          task_id: string | null
        }
        ComputedFields: never
        Insert: {
          action: Database['public']['Enums']['log_action']
          actor_id?: string | null
          created_at?: string
          group_id: string
          id?: never
          meta?: NonNullable<Json>
          target_member_id?: string | null
          task_id?: string | null
        }
        Update: {
          action?: Database['public']['Enums']['log_action']
          actor_id?: string | null
          created_at?: string
          group_id?: string
          id?: never
          meta?: NonNullable<Json>
          target_member_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'logs_actor_fkey'
            columns: ['actor_id', 'group_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id', 'group_id']
          },
          {
            foreignKeyName: 'logs_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'logs_target_member_fkey'
            columns: ['target_member_id', 'group_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id', 'group_id']
          },
          {
            foreignKeyName: 'logs_task_fkey'
            columns: ['task_id', 'group_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id', 'group_id']
          },
        ]
      }
      memberships: {
        Row: {
          display_name: string
          group_id: string
          id: string
          joined_at: string
          left_at: string | null
          left_reason: Database['public']['Enums']['leave_reason'] | null
          role: Database['public']['Enums']['member_role']
          seat: number
          status: Database['public']['Enums']['member_status']
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          display_name: string
          group_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          left_reason?: Database['public']['Enums']['leave_reason'] | null
          role?: Database['public']['Enums']['member_role']
          seat: number
          status?: Database['public']['Enums']['member_status']
          user_id?: string | null
        }
        Update: {
          display_name?: string
          group_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          left_reason?: Database['public']['Enums']['leave_reason'] | null
          role?: Database['public']['Enums']['member_role']
          seat?: number
          status?: Database['public']['Enums']['member_status']
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'memberships_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'member_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          group_id: string
          id: string
        }
        ComputedFields: never
        Insert: {
          author_id: string
          body: string
          created_at?: string
          group_id: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_author_fkey'
            columns: ['author_id', 'group_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id', 'group_id']
          },
          {
            foreignKeyName: 'messages_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          id: string
          last_active_at: string
          theme: string
          username: string
        }
        ComputedFields: never
        Insert: {
          avatar_path?: string | null
          created_at?: string
          id: string
          last_active_at?: string
          theme?: string
          username: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          id?: string
          last_active_at?: string
          theme?: string
          username?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        ComputedFields: never
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: 'rate_limits_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'member_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rate_limits_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deadline: string | null
          deleted_at: string | null
          details: string
          group_id: string
          id: string
          number: number
          open_questions: number
          status: Database['public']['Enums']['task_status']
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          assignee_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          deadline?: string | null
          deleted_at?: string | null
          details?: string
          group_id: string
          id?: string
          number: number
          open_questions?: number
          status?: Database['public']['Enums']['task_status']
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          deleted_at?: string | null
          details?: string
          group_id?: string
          id?: string
          number?: number
          open_questions?: number
          status?: Database['public']['Enums']['task_status']
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_assignee_fkey'
            columns: ['assignee_id', 'group_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id', 'group_id']
          },
          {
            foreignKeyName: 'tasks_created_by_fkey'
            columns: ['created_by', 'group_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id', 'group_id']
          },
          {
            foreignKeyName: 'tasks_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
        ]
      }
      thread_replies: {
        Row: {
          author_id: string
          body: string
          created_at: string
          group_id: string
          id: string
          thread_id: string
        }
        ComputedFields: never
        Insert: {
          author_id: string
          body: string
          created_at?: string
          group_id: string
          id?: string
          thread_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'thread_replies_author_fkey'
            columns: ['author_id', 'group_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id', 'group_id']
          },
          {
            foreignKeyName: 'thread_replies_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'thread_replies_thread_fkey'
            columns: ['thread_id', 'group_id']
            isOneToOne: false
            referencedRelation: 'threads'
            referencedColumns: ['id', 'group_id']
          },
        ]
      }
      threads: {
        Row: {
          body: string
          created_at: string
          group_id: string
          id: string
          opened_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database['public']['Enums']['thread_status']
          task_id: string
        }
        ComputedFields: never
        Insert: {
          body: string
          created_at?: string
          group_id: string
          id?: string
          opened_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database['public']['Enums']['thread_status']
          task_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          opened_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database['public']['Enums']['thread_status']
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'threads_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'threads_opened_by_fkey'
            columns: ['opened_by', 'group_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id', 'group_id']
          },
          {
            foreignKeyName: 'threads_resolved_by_fkey'
            columns: ['resolved_by', 'group_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id', 'group_id']
          },
          {
            foreignKeyName: 'threads_task_fkey'
            columns: ['task_id', 'group_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id', 'group_id']
          },
        ]
      }
    }
    Views: {
      member_profiles: {
        Row: {
          avatar_path: string | null
          id: string
          username: string
        }
        ComputedFields: never
        Insert: {
          avatar_path?: string | null
          id?: string | null
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          id?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_group: {
        Args: {
          p_join_code: string
          p_member_limit: number
          p_name: string
          p_purpose: Database['public']['Enums']['group_purpose']
          p_purpose_note: string
        }
        Returns: string
      }
      create_task: {
        Args: {
          p_assignee_id: string
          p_deadline: string
          p_details: string
          p_group_id: string
          p_title: string
        }
        Returns: {
          assignee_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deadline: string | null
          deleted_at: string | null
          details: string
          group_id: string
          id: string
          number: number
          open_questions: number
          status: Database['public']['Enums']['task_status']
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: '*'
          to: 'tasks'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_task: { Args: { p_task_id: string }; Returns: undefined }
      get_group_snapshot: { Args: { p_group_id: string }; Returns: Json }
      join_group: { Args: { p_join_code: string }; Returns: string }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      open_question: {
        Args: { p_body: string; p_task_id: string }
        Returns: {
          body: string
          created_at: string
          group_id: string
          id: string
          opened_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database['public']['Enums']['thread_status']
          task_id: string
        }
        SetofOptions: {
          from: '*'
          to: 'threads'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_member: { Args: { p_member_id: string; p_new_join_code?: string }; Returns: undefined }
      reply_to_question: {
        Args: { p_body: string; p_thread_id: string }
        Returns: {
          author_id: string
          body: string
          created_at: string
          group_id: string
          id: string
          thread_id: string
        }
        SetofOptions: {
          from: '*'
          to: 'thread_replies'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_message: {
        Args: { p_body: string; p_group_id: string }
        Returns: {
          author_id: string
          body: string
          created_at: string
          group_id: string
          id: string
        }
        SetofOptions: {
          from: '*'
          to: 'messages'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_question_resolved: {
        Args: { p_resolved: boolean; p_thread_id: string }
        Returns: {
          body: string
          created_at: string
          group_id: string
          id: string
          opened_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database['public']['Enums']['thread_status']
          task_id: string
        }
        SetofOptions: {
          from: '*'
          to: 'threads'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_task_status: {
        Args: { p_status: Database['public']['Enums']['task_status']; p_task_id: string }
        Returns: {
          assignee_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deadline: string | null
          deleted_at: string | null
          details: string
          group_id: string
          id: string
          number: number
          open_questions: number
          status: Database['public']['Enums']['task_status']
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: '*'
          to: 'tasks'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_theme: { Args: { p_theme: string }; Returns: undefined }
      take_over_tasks: {
        Args: { p_from_member_id: string; p_task_ids: string[] }
        Returns: number[]
      }
      touch_activity: { Args: Record<PropertyKey, never>; Returns: undefined }
      transfer_leadership: { Args: { p_member_id: string }; Returns: undefined }
      update_group: {
        Args: {
          p_group_id: string
          p_join_code: string
          p_member_limit: number
          p_name: string
          p_purpose: Database['public']['Enums']['group_purpose']
          p_purpose_note: string
        }
        Returns: undefined
      }
      update_task: {
        Args: {
          p_assignee_id: string
          p_deadline: string
          p_details: string
          p_task_id: string
          p_title: string
        }
        Returns: {
          assignee_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deadline: string | null
          deleted_at: string | null
          details: string
          group_id: string
          id: string
          number: number
          open_questions: number
          status: Database['public']['Enums']['task_status']
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: '*'
          to: 'tasks'
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      group_purpose: 'student_project' | 'work_team' | 'club_org' | 'other'
      leave_reason: 'left' | 'removed' | 'account_deleted'
      log_action:
        | 'group_created'
        | 'member_joined'
        | 'member_left'
        | 'member_removed'
        | 'leadership_transferred'
        | 'leadership_auto_transferred'
        | 'join_code_changed'
        | 'task_created'
        | 'task_edited'
        | 'task_reassigned'
        | 'task_deleted'
        | 'status_changed'
        | 'tasks_taken_over'
        | 'question_asked'
        | 'question_replied'
        | 'question_resolved'
        | 'question_reopened'
        | 'account_deleted'
      member_role: 'leader' | 'member'
      member_status: 'active' | 'former'
      task_status: 'todo' | 'in_progress' | 'done'
      thread_status: 'open' | 'resolved'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      group_purpose: ['student_project', 'work_team', 'club_org', 'other'],
      leave_reason: ['left', 'removed', 'account_deleted'],
      log_action: [
        'group_created',
        'member_joined',
        'member_left',
        'member_removed',
        'leadership_transferred',
        'leadership_auto_transferred',
        'join_code_changed',
        'task_created',
        'task_edited',
        'task_reassigned',
        'task_deleted',
        'status_changed',
        'tasks_taken_over',
        'question_asked',
        'question_replied',
        'question_resolved',
        'question_reopened',
        'account_deleted',
      ],
      member_role: ['leader', 'member'],
      member_status: ['active', 'former'],
      task_status: ['todo', 'in_progress', 'done'],
      thread_status: ['open', 'resolved'],
    },
  },
} as const
