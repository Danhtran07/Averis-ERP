import apiClient from "./client";
import type {
  DepartmentCoworkersResponse,
  DepartmentWeekRosterResponse,
  EmployeeSchedule,
  EmployeeWeekSchedule,
  ScheduleAssignmentBatchPayload,
  ScheduleAssignmentPayload,
  ScheduleAssignmentResponse,
  ScheduleCreatePayload,
  Shift,
  ShiftPayload,
  ShiftRegistrationBatchSubmit,
  ShiftRegistrationResponse,
  ShiftRegistrationReviewRequest,
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

export async function deleteShift(shiftId: number): Promise<Shift> {
  const response = await apiClient.delete<Shift>(`/api/shifts/${shiftId}`, {
    params: { permanent: true },
  });
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

export async function updateSchedule(
  scheduleId: number,
  payload: Partial<ScheduleCreatePayload>
): Promise<WorkSchedule> {
  const response = await apiClient.put<WorkSchedule>(`/api/schedules/${scheduleId}`, payload);
  return response.data;
}

export async function deleteSchedule(scheduleId: number): Promise<WorkSchedule> {
  const response = await apiClient.delete<WorkSchedule>(`/api/schedules/${scheduleId}`);
  return response.data;
}

export async function getScheduleAssignments(): Promise<ScheduleAssignmentResponse[]> {
  const response = await apiClient.get<ScheduleAssignmentResponse[]>("/api/schedule-assignments");
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

export async function assignScheduleBatch(
  payload: ScheduleAssignmentBatchPayload
): Promise<ScheduleAssignmentResponse[]> {
  const response = await apiClient.post<ScheduleAssignmentResponse[]>(
    "/api/schedule-assignments/batch",
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

export async function submitShiftRegistrations(
  payload: ShiftRegistrationBatchSubmit
): Promise<ShiftRegistrationResponse[]> {
  const response = await apiClient.post<ShiftRegistrationResponse[]>(
    "/api/schedules/registrations",
    payload
  );
  return response.data;
}

export async function getMyShiftRegistrations(
  startDate?: string,
  endDate?: string
): Promise<ShiftRegistrationResponse[]> {
  const response = await apiClient.get<ShiftRegistrationResponse[]>(
    "/api/schedules/registrations/me",
    {
      params: {
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
      },
    }
  );
  return response.data;
}

export async function getShiftRegistrations(params?: {
  startDate?: string;
  endDate?: string;
  employeeId?: number;
  status?: string;
}): Promise<ShiftRegistrationResponse[]> {
  const response = await apiClient.get<ShiftRegistrationResponse[]>(
    "/api/schedules/registrations",
    {
      params: {
        ...(params?.startDate ? { start_date: params.startDate } : {}),
        ...(params?.endDate ? { end_date: params.endDate } : {}),
        ...(params?.employeeId ? { employee_id: params.employeeId } : {}),
        ...(params?.status ? { status: params.status } : {}),
      },
    }
  );
  return response.data;
}

export async function reviewShiftRegistrations(
  payload: ShiftRegistrationReviewRequest
): Promise<ShiftRegistrationResponse[]> {
  const response = await apiClient.post<ShiftRegistrationResponse[]>(
    "/api/schedules/registrations/review",
    payload
  );
  return response.data;
}

export async function deleteShiftRegistration(registrationId: number): Promise<void> {
  await apiClient.delete(`/api/schedules/registrations/${registrationId}`);
}

export async function getDepartmentCoworkers(
  targetDate: string,
  employeeId?: number
): Promise<DepartmentCoworkersResponse> {
  const response = await apiClient.get<DepartmentCoworkersResponse>(
    "/api/schedules/coworkers",
    {
      params: {
        target_date: targetDate,
        ...(employeeId ? { employee_id: employeeId } : {}),
      },
    }
  );
  return response.data;
}

export async function getDepartmentWeekRoster(
  weekStart?: string,
  employeeId?: number
): Promise<DepartmentWeekRosterResponse> {
  const response = await apiClient.get<DepartmentWeekRosterResponse>(
    "/api/schedules/department-week-roster",
    {
      params: {
        ...(weekStart ? { week_start: weekStart } : {}),
        ...(employeeId ? { employee_id: employeeId } : {}),
      },
    }
  );
  return response.data;
}


