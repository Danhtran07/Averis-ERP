export type SalaryType = "HOURLY" | "MONTHLY";

export interface Employee {
  id: number;
  employee_code: string;
  full_name: string;
  email: string;
  department: string | null;
  user_id: number;
  face_enrolled: boolean;
  salary_type?: SalaryType;
  base_salary?: number;
  hourly_rate?: number;
  allowance?: number;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeCreate {
  employee_code: string;
  full_name: string;
  email: string;
  department: string | null;
  user_id: number;
  salary_type?: SalaryType;
  base_salary?: number;
  hourly_rate?: number;
  allowance?: number;
}

export interface EmployeeUpdate {
  employee_code?: string;
  full_name?: string;
  email?: string;
  department?: string | null;
  user_id?: number;
  salary_type?: SalaryType;
  base_salary?: number;
  hourly_rate?: number;
  allowance?: number;
}