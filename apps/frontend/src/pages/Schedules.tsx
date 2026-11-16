import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MoonStar,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  UserCheck,
  UsersRound,
  X,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getApiErrorMessage } from "../api/error";
import { getEmployees } from "../api/employee.api";
import {
  assignScheduleBatch,
  createSchedule,
  createShift,
  deleteSchedule,
  deleteShift,
  getScheduleAssignments,
  getSchedules,
  getShiftRegistrations,
  getShifts,
  reviewShiftRegistrations,
  updateSchedule,
  updateShift,
} from "../api/schedule.api";
import type { Employee } from "../types/employee";
import type {
  ScheduleAssignmentResponse,
  Shift,
  ShiftPayload,
  ShiftRegistrationResponse,
  WorkSchedule,
} from "../types/schedule";
import { SHIFT_TEMPLATES, type ShiftTemplateId } from "../utils/shiftTemplates";

const days = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
];

type WorkConfigTab = "shifts" | "schedules" | "registrations";

function formatTime(value: string) {
  return value.slice(0, 5);
}

function formatShortDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

function getNextMondayString(): string {
  const dt = new Date();
  const jsDay = dt.getDay();
  const diff = jsDay === 0 ? 1 : 8 - jsDay;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function getThisMondayString(): string {
  const dt = new Date();
  const jsDay = dt.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function addWeeks(mondayStr: string, weeks: number): string {
  const dt = new Date(`${mondayStr}T12:00:00`);
  dt.setDate(dt.getDate() + weeks * 7);
  return dt.toISOString().slice(0, 10);
}

const DEPARTMENT_GROUP_ORDER = [
  "Phục vụ",
  "Bếp",
  "Pha chế",
  "Thu ngân",
  "Lễ tân",
  "Tiếp thực",
  "Quản lý",
];

function getDepartmentGroup(dept?: string | null): string {
  const raw = (dept || "").trim();
  if (!raw) return "Khác";
  const lower = raw.toLowerCase();
  if (lower.includes("phục vụ") || lower.includes("server")) return "Phục vụ";
  if (lower.includes("bếp") || lower.includes("kitchen")) return "Bếp";
  if (lower.includes("pha chế") || lower.includes("barista")) return "Pha chế";
  if (lower.includes("thu ngân") || lower.includes("cashier")) return "Thu ngân";
  if (lower.includes("lễ tân") || lower.includes("reception")) return "Lễ tân";
  if (lower.includes("tiếp thực") || lower.includes("runner")) return "Tiếp thực";
  if (lower.includes("quản lý") || lower.includes("manager")) return "Quản lý";
  return raw;
}

function getShiftDurationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return "";
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const hrs = mins / 60;
  return Number.isInteger(hrs) ? `${hrs} giờ` : `${hrs.toFixed(1)} giờ`;
}

function isOvernightShift(start: string, end: string): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
  return eh * 60 + em <= sh * 60 + sm;
}

function isWorkConfigTab(value: string | null): value is WorkConfigTab {
  return value === "shifts" || value === "schedules" || value === "registrations";
}

export default function Schedules() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: WorkConfigTab =
    location.pathname.startsWith("/shifts") || rawTab === "shifts"
      ? "shifts"
      : isWorkConfigTab(rawTab)
        ? rawTab
        : "schedules";

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<ScheduleAssignmentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [shiftActionError, setShiftActionError] = useState("");
  const [shiftSuccessMsg, setShiftSuccessMsg] = useState("");
  const [updatingShiftId, setUpdatingShiftId] = useState<number | null>(null);
  const [savingShift, setSavingShift] = useState(false);

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [confirmDeleteShift, setConfirmDeleteShift] = useState<Shift | null>(null);
  const [deletingShiftId, setDeletingShiftId] = useState<number | null>(null);

  const [shiftForm, setShiftForm] = useState({
    name: SHIFT_TEMPLATES.morning.name,
    code: SHIFT_TEMPLATES.morning.code,
    start_time: SHIFT_TEMPLATES.morning.start,
    end_time: SHIFT_TEMPLATES.morning.end,
    description: SHIFT_TEMPLATES.morning.description,
    late_tolerance_minutes: 15,
    early_checkin_minutes: 30,
    checkin_close_minutes: 90,
  });

  // Weekly schedule modal & delete state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WorkSchedule | null>(null);
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState<WorkSchedule | null>(null);
  const [deletingScheduleId, setDeletingScheduleId] = useState<number | null>(null);
  const [scheduleForm, setScheduleForm] = useState<{
    name: string;
    code: string;
    description: string;
    dayShifts: Record<number, string>;
  }>({
    name: "Lịch vận hành 7 ngày",
    code: "FNB-7DAY",
    description: "",
    dayShifts: {
      1: "",
      2: "",
      3: "",
      4: "",
      5: "",
      6: "",
      7: "",
    },
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [schedulePageSuccess, setSchedulePageSuccess] = useState("");

  // Multi-employee schedule assignment modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignDeptFilter, setAssignDeptFilter] = useState("");
  const [rosterDeptTab, setRosterDeptTab] = useState("ALL");
  const [assignForm, setAssignForm] = useState({
    schedule_id: "",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: "",
  });
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignError, setAssignError] = useState("");

  async function loadWorkConfig() {
    try {
      setLoading(true);
      setError("");
      const [shiftData, scheduleData, employeeData, assignmentData] = await Promise.all([
        getShifts(),
        getSchedules(),
        getEmployees().catch(() => [] as Employee[]),
        getScheduleAssignments().catch(() => [] as ScheduleAssignmentResponse[]),
      ]);
      setShifts(shiftData);
      setSchedules(scheduleData);
      setEmployees(employeeData);
      setAssignments(assignmentData);

      const defaultShift = shiftData.find((s) => s.is_active);
      if (defaultShift) {
        setScheduleForm((prev) => ({
          ...prev,
          dayShifts: {
            1: prev.dayShifts[1] || String(defaultShift.id),
            2: prev.dayShifts[2] || String(defaultShift.id),
            3: prev.dayShifts[3] || String(defaultShift.id),
            4: prev.dayShifts[4] || String(defaultShift.id),
            5: prev.dayShifts[5] || String(defaultShift.id),
            6: prev.dayShifts[6] || String(defaultShift.id),
            7: prev.dayShifts[7] || String(defaultShift.id),
          },
        }));
      }
      if (scheduleData.length > 0) {
        setAssignForm((prev) => ({
          ...prev,
          schedule_id: prev.schedule_id || String(scheduleData[0].id),
        }));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể tải danh sách ca và lịch làm việc."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkConfig();
  }, []);

  const activeCount = useMemo(
    () => shifts.filter((shift) => shift.is_active).length,
    [shifts]
  );
  const overnightCount = useMemo(
    () => shifts.filter((shift) => shift.is_overnight).length,
    [shifts]
  );

  // Shift registrations management state
  const [regWeekMonday, setRegWeekMonday] = useState(() => getNextMondayString());
  const [registrations, setRegistrations] = useState<ShiftRegistrationResponse[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [regStatusFilter, setRegStatusFilter] = useState<string>("ALL");
  const [regSearch, setRegSearch] = useState("");
  const [reviewingRegId, setReviewingRegId] = useState<number | null>(null);
  const [batchReviewing, setBatchReviewing] = useState(false);
  const [regActionMsg, setRegActionMsg] = useState("");

  const regWeekDates = useMemo(() => {
    return [0, 1, 2, 3, 4, 5, 6].map((offset) => {
      const d = new Date(`${regWeekMonday}T12:00:00`);
      d.setDate(d.getDate() + offset);
      return {
        date: d.toISOString().slice(0, 10),
        dayName: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"][offset],
        fullDayName: days[offset],
      };
    });
  }, [regWeekMonday]);

  const regWeekSunday = useMemo(() => regWeekDates[6].date, [regWeekDates]);
  const regWeekRangeLabel = useMemo(
    () => `${formatShortDate(regWeekMonday)} – ${formatShortDate(regWeekSunday)}`,
    [regWeekMonday, regWeekSunday]
  );

  async function loadRegistrations() {
    try {
      setLoadingRegistrations(true);
      const data = await getShiftRegistrations({
        startDate: regWeekMonday,
        endDate: regWeekSunday,
      });
      setRegistrations(data);
    } catch {
      // Non-blocking
    } finally {
      setLoadingRegistrations(false);
    }
  }

  useEffect(() => {
    void loadRegistrations();
  }, [regWeekMonday]);

  const pendingRegistrationsCount = useMemo(
    () => registrations.filter((r) => r.status === "PENDING").length,
    [registrations]
  );
  const approvedRegistrationsCount = useMemo(
    () => registrations.filter((r) => r.status === "APPROVED").length,
    [registrations]
  );

  const registeredEmployees = useMemo(() => {
    const regByEmp = new Map<number, Map<string, ShiftRegistrationResponse>>();
    for (const r of registrations) {
      if (!regByEmp.has(r.employee_id)) {
        regByEmp.set(r.employee_id, new Map());
      }
      regByEmp.get(r.employee_id)!.set(r.date, r);
    }

    const empList: {
      employee: Employee;
      regMap: Map<string, ShiftRegistrationResponse>;
      pendingCount: number;
      approvedCount: number;
      workingDaysCount: number;
    }[] = [];

    const kw = regSearch.trim().toLowerCase();

    for (const emp of employees) {
      const empRegs = regByEmp.get(emp.id);
      if (!empRegs || empRegs.size === 0) continue;

      if (kw) {
        const matches = [emp.employee_code, emp.full_name, emp.department || ""]
          .join(" ")
          .toLowerCase()
          .includes(kw);
        if (!matches) continue;
      }

      let pCount = 0;
      let aCount = 0;
      let wCount = 0;
      for (const [, reg] of empRegs) {
        if (reg.status === "PENDING") pCount++;
        if (reg.status === "APPROVED") aCount++;
        if (reg.shift_id !== null) wCount++;
      }

      if (regStatusFilter === "PENDING" && pCount === 0) continue;
      if (regStatusFilter === "APPROVED" && aCount === 0) continue;
      if (
        regStatusFilter === "REJECTED" &&
        !Array.from(empRegs.values()).some((r) => r.status === "REJECTED")
      )
        continue;

      empList.push({
        employee: emp,
        regMap: empRegs,
        pendingCount: pCount,
        approvedCount: aCount,
        workingDaysCount: wCount,
      });
    }

    return empList;
  }, [registrations, employees, regSearch, regStatusFilter]);

  async function handleReviewBatch(registrationIds: number[], newStatus: "APPROVED" | "REJECTED") {
    if (registrationIds.length === 0) return;
    try {
      setBatchReviewing(true);
      const reviewed = await reviewShiftRegistrations({
        registration_ids: registrationIds,
        status: newStatus,
      });
      const updatedMap = new Map(reviewed.map((r) => [r.id, r]));
      setRegistrations((prev) => prev.map((r) => updatedMap.get(r.id) || r));
      setRegActionMsg(
        newStatus === "APPROVED"
          ? `Đã phê duyệt ${registrationIds.length} ca làm việc.`
          : `Đã từ chối ${registrationIds.length} ca đăng ký.`
      );
      setTimeout(() => setRegActionMsg(""), 4000);
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể cập nhật trạng thái đơn đăng ký."));
    } finally {
      setBatchReviewing(false);
    }
  }

  async function handleReviewSingle(registrationId: number, newStatus: "APPROVED" | "REJECTED") {
    try {
      setReviewingRegId(registrationId);
      const reviewed = await reviewShiftRegistrations({
        registration_ids: [registrationId],
        status: newStatus,
      });
      const updatedMap = new Map(reviewed.map((r) => [r.id, r]));
      setRegistrations((prev) => prev.map((r) => updatedMap.get(r.id) || r));
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể cập nhật trạng thái đơn đăng ký."));
    } finally {
      setReviewingRegId(null);
    }
  }

  // Map each employee to their latest active assignment
  const assignmentByEmployeeId = useMemo(() => {
    const map = new Map<number, ScheduleAssignmentResponse>();
    for (const a of assignments) {
      if (a.is_active && !map.has(a.employee_id)) {
        map.set(a.employee_id, a);
      }
    }
    return map;
  }, [assignments]);

  // Map each schedule_id to assigned employees
  const employeesByScheduleId = useMemo(() => {
    const map = new Map<number, Employee[]>();
    for (const emp of employees) {
      const assign = assignmentByEmployeeId.get(emp.id);
      if (assign) {
        const list = map.get(assign.schedule_id) || [];
        list.push(emp);
        map.set(assign.schedule_id, list);
      }
    }
    return map;
  }, [employees, assignmentByEmployeeId]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((emp) => {
      if (emp.department?.trim()) set.add(emp.department.trim());
    });
    return Array.from(set).sort();
  }, [employees]);

  const groupedRosterEmployees = useMemo(() => {
    const groups = new Map<string, Employee[]>();
    employees.forEach((emp) => {
      const groupName = getDepartmentGroup(emp.department);
      const list = groups.get(groupName) || [];
      list.push(emp);
      groups.set(groupName, list);
    });

    return Array.from(groups.entries())
      .map(([group, list]) => ({ group, employees: list }))
      .sort((a, b) => {
        const idxA = DEPARTMENT_GROUP_ORDER.indexOf(a.group);
        const idxB = DEPARTMENT_GROUP_ORDER.indexOf(b.group);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.group.localeCompare(b.group, "vi");
      });
  }, [employees]);

  const assignFilteredEmployees = useMemo(() => {
    const kw = assignSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      if (assignDeptFilter === "UNASSIGNED") {
        if (assignmentByEmployeeId.has(emp.id)) return false;
      } else if (assignDeptFilter && (emp.department || "").trim() !== assignDeptFilter) {
        return false;
      }
      if (!kw) return true;
      return [emp.employee_code, emp.full_name, emp.department || ""]
        .join(" ")
        .toLowerCase()
        .includes(kw);
    });
  }, [employees, assignSearch, assignDeptFilter, assignmentByEmployeeId]);

  function selectTemplate(value: ShiftTemplateId) {
    const preset = SHIFT_TEMPLATES[value];
    setShiftForm((current) => ({
      ...current,
      name: preset.name,
      code: preset.code,
      start_time: preset.start,
      end_time: preset.end,
      description: preset.description,
    }));
  }

  function openCreateShiftModal() {
    setEditingShift(null);
    setCreateError("");
    setShiftForm({
      name: SHIFT_TEMPLATES.morning.name,
      code: SHIFT_TEMPLATES.morning.code,
      start_time: SHIFT_TEMPLATES.morning.start,
      end_time: SHIFT_TEMPLATES.morning.end,
      description: SHIFT_TEMPLATES.morning.description,
      late_tolerance_minutes: 15,
      early_checkin_minutes: 30,
      checkin_close_minutes: 90,
    });
    setShowShiftModal(true);
  }

  function openEditShiftModal(shift: Shift) {
    setEditingShift(shift);
    setCreateError("");
    setShiftForm({
      name: shift.name,
      code: shift.code,
      start_time: formatTime(shift.start_time),
      end_time: formatTime(shift.end_time),
      description: shift.description || "",
      late_tolerance_minutes: shift.late_tolerance_minutes ?? 15,
      early_checkin_minutes: shift.early_checkin_minutes ?? 30,
      checkin_close_minutes: shift.checkin_close_minutes ?? 90,
    });
    setShowShiftModal(true);
  }

  async function handleSaveShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    setSavingShift(true);
    const payload: ShiftPayload = {
      name: shiftForm.name.trim(),
      code: shiftForm.code.trim(),
      start_time: `${shiftForm.start_time}:00`,
      end_time: `${shiftForm.end_time}:00`,
      description: shiftForm.description.trim() || null,
      late_tolerance_minutes: Number(shiftForm.late_tolerance_minutes) || 0,
      early_checkin_minutes: Number(shiftForm.early_checkin_minutes) || 0,
      checkin_close_minutes: Number(shiftForm.checkin_close_minutes) || 0,
      is_active: editingShift ? editingShift.is_active : true,
    };

    try {
      if (editingShift) {
        const updated = await updateShift(editingShift.id, payload);
        setShifts((current) =>
          current
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
        );
        setShiftSuccessMsg(`Đã cập nhật ca "${updated.name}".`);
      } else {
        const created = await createShift(payload);
        setShifts((current) =>
          [...current, created].sort((a, b) => a.start_time.localeCompare(b.start_time))
        );
        setShiftSuccessMsg(`Đã tạo ca "${created.name}".`);
      }
      setShowShiftModal(false);
      setTimeout(() => setShiftSuccessMsg(""), 4000);
    } catch (err) {
      setCreateError(
        getApiErrorMessage(err, editingShift ? "Không thể cập nhật ca làm việc." : "Không thể tạo ca làm việc.")
      );
    } finally {
      setSavingShift(false);
    }
  }

  async function handleToggleShiftActive(shift: Shift) {
    setShiftActionError("");
    setUpdatingShiftId(shift.id);
    try {
      const updated = await updateShift(shift.id, { is_active: !shift.is_active });
      setShifts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setShiftSuccessMsg(
        updated.is_active
          ? `Đã kích hoạt lại ca "${updated.name}".`
          : `Đã tạm ngưng ca "${updated.name}".`
      );
      setTimeout(() => setShiftSuccessMsg(""), 3500);
    } catch (err) {
      setShiftActionError(getApiErrorMessage(err, "Không thể cập nhật trạng thái ca làm việc."));
    } finally {
      setUpdatingShiftId(null);
    }
  }

  async function handleConfirmDeleteShift() {
    if (!confirmDeleteShift) return;
    setShiftActionError("");
    setDeletingShiftId(confirmDeleteShift.id);
    try {
      await deleteShift(confirmDeleteShift.id);
      const deletedName = confirmDeleteShift.name;
      setShifts((current) => current.filter((item) => item.id !== confirmDeleteShift.id));
      setConfirmDeleteShift(null);
      setShiftSuccessMsg(`Đã xóa vĩnh viễn ca "${deletedName}".`);
      setTimeout(() => setShiftSuccessMsg(""), 4000);
    } catch (err) {
      setShiftActionError(getApiErrorMessage(err, "Không thể xóa ca làm việc."));
      setConfirmDeleteShift(null);
    } finally {
      setDeletingShiftId(null);
    }
  }

  function openCreateScheduleModal() {
    setEditingSchedule(null);
    setScheduleError("");
    const defaultShift = shifts.find((s) => s.is_active);
    const sid = defaultShift ? String(defaultShift.id) : "";
    setScheduleForm({
      name: "",
      code: "",
      description: "",
      dayShifts: { 1: sid, 2: sid, 3: sid, 4: sid, 5: sid, 6: sid, 7: sid },
    });
    setShowScheduleModal(true);
  }

  function openEditScheduleModal(sched: WorkSchedule) {
    setEditingSchedule(sched);
    setScheduleError("");
    const dayMap: Record<number, string> = { 1: "", 2: "", 3: "", 4: "", 5: "", 6: "", 7: "" };
    for (const r of sched.rules) {
      dayMap[r.day_of_week] = r.shift?.id ? String(r.shift.id) : "";
    }
    setScheduleForm({
      name: sched.name,
      code: sched.code,
      description: sched.description || "",
      dayShifts: dayMap,
    });
    setShowScheduleModal(true);
  }

  async function handleSaveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScheduleError("");
    setSavingSchedule(true);
    try {
      const rules = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        day_of_week: dayOfWeek,
        shift_id: scheduleForm.dayShifts[dayOfWeek]
          ? Number(scheduleForm.dayShifts[dayOfWeek])
          : null,
      }));
      if (editingSchedule) {
        const updated = await updateSchedule(editingSchedule.id, {
          name: scheduleForm.name.trim(),
          code: scheduleForm.code.trim(),
          description: scheduleForm.description.trim() || null,
          rules,
        });
        setSchedules((current) =>
          current.map((item) => (item.id === updated.id ? updated : item))
        );
        setSchedulePageSuccess(`Đã cập nhật lịch "${updated.name}".`);
      } else {
        const created = await createSchedule({
          name: scheduleForm.name.trim(),
          code: scheduleForm.code.trim(),
          description: scheduleForm.description.trim() || null,
          is_active: true,
          rules,
        });
        setSchedules((current) => [...current, created]);
        setAssignForm((prev) => ({
          ...prev,
          schedule_id: prev.schedule_id || String(created.id),
        }));
        setSchedulePageSuccess(`Đã tạo lịch "${created.name}".`);
      }
      setShowScheduleModal(false);
      setTimeout(() => setSchedulePageSuccess(""), 4000);
    } catch (err) {
      setScheduleError(
        getApiErrorMessage(
          err,
          editingSchedule ? "Không thể cập nhật lịch tuần." : "Không thể tạo lịch tuần."
        )
      );
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleConfirmDeleteSchedule() {
    if (!confirmDeleteSchedule) return;
    setDeletingScheduleId(confirmDeleteSchedule.id);
    try {
      await deleteSchedule(confirmDeleteSchedule.id);
      const deletedName = confirmDeleteSchedule.name;
      setSchedules((prev) => prev.filter((s) => s.id !== confirmDeleteSchedule.id));
      setAssignments((prev) => prev.filter((a) => a.schedule_id !== confirmDeleteSchedule.id));
      setConfirmDeleteSchedule(null);
      setSchedulePageSuccess(`Đã xóa lịch "${deletedName}".`);
      setTimeout(() => setSchedulePageSuccess(""), 4000);
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể xóa lịch làm việc."));
      setConfirmDeleteSchedule(null);
    } finally {
      setDeletingScheduleId(null);
    }
  }

  function openAssignModal(preselectedScheduleId?: number, preselectedEmpIds?: number[]) {
    setAssignError("");
    setAssignSearch("");
    setAssignDeptFilter("");
    const activeScheds = schedules.filter((s) => s.is_active);
    setAssignForm((prev) => ({
      ...prev,
      schedule_id: preselectedScheduleId
        ? String(preselectedScheduleId)
        : prev.schedule_id || (activeScheds[0] ? String(activeScheds[0].id) : ""),
    }));
    setSelectedEmployeeIds(preselectedEmpIds || []);
    setShowAssignModal(true);
  }

  function toggleEmployeeSelection(empId: number) {
    setSelectedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  }

  function selectAllFilteredEmployees() {
    const filteredIds = assignFilteredEmployees.map((e) => e.id);
    setSelectedEmployeeIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  }

  function clearFilteredEmployees() {
    const filteredSet = new Set(assignFilteredEmployees.map((e) => e.id));
    setSelectedEmployeeIds((prev) => prev.filter((id) => !filteredSet.has(id)));
  }

  async function handleBatchAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError("");
    if (!assignForm.schedule_id) {
      setAssignError("Vui lòng chọn lịch làm việc tuần.");
      return;
    }
    if (selectedEmployeeIds.length === 0) {
      setAssignError("Vui lòng chọn ít nhất 1 nhân viên.");
      return;
    }
    setSavingAssign(true);
    try {
      await assignScheduleBatch({
        employee_ids: selectedEmployeeIds,
        schedule_id: Number(assignForm.schedule_id),
        effective_from: assignForm.effective_from,
        effective_to: assignForm.effective_to || null,
      });
      const latestAssignments = await getScheduleAssignments();
      setAssignments(latestAssignments);
      const sched = schedules.find((s) => s.id === Number(assignForm.schedule_id));
      setSchedulePageSuccess(
        `Đã gán lịch "${sched?.name ?? ""}" cho ${selectedEmployeeIds.length} nhân viên từ ngày ${assignForm.effective_from}.`
      );
      setShowAssignModal(false);
      setTimeout(() => setSchedulePageSuccess(""), 4500);
    } catch (err) {
      setAssignError(getApiErrorMessage(err, "Không thể gán lịch cho nhân viên."));
    } finally {
      setSavingAssign(false);
    }
  }

  if (loading) return <LoadingState message="Đang tải cấu hình ca & lịch làm việc..." />;
  if (error) return <ErrorState message={error} onRetry={() => void loadWorkConfig()} />;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {tab === "shifts"
              ? "Ca làm việc"
              : tab === "registrations"
                ? "Đăng ký ca tuần tới"
                : "Lịch phân ca tuần"}
          </h1>

          {tab === "shifts" ? (
            <button
              type="button"
              onClick={openCreateShiftModal}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
            >
              <Plus size={16} />
              <span>Tạo ca mới</span>
            </button>
          ) : tab === "schedules" ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => openAssignModal()}
                disabled={schedules.length === 0 || employees.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50"
              >
                <UsersRound size={15} className="text-sky-600" />
                <span>Gán lịch hàng loạt</span>
              </button>
              <button
                type="button"
                onClick={openCreateScheduleModal}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
              >
                <Plus size={16} />
                <span>Tạo lịch tuần mới</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Top Segmented Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <Link
            to="/shifts"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tab === "shifts"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Clock3 size={15} />
            <span>Ca làm việc</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                tab === "shifts" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {shifts.length}
            </span>
          </Link>

          <Link
            to="/schedules"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tab === "schedules"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <CalendarDays size={15} />
            <span>Lịch phân ca tuần</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                tab === "schedules" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {schedules.length}
            </span>
          </Link>

          <Link
            to="/schedules?tab=registrations"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tab === "registrations"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <UserCheck size={15} />
            <span>Đăng ký ca tuần tới</span>
            {pendingRegistrationsCount > 0 && (
              <span className="rounded-full bg-amber-500 text-white px-2 py-0.2 text-[10px] font-bold">
                {pendingRegistrationsCount} chờ duyệt
              </span>
            )}
          </Link>
        </div>
      </header>

      {tab === "shifts" ? (
        <>
          {shiftSuccessMsg && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-2xs">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>{shiftSuccessMsg}</span>
            </div>
          )}

          {shiftActionError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {shiftActionError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Tổng số ca</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{shifts.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Đang hoạt động</div>
              <div className="mt-2 text-2xl font-bold text-emerald-700">{activeCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Ca qua đêm</div>
              <div className="mt-2 text-2xl font-bold text-indigo-700">{overnightCount}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            {shifts.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-slate-500">
                Chưa có ca làm việc nào. Nhấn "Tạo ca mới" để bắt đầu.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">Ca làm việc</th>
                      <th className="px-5 py-3.5">Khung giờ</th>
                      <th className="px-5 py-3.5">Quy định chấm công</th>
                      <th className="px-5 py-3.5 text-center">Trạng thái</th>
                      <th className="px-5 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shifts.map((shift) => {
                      const durationLabel = getShiftDurationLabel(
                        formatTime(shift.start_time),
                        formatTime(shift.end_time)
                      );
                      const isUpdating = updatingShiftId === shift.id;

                      return (
                        <tr
                          key={shift.id}
                          className={`transition hover:bg-slate-50/80 ${
                            !shift.is_active ? "bg-slate-50/40" : ""
                          }`}
                        >
                          {/* Shift Name & Code */}
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`font-semibold ${
                                  shift.is_active ? "text-slate-900" : "text-slate-500 line-through"
                                }`}
                              >
                                {shift.name}
                              </span>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">
                                {shift.code}
                              </span>
                              {shift.is_overnight && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                  <MoonStar size={11} />
                                  Qua đêm
                                </span>
                              )}
                            </div>
                            {shift.description && (
                              <p className="mt-1 text-xs text-slate-400">{shift.description}</p>
                            )}
                          </td>

                          {/* Time Window */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                              <Clock3 size={14} className="text-slate-400" />
                              <span>
                                {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                              </span>
                            </div>
                            {durationLabel && (
                              <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700">
                                {durationLabel}
                              </span>
                            )}
                          </td>

                          {/* Attendance Rules */}
                          <td className="px-5 py-4 text-xs text-slate-600">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>
                                Đi trễ tối đa: <strong className="text-slate-800">{shift.late_tolerance_minutes}p</strong>
                              </span>
                              <span className="text-slate-300">·</span>
                              <span>
                                Mở sớm: <strong className="text-slate-800">{shift.early_checkin_minutes}p</strong>
                              </span>
                              <span className="text-slate-300">·</span>
                              <span>
                                Đóng sau: <strong className="text-slate-800">{shift.checkin_close_minutes}p</strong>
                              </span>
                            </div>
                          </td>

                          {/* Active Status */}
                          <td className="px-5 py-4 text-center">
                            {shift.is_active ? (
                              <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                Đang bật
                              </span>
                            ) : (
                              <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                                Đang ngưng
                              </span>
                            )}
                          </td>

                          {/* Actions: Edit, Toggle Active, Delete */}
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditShiftModal(shift)}
                                title="Chỉnh sửa ca"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                              >
                                <Pencil size={13} />
                                <span>Sửa</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleToggleShiftActive(shift)}
                                disabled={isUpdating}
                                title={shift.is_active ? "Tạm ngưng ca" : "Kích hoạt lại ca"}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                                  shift.is_active
                                    ? "border-amber-200 bg-amber-50/70 text-amber-700 hover:bg-amber-100"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                <Power size={13} />
                                <span>{shift.is_active ? "Ngưng" : "Bật lại"}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmDeleteShift(shift)}
                                title="Xóa vĩnh viễn ca"
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                <Trash2 size={13} />
                                <span>Xóa</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* MODAL: CREATE / EDIT SHIFT */}
          {showShiftModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingShift ? "Chỉnh sửa ca làm việc" : "Tạo ca làm việc mới"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => !savingShift && setShowShiftModal(false)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                {!editingShift && (
                  <div className="mt-4">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Chọn nhanh mẫu ca
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.entries(SHIFT_TEMPLATES) as [ShiftTemplateId, (typeof SHIFT_TEMPLATES)[ShiftTemplateId]][]).map(
                        ([key, p]) => (
                          <button
                            key={p.code}
                            type="button"
                            onClick={() => selectTemplate(key)}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                          >
                            {p.name} ({p.start}–{p.end})
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {createError && (
                  <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                    {createError}
                  </div>
                )}

                <form onSubmit={handleSaveShift} className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Tên ca <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        maxLength={100}
                        value={shiftForm.name}
                        onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                        placeholder="Ca Sáng - Mở quầy"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mã ca <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        maxLength={50}
                        value={shiftForm.code}
                        onChange={(e) => setShiftForm({ ...shiftForm, code: e.target.value })}
                        placeholder="MORNING-OPEN"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Giờ bắt đầu <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        type="time"
                        value={shiftForm.start_time}
                        onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Giờ kết thúc <span className="text-rose-500">*</span>
                        </label>
                        {shiftForm.start_time && shiftForm.end_time && (
                          <span className="text-[11px] font-semibold text-sky-700">
                            {getShiftDurationLabel(shiftForm.start_time, shiftForm.end_time)}
                            {isOvernightShift(shiftForm.start_time, shiftForm.end_time) ? " · Qua đêm" : ""}
                          </span>
                        )}
                      </div>
                      <input
                        required
                        type="time"
                        value={shiftForm.end_time}
                        onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Cho phép trễ (phút)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={shiftForm.late_tolerance_minutes}
                        onChange={(e) =>
                          setShiftForm({ ...shiftForm, late_tolerance_minutes: Number(e.target.value) || 0 })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mở chấm trước (phút)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={shiftForm.early_checkin_minutes}
                        onChange={(e) =>
                          setShiftForm({ ...shiftForm, early_checkin_minutes: Number(e.target.value) || 0 })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Đóng chấm sau (phút)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={480}
                        value={shiftForm.checkin_close_minutes}
                        onChange={(e) =>
                          setShiftForm({ ...shiftForm, checkin_close_minutes: Number(e.target.value) || 0 })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mô tả
                    </label>
                    <input
                      value={shiftForm.description}
                      onChange={(e) => setShiftForm({ ...shiftForm, description: e.target.value })}
                      placeholder="Ghi chú thêm (tùy chọn)"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowShiftModal(false)}
                      disabled={savingShift}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={savingShift}
                      className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
                    >
                      {savingShift
                        ? "Đang lưu..."
                        : editingShift
                          ? "Lưu thay đổi"
                          : "Tạo ca làm việc"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL: CONFIRM DELETE SHIFT */}
          {confirmDeleteShift && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-base font-bold text-slate-900">Xác nhận xóa ca làm việc</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Bạn có chắc muốn xóa vĩnh viễn ca{" "}
                  <strong className="text-slate-900">{confirmDeleteShift.name}</strong> (
                  <code className="text-xs font-semibold">{confirmDeleteShift.code}</code>)?
                </p>
                <p className="mt-1.5 text-xs text-slate-400">
                  Lịch sử chấm công cũ của nhân viên vẫn được bảo toàn.
                </p>

                <div className="mt-5 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteShift(null)}
                    disabled={deletingShiftId !== null}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmDeleteShift()}
                    disabled={deletingShiftId !== null}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50"
                  >
                    {deletingShiftId !== null ? "Đang xóa..." : "Xóa vĩnh viễn"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : tab === "registrations" ? (
        <div className="space-y-6">
          {regActionMsg && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-2xs">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>{regActionMsg}</span>
            </div>
          )}

          {/* Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Nhân sự đã đăng ký
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {registeredEmployees.length}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Ca chờ duyệt
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-600">
                {pendingRegistrationsCount}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Ca đã duyệt
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-600">
                {approvedRegistrationsCount}
              </div>
            </div>
          </div>

          {/* Filter & Week Navigation Bar */}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
            {/* Week Navigator */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setRegWeekMonday((curr) => addWeeks(curr, -1))}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:shadow-xs transition"
                  title="Tuần trước"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 text-xs font-bold text-slate-800">
                  {regWeekRangeLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setRegWeekMonday((curr) => addWeeks(curr, 1))}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:shadow-xs transition"
                  title="Tuần sau"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setRegWeekMonday(getThisMondayString())}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Tuần này
              </button>

              <button
                type="button"
                onClick={() => setRegWeekMonday(getNextMondayString())}
                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100 transition"
              >
                Tuần tới
              </button>
            </div>

            {/* Search, Filter & 1-Click Batch Approve */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, mã NV..."
                  value={regSearch}
                  onChange={(e) => setRegSearch(e.target.value)}
                  className="w-48 rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={regStatusFilter}
                onChange={(e) => setRegStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="PENDING">Chờ duyệt ({pendingRegistrationsCount})</option>
                <option value="APPROVED">Đã duyệt ({approvedRegistrationsCount})</option>
                <option value="REJECTED">Từ chối</option>
              </select>

              <button
                type="button"
                disabled={pendingRegistrationsCount === 0 || batchReviewing}
                onClick={() => {
                  const allPendingIds = registrations
                    .filter((r) => r.status === "PENDING")
                    .map((r) => r.id);
                  void handleReviewBatch(allPendingIds, "APPROVED");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 transition disabled:opacity-40"
              >
                <Check size={14} />
                <span>
                  {batchReviewing
                    ? "Đang xử lý..."
                    : `Duyệt tất cả (${pendingRegistrationsCount} ca)`}
                </span>
              </button>
            </div>
          </div>

          {/* Registration Matrix Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            {loadingRegistrations ? (
              <div className="py-16 text-center text-xs text-slate-500">
                Đang tải danh sách đăng ký ca...
              </div>
            ) : registeredEmployees.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-500">
                Chưa có nhân viên nào gửi đăng ký ca cho tuần này ({regWeekRangeLabel}).
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-400">
                    <tr>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[180px]">Nhân sự</th>
                      {regWeekDates.map((day) => (
                        <th key={day.date} className="px-3 py-3.5 text-center whitespace-nowrap min-w-[120px]">
                          <div>{day.dayName}</div>
                          <div className="text-[10px] text-slate-400">{formatShortDate(day.date)}</div>
                        </th>
                      ))}
                      <th className="px-3 py-3.5 text-center whitespace-nowrap">Tổng ca</th>
                      <th className="px-4 py-3.5 text-right whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {registeredEmployees.map(({ employee: emp, regMap, pendingCount, workingDaysCount }) => {
                      const empPendingIds = Array.from(regMap.values())
                        .filter((r) => r.status === "PENDING")
                        .map((r) => r.id);

                      return (
                        <tr key={emp.id} className="transition hover:bg-slate-50/60">
                          {/* Employee Profile */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700 text-xs">
                                {emp.full_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{emp.full_name}</div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <span className="font-mono">{emp.employee_code}</span>
                                  {emp.department && (
                                    <>
                                      <span>·</span>
                                      <span>{emp.department}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 7 Days Matrix */}
                          {regWeekDates.map((day) => {
                            const reg = regMap.get(day.date);
                            if (!reg) {
                              return (
                                <td key={day.date} className="px-2 py-3 text-center text-slate-300">
                                  —
                                </td>
                              );
                            }

                            const isOff = reg.shift_id === null;
                            const shift = reg.shift;
                            const isPending = reg.status === "PENDING";
                            const isApproved = reg.status === "APPROVED";

                            return (
                              <td key={day.date} className="px-2 py-3 text-center">
                                <div
                                  className={`group relative inline-flex flex-col items-center justify-center rounded-xl p-2 w-full transition border ${
                                    isApproved
                                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                                      : isPending
                                        ? "border-amber-200 bg-amber-50/70 text-amber-950"
                                        : "border-rose-200 bg-rose-50/70 text-rose-950"
                                  }`}
                                >
                                  <span className="text-xs font-bold line-clamp-1">
                                    {isOff ? "Nghỉ ca" : shift?.name || "Ca làm"}
                                  </span>
                                  {!isOff && shift && (
                                    <span className="text-[10px] font-medium opacity-75">
                                      {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                                    </span>
                                  )}
                                  <div className="mt-1 flex items-center gap-1">
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${
                                        isApproved
                                          ? "bg-emerald-500"
                                          : isPending
                                            ? "bg-amber-500 animate-pulse"
                                            : "bg-rose-500"
                                      }`}
                                    />
                                    <span className="text-[9px] font-semibold opacity-80">
                                      {isApproved ? "Đã duyệt" : isPending ? "Chờ duyệt" : "Từ chối"}
                                    </span>
                                  </div>

                                  {reg.note && (
                                    <div className="mt-1 text-[9px] text-slate-500 italic truncate max-w-[100px]" title={reg.note}>
                                      "{reg.note}"
                                    </div>
                                  )}

                                  {/* Quick 1-click day approval toggle */}
                                  {isPending && (
                                    <div className="mt-1.5 flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={reviewingRegId === reg.id}
                                        onClick={() => void handleReviewSingle(reg.id, "APPROVED")}
                                        className="rounded p-1 bg-white hover:bg-emerald-100 text-emerald-700 shadow-2xs transition"
                                        title="Duyệt ca này"
                                      >
                                        <Check size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={reviewingRegId === reg.id}
                                        onClick={() => void handleReviewSingle(reg.id, "REJECTED")}
                                        className="rounded p-1 bg-white hover:bg-rose-100 text-rose-700 shadow-2xs transition"
                                        title="Từ chối ca này"
                                      >
                                        <X size={11} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}

                          {/* Total shifts */}
                          <td className="px-3 py-3.5 text-center font-bold text-slate-800 whitespace-nowrap">
                            {workingDaysCount} ca
                          </td>

                          {/* Employee Row Actions */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {pendingCount > 0 ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={batchReviewing}
                                  onClick={() => void handleReviewBatch(empPendingIds, "APPROVED")}
                                  className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                                >
                                  Duyệt ({pendingCount})
                                </button>
                                <button
                                  type="button"
                                  disabled={batchReviewing}
                                  onClick={() => void handleReviewBatch(empPendingIds, "REJECTED")}
                                  className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                                >
                                  Từ chối
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">Đã xử lý</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {schedulePageSuccess && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-2xs">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>{schedulePageSuccess}</span>
            </div>
          )}

          {/* OVERVIEW STATS */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Số lịch làm việc
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{schedules.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Nhân sự đã phân lịch
              </div>
              <div className="mt-2 text-2xl font-bold text-sky-700">
                {assignmentByEmployeeId.size} / {employees.length}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Chưa có lịch tuần
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-600">
                {Math.max(0, employees.length - assignmentByEmployeeId.size)}
              </div>
            </div>
          </div>

          {/* 2-COLUMN WORKSPACE: LEFT = ROSTER BY DEPARTMENT, RIGHT = COMPACT SCHEDULE TEMPLATES */}
          <div className="grid items-start gap-5 xl:grid-cols-[1.45fr_1fr]">
            {/* LEFT: EMPLOYEE ROSTER OVERVIEW */}
            <div className="order-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs xl:order-1">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-5 pt-4 pb-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-sm font-bold text-slate-900">
                    Danh sách phân công nhân sự ({employees.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      if (rosterDeptTab === "ALL") {
                        openAssignModal();
                      } else {
                        const groupEmps =
                          groupedRosterEmployees.find((g) => g.group === rosterDeptTab)
                            ?.employees || [];
                        openAssignModal(
                          undefined,
                          groupEmps.map((e) => e.id)
                        );
                      }
                    }}
                    disabled={schedules.length === 0 || employees.length === 0}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-800 disabled:opacity-40"
                  >
                    <UsersRound size={14} />
                    <span>
                      {rosterDeptTab === "ALL"
                        ? "Gán lịch hàng loạt"
                        : `Gán lịch nhóm ${rosterDeptTab}`}
                    </span>
                  </button>
                </div>

                {groupedRosterEmployees.length > 0 && (
                  <div className="-mb-px flex flex-wrap items-center gap-5">
                    <button
                      type="button"
                      onClick={() => setRosterDeptTab("ALL")}
                      className={`border-b-2 pb-2.5 text-xs font-semibold transition ${
                        rosterDeptTab === "ALL"
                          ? "border-sky-600 text-sky-700"
                          : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Tất cả <span className="ml-0.5 text-slate-400">({employees.length})</span>
                    </button>
                    {groupedRosterEmployees.map(({ group, employees: groupEmps }) => {
                      const active = rosterDeptTab === group;
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => setRosterDeptTab(group)}
                          className={`border-b-2 pb-2.5 text-xs font-semibold transition ${
                            active
                              ? "border-sky-600 text-sky-700"
                              : "border-transparent text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {group}{" "}
                          <span
                            className={`ml-0.5 ${active ? "text-sky-500" : "text-slate-400"}`}
                          >
                            ({groupEmps.length})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-100/80 text-xs font-bold text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Nhân sự</th>
                      <th className="px-4 py-3">Vị trí / Quầy</th>
                      <th className="px-4 py-3">Lịch tuần</th>
                      <th className="px-4 py-3">Hiệu lực</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupedRosterEmployees
                      .filter((g) => rosterDeptTab === "ALL" || g.group === rosterDeptTab)
                      .map(({ group, employees: groupEmps }) => (
                        <Fragment key={group}>
                          {rosterDeptTab === "ALL" && (
                            <tr className="bg-sky-800">
                              <td
                                colSpan={5}
                                className="px-4 py-2 text-xs font-bold text-white"
                              >
                                {group}{" "}
                                <span className="font-medium text-sky-200">
                                  ({groupEmps.length})
                                </span>
                              </td>
                            </tr>
                          )}
                          {groupEmps.map((emp) => {
                            const assign = assignmentByEmployeeId.get(emp.id);
                            const sched =
                              assign?.schedule ||
                              schedules.find((s) => s.id === assign?.schedule_id);
                            return (
                              <tr key={emp.id} className="hover:bg-slate-50/80">
                                <td className="px-4 py-3">
                                  <div className="font-semibold text-slate-900">
                                    {emp.full_name}
                                  </div>
                                  <div className="font-mono text-[11px] text-slate-400">
                                    {emp.employee_code}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-600">
                                  {emp.department || "—"}
                                </td>
                                <td className="px-4 py-3">
                                  {sched ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                                      {sched.name}
                                    </span>
                                  ) : (
                                    <span className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-400">
                                      Chưa phân lịch
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500">
                                  {assign ? assign.effective_from : "—"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openAssignModal(assign?.schedule_id, [emp.id])
                                    }
                                    disabled={schedules.length === 0}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                                  >
                                    {sched ? "Đổi lịch" : "Gán lịch"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT: COMPACT SCHEDULE TEMPLATES */}
            <div className="order-1 space-y-3 xl:order-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-slate-900">
                  Mẫu lịch tuần ({schedules.length})
                </h2>
                <span className="text-xs text-slate-400">
                  Rê chuột vào ngày để xem giờ ca
                </span>
              </div>

              {schedules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
                  Chưa có mẫu lịch tuần nào. Nhấn &quot;Tạo lịch tuần mới&quot; để bắt đầu.
                </div>
              ) : (
                <div className="space-y-3">
                  {schedules.map((schedule) => {
                    const rules = new Map(
                      schedule.rules.map((rule) => [rule.day_of_week, rule])
                    );
                    const assignedEmps = employeesByScheduleId.get(schedule.id) || [];
                    const shortDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

                    return (
                      <article
                        key={schedule.id}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-slate-300"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="text-sm font-bold text-slate-900">
                                {schedule.name}
                              </h3>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                                {schedule.code}
                              </span>
                              {!schedule.is_active && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  Ngưng
                                </span>
                              )}
                            </div>
                            {schedule.description && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                                {schedule.description}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openAssignModal(schedule.id)}
                              disabled={!schedule.is_active || employees.length === 0}
                              title="Gán nhân viên vào lịch này"
                              className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-40"
                            >
                              Gán
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditScheduleModal(schedule)}
                              title="Sửa lịch"
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSchedule(schedule)}
                              title="Xóa lịch"
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Compact 7-Day Strip */}
                        <div className="mt-3 grid grid-cols-7 gap-1">
                          {days.map((day, index) => {
                            const shift = rules.get(index + 1)?.shift;
                            const boxClass = shift
                              ? "border-sky-200 bg-sky-50/70 text-sky-900"
                              : "border-slate-200 bg-white text-slate-400";

                            return (
                              <div
                                key={day}
                                title={
                                  shift
                                    ? `${day}: ${shift.name} (${formatTime(
                                        shift.start_time
                                      )} – ${formatTime(shift.end_time)})`
                                    : `${day}: Nghỉ ca`
                                }
                                className={`rounded-lg border px-1 py-1.5 text-center ${boxClass}`}
                              >
                                <div className="text-[10px] font-bold">
                                  {shortDays[index]}
                                </div>
                                <div className="mt-0.5 truncate text-[10px] font-medium">
                                  {shift ? formatTime(shift.start_time) : "Off"}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Assigned count footer */}
                        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            Đang áp dụng:{" "}
                            <strong className="text-slate-700">
                              {assignedEmps.length} nhân sự
                            </strong>
                          </span>
                          {assignedEmps.length > 0 && (
                            <span className="max-w-[65%] truncate text-slate-400">
                              {assignedEmps.map((e) => e.full_name).join(", ")}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* MODAL: BATCH MULTI-EMPLOYEE ASSIGN */}
          {showAssignModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
              <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <h3 className="text-lg font-bold text-slate-900">
                    Gán lịch tuần cho nhân sự
                  </h3>
                  <button
                    type="button"
                    onClick={() => !savingAssign && setShowAssignModal(false)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleBatchAssign} className="flex min-h-0 flex-1 flex-col">
                  <div className="space-y-4 overflow-y-auto px-6 py-5">
                    {assignError && (
                      <div
                        role="alert"
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
                      >
                        {assignError}
                      </div>
                    )}

                    {/* Schedule & Effective Dates */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Lịch làm việc tuần <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={assignForm.schedule_id}
                          onChange={(e) =>
                            setAssignForm({ ...assignForm, schedule_id: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                        >
                          <option value="">-- Chọn lịch tuần --</option>
                          {schedules
                            .filter((s) => s.is_active)
                            .map((sched) => (
                              <option key={sched.id} value={sched.id}>
                                {sched.name} ({sched.code})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="sm:col-span-1.5">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Hiệu lực từ ngày <span className="text-rose-500">*</span>
                        </label>
                        <input
                          required
                          type="date"
                          value={assignForm.effective_from}
                          onChange={(e) =>
                            setAssignForm({ ...assignForm, effective_from: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                        />
                      </div>

                      <div className="sm:col-span-1.5">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Đến ngày (không bắt buộc)
                        </label>
                        <input
                          type="date"
                          value={assignForm.effective_to}
                          onChange={(e) =>
                            setAssignForm({ ...assignForm, effective_to: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Multi-Select Employees Section */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">
                          Chọn nhân viên ({selectedEmployeeIds.length} đã chọn)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={selectAllFilteredEmployees}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                          >
                            Chọn tất cả ({assignFilteredEmployees.length})
                          </button>
                          <button
                            type="button"
                            onClick={clearFilteredEmployees}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Bỏ chọn
                          </button>
                        </div>
                      </div>

                      {/* Search & Filter inside modal */}
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="relative flex-1">
                          <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          />
                          <input
                            type="text"
                            value={assignSearch}
                            onChange={(e) => setAssignSearch(e.target.value)}
                            placeholder="Tìm tên, mã NV..."
                            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-sky-500"
                          />
                        </div>
                        <select
                          value={assignDeptFilter}
                          onChange={(e) => setAssignDeptFilter(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
                        >
                          <option value="">Tất cả vị trí</option>
                          <option value="UNASSIGNED">Chưa có lịch tuần</option>
                          {departments.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Checkbox List */}
                      <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                        {assignFilteredEmployees.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-400">
                            Không có nhân viên phù hợp.
                          </div>
                        ) : (
                          assignFilteredEmployees.map((emp) => {
                            const checked = selectedEmployeeIds.includes(emp.id);
                            const currentAssign = assignmentByEmployeeId.get(emp.id);
                            const currentSched =
                              currentAssign?.schedule ||
                              schedules.find((s) => s.id === currentAssign?.schedule_id);

                            return (
                              <label
                                key={emp.id}
                                onClick={() => toggleEmployeeSelection(emp.id)}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${
                                  checked
                                    ? "border-sky-400 bg-sky-50/70"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition ${
                                      checked
                                        ? "border-sky-600 bg-sky-600 text-white"
                                        : "border-slate-300 bg-white"
                                    }`}
                                  >
                                    {checked && <Check size={12} strokeWidth={3} />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate text-xs font-bold text-slate-900">
                                        {emp.full_name}
                                      </span>
                                      <span className="font-mono text-[10px] font-medium text-slate-400">
                                        {emp.employee_code}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {emp.department || "Nhân viên"}
                                    </div>
                                  </div>
                                </div>

                                <div className="shrink-0">
                                  {currentSched ? (
                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                      {currentSched.name}
                                    </span>
                                  ) : (
                                    <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                      Chưa có lịch
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4">
                    <button
                      type="button"
                      onClick={() => setShowAssignModal(false)}
                      disabled={savingAssign}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={savingAssign || selectedEmployeeIds.length === 0}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
                    >
                      <UserCheck size={14} />
                      <span>
                        {savingAssign
                          ? "Đang áp dụng..."
                          : `Gán lịch cho ${selectedEmployeeIds.length} nhân viên`}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL: CREATE / EDIT WEEKLY SCHEDULE */}
          {showScheduleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
              <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingSchedule ? "Chỉnh sửa lịch tuần" : "Tạo lịch tuần mới"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => !savingSchedule && setShowScheduleModal(false)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveSchedule} className="overflow-y-auto px-6 py-5 space-y-4">
                  {shifts.some((s) => s.is_active) && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const activeShifts = shifts.filter((s) => s.is_active);
                          if (activeShifts.length === 0) return;
                          const morning =
                            activeShifts.find(
                              (s) => s.code.includes("MORNING") || s.code.includes("SANG")
                            ) || activeShifts[0];
                          const evening =
                            activeShifts.find(
                              (s) => s.code.includes("EVENING") || s.code.includes("CHIEU")
                            ) || activeShifts[Math.min(1, activeShifts.length - 1)];
                          setScheduleForm((prev) => ({
                            ...prev,
                            name: prev.name || "Lịch ca xoay (7 ngày)",
                            code: prev.code || "FNB-ROTATING",
                            dayShifts: {
                              1: String(morning.id),
                              2: String(morning.id),
                              3: String(morning.id),
                              4: String(morning.id),
                              5: String(evening.id),
                              6: String(evening.id),
                              7: String(evening.id),
                            },
                          }));
                        }}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Mẫu ca xoay (T2–T5 Sáng, T6–CN Chiều)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const activeShift = shifts.find((s) => s.is_active);
                          if (!activeShift) return;
                          setScheduleForm((prev) => ({
                            ...prev,
                            dayShifts: {
                              1: String(activeShift.id),
                              2: String(activeShift.id),
                              3: String(activeShift.id),
                              4: String(activeShift.id),
                              5: String(activeShift.id),
                              6: String(activeShift.id),
                              7: String(activeShift.id),
                            },
                          }));
                        }}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Điền nhanh 7 ngày giống nhau
                      </button>
                    </div>
                  )}

                  {scheduleError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
                    >
                      {scheduleError}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Tên lịch tuần <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        maxLength={100}
                        placeholder="Lịch vận hành 7 ngày"
                        value={scheduleForm.name}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mã lịch <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        maxLength={50}
                        placeholder="FNB-7DAY"
                        value={scheduleForm.code}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, code: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mô tả
                      </label>
                      <input
                        placeholder="Ghi chú (tùy chọn)"
                        value={scheduleForm.description}
                        onChange={(e) =>
                          setScheduleForm({ ...scheduleForm, description: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                    <span className="block text-xs font-semibold text-slate-700">
                      Phân ca theo từng ngày (Thứ 2 – Chủ Nhật)
                    </span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {days.map((dayName, idx) => {
                        const dayNum = idx + 1;
                        return (
                          <div
                            key={dayName}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5"
                          >
                            <span className="text-xs font-semibold text-slate-700">{dayName}</span>
                            <select
                              value={scheduleForm.dayShifts[dayNum] ?? ""}
                              onChange={(e) =>
                                setScheduleForm((prev) => ({
                                  ...prev,
                                  dayShifts: {
                                    ...prev.dayShifts,
                                    [dayNum]: e.target.value,
                                  },
                                }))
                              }
                              className="max-w-[170px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800"
                            >
                              <option value="">Nghỉ ca</option>
                              {shifts
                                .filter((s) => s.is_active)
                                .map((shift) => (
                                  <option key={shift.id} value={shift.id}>
                                    {shift.name} ({formatTime(shift.start_time)}–
                                    {formatTime(shift.end_time)})
                                  </option>
                                ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowScheduleModal(false)}
                      disabled={savingSchedule}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={savingSchedule}
                      className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
                    >
                      {savingSchedule
                        ? "Đang lưu..."
                        : editingSchedule
                          ? "Lưu thay đổi"
                          : "Tạo lịch tuần"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL: CONFIRM DELETE SCHEDULE */}
          {confirmDeleteSchedule && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-base font-bold text-slate-900">Xác nhận xóa lịch tuần</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Bạn có chắc muốn xóa lịch{" "}
                  <strong className="text-slate-900">{confirmDeleteSchedule.name}</strong> (
                  <code className="text-xs font-semibold">{confirmDeleteSchedule.code}</code>)?
                </p>

                <div className="mt-5 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteSchedule(null)}
                    disabled={deletingScheduleId !== null}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmDeleteSchedule()}
                    disabled={deletingScheduleId !== null}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50"
                  >
                    {deletingScheduleId !== null ? "Đang xóa..." : "Xóa lịch"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
