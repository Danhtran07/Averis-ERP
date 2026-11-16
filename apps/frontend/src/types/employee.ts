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
  cccd?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  permanent_address?: string | null;
  current_address?: string | null;
  emergency_contact?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeCreate {
  employee_code?: string;
  full_name: string;
  email: string;
  department: string | null;
  user_id: number;
  salary_type?: SalaryType;
  base_salary?: number;
  hourly_rate?: number;
  allowance?: number;
  cccd?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  permanent_address?: string | null;
  current_address?: string | null;
  emergency_contact?: string | null;
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
  cccd?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  permanent_address?: string | null;
  current_address?: string | null;
  emergency_contact?: string | null;
}