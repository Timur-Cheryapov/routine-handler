// Based on http://api.docs.platrum.ru/modules/tasks/

export interface PlatrumUser {
  user_id: string; // User ID
  user_name: string; // Full name (e.g., "Александр", "Владимир Корюкин")
  name: string; // Also contains full name
  user_email: string;
  is_disabled: boolean;
  is_deleted: boolean;
  avatar?: string | null;
  phone?: string | null;
  telegram?: string | null;
  hiring_date?: string;
  firing_date?: string | null;
  deletion_date?: string | null;
  is_owner?: boolean;
  has_limited_access?: boolean;
  birth_date?: string | null;
}

export interface PlatrumTask {
  id: number;
  name: string;
  description?: string | null;
  owner_user_id: string; // Постановщик
  responsible_user_ids: string[]; // Исполнители - array of string IDs
  auditors?: string[];
  watchers?: string[];
  status_key?: string;
  is_finished: boolean;
  is_planned?: boolean;
  board_panel_id?: number | null;
  start_date?: string | null; // ISO format "2025-12-02T20:59:59Z"
  finish_date?: string | null; // Deadline - ISO format "2025-12-02T20:59:59Z"
  creation_date?: string;
  close_date?: string | null;
  time_plan?: number;
  time_fact?: number;
  is_important?: boolean;
  is_recurrent?: boolean;
  is_daily?: boolean;
  deletion_date?: string | null;
  deleted_by_user_id?: string | null;
}

export interface EmployeeStats {
  user: PlatrumUser;
  overdueCount: number;
  noDeadlineCount: number;
}
