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

export interface ScheduleAssignmentBatchPayload {
  employee_ids: number[];
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

export type ShiftRegistrationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ShiftRegistrationItem {
  date: string;
  shift_id: number | null;
  note?: string | null;
}

export interface ShiftRegistrationBatchSubmit {
  items: ShiftRegistrationItem[];
}

export interface ShiftRegistrationEmployeeBrief {
  id: number;
  employee_code: string;
  full_name: string;
  department: string | null;
}

export interface ShiftRegistrationResponse {
  id: number;
  employee_id: number;
  shift_id: number | null;
  date: string;
  status: ShiftRegistrationStatus;
  note: string | null;
  admin_note: string | null;
  shift: Shift | null;
  employee?: ShiftRegistrationEmployeeBrief | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftRegistrationReviewRequest {
  registration_ids: number[];
  status: "APPROVED" | "REJECTED";
  admin_note?: string | null;
}

export interface CoworkerScheduleItem {
  id: number;
  employee_code: string;
  full_name: string;
  department: string | null;
  shift: Shift;
}

export interface DepartmentCoworkersResponse {
  target_date: string;
  department: string | null;
  coworkers: CoworkerScheduleItem[];
}

export interface DepartmentRosterDayShift {
  date: string;
  shift: Shift | null;
  is_off: boolean;
  registration_status?: string | null;
  note?: string | null;
}

export interface DepartmentRosterMember {
  id: number;
  employee_code: string;
  full_name: string;
  department: string | null;
  salary_type: string;
  is_self: boolean;
  schedule: DepartmentRosterDayShift[];
}

export interface DepartmentWeekRosterResponse {
  week_start: string;
  week_end: string;
  department: string | null;
  days: string[];
  members: DepartmentRosterMember[];
}

