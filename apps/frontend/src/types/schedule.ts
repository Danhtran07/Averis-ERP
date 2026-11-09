export interface Shift {
  id: number;
  name: string;
  code: string;
  description: string | null;
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  early_checkin_minutes: number;
  checkin_close_minutes?: number;
  is_overnight: boolean;
  is_active: boolean;
  kind?: "DAY" | "EVENING" | "NIGHT";
}

export interface ShiftPayload {
  name: string;
  code: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  early_checkin_minutes: number;
  checkin_close_minutes?: number;
  is_active: boolean;
}

export interface ScheduleRule {
  id: number;
  day_of_week: number;
  shift: Shift | null;
}

export interface ScheduleRuleInput {
  day_of_week: number;
  shift_id: number | null;
}

export interface ScheduleCreatePayload {
  name: string;
  code: string;
  description?: string | null;
  is_active?: boolean;
  rules: ScheduleRuleInput[];
}

export interface ScheduleAssignmentPayload {
  employee_id: number;
  schedule_id: number;
  effective_from: string;
  effective_to?: string | null;
}

export interface ScheduleAssignmentResponse {
  id: number;
  employee_id: number;
  schedule_id: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  schedule?: WorkSchedule | null;
}

export interface WorkSchedule {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  rules: ScheduleRule[];
}

export interface EmployeeSchedule {
  employee_id: number;
  target_date: string;
  assignment_id: number | null;
  schedule: WorkSchedule | null;
  shift: Shift | null;
  is_overnight_continuation?: boolean;
}

export interface WeekDaySchedule {
  date: string;
  day_of_week: number;
  shift: Shift | null;
  is_off: boolean;
}

export interface EmployeeWeekSchedule {
  employee_id: number;
  start_date: string;
  days: WeekDaySchedule[];
}