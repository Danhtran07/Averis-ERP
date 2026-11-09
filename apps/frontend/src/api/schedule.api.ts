import apiClient from "./client";
import type {
  EmployeeSchedule,
  EmployeeWeekSchedule,
  ScheduleAssignmentPayload,
  ScheduleAssignmentResponse,
  ScheduleCreatePayload,
  Shift,
  ShiftPayload,
  WorkSchedule,
} from "../types/schedule";

export async function getShifts(): Promise<Shift[]> {
  const response = await apiClient.get<Shift[]>("/api/shifts");
  return response.data;
}

export async function createShift(payload: ShiftPayload): Promise<Shift> {
  const response = await apiClient.post<Shift>("/api/shifts", payload);
  return response.data;
}

export async function updateShift(
  shiftId: number,
  payload: Partial<ShiftPayload>
): Promise<Shift> {
  const response = await apiClient.put<Shift>(`/api/shifts/${shiftId}`, payload);
  return response.data;
}

export async function deactivateShift(shiftId: number): Promise<Shift> {
  const response = await apiClient.delete<Shift>(`/api/shifts/${shiftId}`);
  return response.data;
}

export async function getSchedules(): Promise<WorkSchedule[]> {
  const response = await apiClient.get<WorkSchedule[]>("/api/schedules");
  return response.data;
}

export async function createSchedule(payload: ScheduleCreatePayload): Promise<WorkSchedule> {
  const response = await apiClient.post<WorkSchedule>("/api/schedules", payload);
  return response.data;
}

export async function assignSchedule(
  payload: ScheduleAssignmentPayload
): Promise<ScheduleAssignmentResponse> {
  const response = await apiClient.post<ScheduleAssignmentResponse>(
    "/api/schedule-assignments",
    payload
  );
  return response.data;
}

export async function getEmployeeSchedule(
  employeeId: number,
  targetDate: string,
): Promise<EmployeeSchedule> {
  const response = await apiClient.get<EmployeeSchedule>(
    `/api/employees/${employeeId}/schedule`,
    { params: { target_date: targetDate } },
  );
  return response.data;
}

export async function getMySchedule(targetDate: string): Promise<EmployeeSchedule> {
  const response = await apiClient.get<EmployeeSchedule>(
    "/api/schedules/me",
    { params: { target_date: targetDate } },
  );
  return response.data;
}

export async function getMyWeekSchedule(startDate?: string): Promise<EmployeeWeekSchedule> {
  const response = await apiClient.get<EmployeeWeekSchedule>(
    "/api/schedules/me/week",
    { params: startDate ? { start_date: startDate } : undefined },
  );
  return response.data;
}