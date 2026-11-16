import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  createAttendance,
  createAttendanceRequest,
  deleteAttendance,
  deleteAttendanceRequest,
  getAttendanceCalendar,
  getAttendanceRequests,
  getMonthlyTimesheetReport,
  reviewAttendanceRequest,
  updateAttendance,
} from "../api/attendance.api";
import { getEmployeeSchedule, getMySchedule } from "../api/schedule.api";
import { getStoreProfile } from "../api/auth.api";
import { getApiErrorMessage } from "../api/error";
import { getEmployees } from "../api/employee.api";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import type {
  AttendanceCalendarDay,
  AttendanceCalendarResponse,
  AttendanceRequestItem,
  AttendanceRequestType,
  AttendanceStatus,
  MonthlyTimesheetReportResponse,
} from "../types/attendance";
import type { Employee } from "../types/employee";
import type { EmployeeSchedule } from "../types/schedule";
import { getCalendarCellCount, shiftMonth } from "./attendanceCalendar";

const monthNames = [
  "Tháng 1",
  "Tháng 2",
  "Tháng 3",
  "Tháng 4",
  "Tháng 5",
  "Tháng 6",
  "Tháng 7",
  "Tháng 8",
  "Tháng 9",
  "Tháng 10",
  "Tháng 11",
  "Tháng 12",
];
const weekDays = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];

const REQUEST_TYPE_LABELS: Record<AttendanceRequestType, string> = {
  FORGOT_CHECKIN: "Quên chấm công vào / ra",
  LATE_EXPLANATION: "Giải trình đi trễ",
  EARLY_LEAVE: "Giải trình về sớm",
  LEAVE: "Xin nghỉ phép có phép",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatClock(value: string | null) {
  return value
    ? new Date(value).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
}

function formatShiftTime(value: string) {
  return value.slice(0, 5);
}

function formatMinutes(minutes?: number) {
  if (!minutes || minutes <= 0) return "0m";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function downloadCsvFile(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    "\uFEFF" +
    [headers.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))].join(
      "\r\n"
    );
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getDayStatusLabel(day: AttendanceCalendarDay) {
  if (!day.has_record) {
    return day.is_weekend ? "Nghỉ ca" : "Chưa có";
  }
  if (day.status === "ABSENT") return "Vắng";
  const late = day.late_minutes || 0;
  const early = day.early_leave_minutes || 0;
  const work = day.working_minutes || 0;
  const hasOut = Boolean(day.check_out);
  if (late > 0 && early > 15) return "Trễ · Về sớm";
  if (early > 15) return "Về sớm";
  if (hasOut && work < 180 && late === 0) return `Thiếu giờ (${work}p)`;
  if (late > 0 || day.status === "LATE") return "Đi trễ";
  return "Đúng giờ";
}

function statusClass(
  day: AttendanceCalendarDay,
  future: boolean,
  selected: boolean
) {
  const ring = selected ? " ring-2 ring-indigo-600 ring-offset-1 shadow-xs" : "";
  if (future) return `border-slate-100 bg-slate-50/40 text-slate-400${ring}`;
  if (!day.has_record) return `border-slate-200/80 bg-white text-slate-500${ring}`;
  if (day.status === "ABSENT")
    return `border-rose-200 bg-rose-50/80 text-rose-900${ring}`;
  const isWarning =
    day.status === "LATE" ||
    (day.late_minutes || 0) > 0 ||
    (day.early_leave_minutes || 0) > 15 ||
    Boolean(day.check_out && (day.working_minutes || 0) < 180);
  if (isWarning)
    return `border-amber-300 bg-amber-50/90 text-amber-950${ring}`;
  return `border-emerald-200 bg-emerald-50/80 text-emerald-950${ring}`;
}

export default function Attendance() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storedUser = localStorage.getItem("user");
  const isAdmin = (() => {
    try {
      return JSON.parse(storedUser || "{}").role === "ADMIN";
    } catch {
      return false;
    }
  })();

  const activeTab: "calendar" | "timesheet" | "requests" = (() => {
    const tabParam = searchParams.get("tab");
    if (location.pathname.startsWith("/timesheet") || tabParam === "timesheet") {
      return "timesheet";
    }
    if (location.pathname.startsWith("/requests") || tabParam === "requests") {
      return "requests";
    }
    return "calendar";
  })();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employeeId, setEmployeeId] = useState(
    isAdmin ? searchParams.get("employee") || "" : ""
  );
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [calendar, setCalendar] = useState<AttendanceCalendarResponse | null>(null);
  const [daySchedule, setDaySchedule] = useState<EmployeeSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [editingDay, setEditingDay] = useState<AttendanceCalendarDay | null>(null);
  const [form, setForm] = useState({
    date: "",
    check_in: "",
    check_out: "",
    status: "PRESENT" as AttendanceStatus,
  });
  const [saving, setSaving] = useState(false);

  // Timesheet report state (Admin)
  const [report, setReport] = useState<MonthlyTimesheetReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [hourlyRateVnd, setHourlyRateVnd] = useState<number>(35000);
  const [hideEmptyRows, setHideEmptyRows] = useState<boolean>(true);

  // Requests state (Admin & Employee)
  const [requests, setRequests] = useState<AttendanceRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    date: todayIso(),
    request_type: "FORGOT_CHECKIN" as AttendanceRequestType,
    reason: "",
    requested_check_in: "",
    requested_check_out: "",
  });
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState("");
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  function setTab(tab: "calendar" | "timesheet" | "requests") {
    if (tab === "timesheet") {
      navigate("/timesheet");
    } else if (tab === "requests") {
      navigate("/requests");
    } else {
      const emp = searchParams.get("employee");
      navigate(emp ? `/attendance?employee=${emp}` : "/attendance");
    }
  }

  async function loadCalendar() {
    if (isAdmin && !employeeId) {
      setCalendar(null);
      return;
    }
    try {
      setLoading(true);
      setError("");
      setCalendar(
        await getAttendanceCalendar(
          year,
          month,
          isAdmin && employeeId ? Number(employeeId) : undefined
        )
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to load attendance calendar."));
    } finally {
      setLoading(false);
    }
  }

  async function loadDaySchedule(date: string) {
    if (isAdmin && !employeeId) {
      setDaySchedule(null);
      return;
    }
    try {
      setScheduleLoading(true);
      setScheduleError("");
      const result =
        isAdmin && employeeId
          ? await getEmployeeSchedule(Number(employeeId), date)
          : await getMySchedule(date);
      setDaySchedule(result);
    } catch (err) {
      setDaySchedule(null);
      setScheduleError(getApiErrorMessage(err, "Unable to load assigned shift."));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function loadReport() {
    if (!isAdmin) return;
    try {
      setReportLoading(true);
      setError("");
      const data = await getMonthlyTimesheetReport(
        year,
        month,
        departmentFilter || undefined
      );
      setReport(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to load monthly timesheet report."));
    } finally {
      setReportLoading(false);
    }
  }

  async function loadRequests() {
    try {
      setRequestsLoading(true);
      const data = await getAttendanceRequests();
      setRequests(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to load attendance requests."));
    } finally {
      setRequestsLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    getEmployees()
      .then((list) => {
        setEmployees(list);
        if (!employeeId && list.length > 0) {
          setEmployeeId(String(list[0].id));
        }
      })
      .catch((err) => setError(getApiErrorMessage(err, "Unable to load employees.")));
  }, [isAdmin]);

  useEffect(() => {
    void loadCalendar();
  }, [year, month, employeeId, isAdmin]);

  useEffect(() => {
    void loadDaySchedule(selectedDate);
  }, [selectedDate, employeeId, isAdmin]);

  useEffect(() => {
    if (activeTab === "timesheet" && isAdmin) {
      void loadReport();
    } else if (activeTab === "requests") {
      void loadRequests();
    }
  }, [activeTab, year, month, departmentFilter, isAdmin]);

  useEffect(() => {
    void loadRequests();
    getStoreProfile()
      .then((store) => {
        if (store?.default_hourly_rate && store.default_hourly_rate > 0) {
          setHourlyRateVnd(store.default_hourly_rate);
        }
      })
      .catch(() => undefined);
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((emp) => {
      if (emp.department?.trim()) set.add(emp.department.trim());
    });
    return Array.from(set).sort();
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    if (!departmentFilter) return employees;
    return employees.filter((e) => (e.department || "").trim() === departmentFilter);
  }, [employees, departmentFilter]);

  const selectedEmployee = employees.find(
    (employee) => String(employee.id) === employeeId
  );
  const currentToday = todayIso();
  const daysByDate = useMemo(
    () => new Map(calendar?.days.map((day) => [day.date, day])),
    [calendar]
  );
  const selectedDay = daysByDate.get(selectedDate);

  const calendarSummary = useMemo(() => {
    if (!calendar) {
      return {
        presentDays: 0,
        lateDays: 0,
        absentDays: 0,
        workingMinutes: 0,
        lateMinutes: 0,
        overtimeMinutes: 0,
      };
    }
    let presentDays = 0;
    let lateDays = 0;
    let absentDays = 0;
    let workingMinutes = 0;
    let lateMinutes = 0;
    let overtimeMinutes = 0;
    for (const d of calendar.days) {
      if (d.has_record) {
        if (d.status === "PRESENT") presentDays += 1;
        else if (d.status === "LATE") lateDays += 1;
        else if (d.status === "ABSENT") absentDays += 1;
        workingMinutes += d.working_minutes || 0;
        lateMinutes += d.late_minutes || 0;
        overtimeMinutes += d.overtime_minutes || 0;
      }
    }
    return {
      presentDays,
      lateDays,
      absentDays,
      workingMinutes,
      lateMinutes,
      overtimeMinutes,
    };
  }, [calendar]);

  const cells = useMemo(() => {
    const count = getCalendarCellCount(year, month);
    const first = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: count }, (_, index) => {
      const dayNumber = index - first + 1;
      return dayNumber > 0 && dayNumber <= daysInMonth
        ? `${year}-${String(month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`
        : "";
    });
  }, [year, month]);

  function moveMonth(offset: number) {
    const next = shiftMonth(year, month, offset);
    setYear(next.year);
    setMonth(next.month);
    const inCurrentMonth = selectedDate.startsWith(
      `${next.year}-${String(next.month).padStart(2, "0")}`
    );
    if (!inCurrentMonth) {
      const today = todayIso();
      const todayInMonth = today.startsWith(
        `${next.year}-${String(next.month).padStart(2, "0")}`
      );
      setSelectedDate(
        todayInMonth
          ? today
          : `${next.year}-${String(next.month).padStart(2, "0")}-01`
      );
    }
  }

  function chooseEmployee(value: string) {
    setEmployeeId(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set("employee", value);
    else next.delete("employee");
    setSearchParams(next, { replace: true });
  }

  function selectDay(day: AttendanceCalendarDay) {
    setSelectedDate(day.date);
  }

  function openEditor(day: AttendanceCalendarDay) {
    if (!isAdmin || !employeeId || day.date > currentToday) return;
    if (day.is_weekend && !day.has_record) return;
    setEditingDay(day);
    setForm({
      date: day.date,
      check_in: day.check_in ? day.check_in.slice(0, 16) : "",
      check_out: day.check_out ? day.check_out.slice(0, 16) : "",
      status: day.has_record ? day.status : "PRESENT",
    });
    setError("");
  }

  function openRequestModalForDay(dateStr: string) {
    setRequestForm({
      date: dateStr,
      request_type: "FORGOT_CHECKIN",
      reason: "",
      requested_check_in: `${dateStr}T08:00`,
      requested_check_out: `${dateStr}T17:00`,
    });
    setRequestFeedback("");
    setShowRequestModal(true);
  }

  function handleExportCalendarCsv() {
    if (!calendar) return;
    const empLabel = selectedEmployee
      ? `${selectedEmployee.employee_code}_${selectedEmployee.full_name}`
      : "my_attendance";
    const headers = [
      "Date",
      "Status",
      "Check-in",
      "Check-out",
      "Working Minutes",
      "Late Minutes",
      "Early Leave Minutes",
      "Overtime Minutes",
      "AI Match %",
      "Liveness %",
      "Verification",
    ];
    const rows = calendar.days.map((d) => [
      d.date,
      d.has_record ? d.status : d.is_weekend ? "WEEKEND" : "NO_RECORD",
      d.check_in ? formatClock(d.check_in) : "",
      d.check_out ? formatClock(d.check_out) : "",
      d.working_minutes || 0,
      d.late_minutes || 0,
      d.early_leave_minutes || 0,
      d.overtime_minutes || 0,
      d.face_similarity != null ? (d.face_similarity * 100).toFixed(1) : "",
      d.liveness_score != null ? (d.liveness_score * 100).toFixed(1) : "",
      d.verification_status || "",
    ]);
    downloadCsvFile(
      `timesheet_${empLabel}_${year}_${String(month).padStart(2, "0")}.csv`,
      headers,
      rows
    );
  }

  function calculateFnbPayrollVnd(workingMins: number, overtimeMins: number) {
    const regularHours = Math.max(0, workingMins - overtimeMins) / 60;
    const otHours = Math.max(0, overtimeMins) / 60;
    return Math.round((regularHours + otHours * 1.5) * hourlyRateVnd);
  }

  function handleExportCompanyReportCsv() {
    if (!report) return;
    const headers = [
      "Employee Code",
      "Full Name",
      "Department",
      "Present Days",
      "Late Days",
      "Absent Days",
      "Working Hours",
      "Total Working Minutes",
      "Total Late Minutes",
      "Early Leave Minutes",
      "Overtime Minutes",
      "Hourly Rate (VND)",
      "Est. Payroll (VND)",
      "Avg Face Similarity %",
      "Avg Liveness %",
    ];
    const rows = report.rows.map((r) => [
      r.employee_code,
      r.full_name,
      r.department || "Unassigned",
      r.present_days,
      r.late_days,
      r.absent_days,
      (r.total_working_minutes / 60).toFixed(1),
      r.total_working_minutes,
      r.total_late_minutes,
      r.total_early_leave_minutes,
      r.total_overtime_minutes,
      hourlyRateVnd,
      calculateFnbPayrollVnd(r.total_working_minutes, r.total_overtime_minutes),
      r.avg_face_similarity != null ? (r.avg_face_similarity * 100).toFixed(1) : "",
      r.avg_liveness_score != null ? (r.avg_liveness_score * 100).toFixed(1) : "",
    ]);
    downloadCsvFile(
      `averis_payroll_${year}_${String(month).padStart(2, "0")}.csv`,
      headers,
      rows
    );
  }

  const manageable = Boolean(
    isAdmin &&
      employeeId &&
      selectedDay &&
      selectedDay.date <= currentToday
  );

  async function saveDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeId) return;
    try {
      setSaving(true);
      if (editingDay?.attendance_id) {
        await updateAttendance(editingDay.attendance_id, {
          check_in: form.check_in || null,
          check_out: form.check_out || null,
          status: form.status,
        });
      } else {
        await createAttendance({
          employee_id: Number(employeeId),
          date: form.date,
          check_in: form.check_in || null,
          check_out: form.check_out || null,
          status: form.status,
        });
      }
      setEditingDay(null);
      await loadCalendar();
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to save attendance."));
    } finally {
      setSaving(false);
    }
  }

  async function removeDay() {
    if (!editingDay?.attendance_id || !window.confirm("Delete this attendance record?")) {
      return;
    }
    try {
      setSaving(true);
      await deleteAttendance(editingDay.attendance_id);
      setEditingDay(null);
      await loadCalendar();
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to delete attendance."));
    } finally {
      setSaving(false);
    }
  }

  async function submitAttendanceRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestForm.reason.trim()) return;
    try {
      setRequestSubmitting(true);
      await createAttendanceRequest({
        date: requestForm.date,
        request_type: requestForm.request_type,
        reason: requestForm.reason.trim(),
        requested_check_in:
          requestForm.request_type === "LEAVE"
            ? null
            : requestForm.requested_check_in || null,
        requested_check_out:
          requestForm.request_type === "LEAVE"
            ? null
            : requestForm.requested_check_out || null,
      });
      setShowRequestModal(false);
      setRequestFeedback("Đơn giải trình / nghỉ phép của bạn đã được gửi tới Quản trị viên.");
      await loadRequests();
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể gửi đơn giải trình."));
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function handleReviewRequest(
    reqId: number,
    decision: "APPROVED" | "REJECTED"
  ) {
    const note = window.prompt(
      decision === "APPROVED"
        ? "Ghi chú phê duyệt (tuỳ chọn, để trống nếu không có):"
        : "Lý do từ chối (tuỳ chọn):",
      ""
    );
    if (note === null) return;
    try {
      setReviewingId(reqId);
      await reviewAttendanceRequest(reqId, {
        status: decision,
        admin_note: note || null,
      });
      await loadRequests();
      await loadCalendar();
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể xử lý đơn từ."));
    } finally {
      setReviewingId(null);
    }
  }

  const [requestSearch, setRequestSearch] = useState("");
  const [requestTypeFilter, setRequestTypeFilter] = useState<string>("ALL");
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>("ALL");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const filteredRequests = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    return requests.filter((item) => {
      if (requestTypeFilter !== "ALL" && item.request_type !== requestTypeFilter) {
        return false;
      }
      if (requestStatusFilter !== "ALL" && item.status !== requestStatusFilter) {
        return false;
      }
      if (!q) return true;
      const name = (item.employee_name || "").toLowerCase();
      const code = (item.employee_code || "").toLowerCase();
      const reason = (item.reason || "").toLowerCase();
      return name.includes(q) || code.includes(q) || reason.includes(q);
    });
  }, [requests, requestSearch, requestTypeFilter, requestStatusFilter]);

  async function handleCancelRequest(reqId: number) {
    if (!window.confirm("Bạn có chắc chắn muốn huỷ đơn đang chờ duyệt này?")) {
      return;
    }
    try {
      setCancellingId(reqId);
      setError("");
      await deleteAttendanceRequest(reqId);
      setRequestFeedback("Đã huỷ đơn giải trình / nghỉ phép thành công.");
      await loadRequests();
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể huỷ đơn từ."));
    } finally {
      setCancellingId(null);
    }
  }

  const shift = daySchedule?.shift;
  const selectedLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
    "vi-VN",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" }
  );

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {activeTab === "timesheet"
              ? "Bảng công & Lương tháng"
              : activeTab === "requests"
                ? isAdmin
                  ? "Duyệt đơn từ & Giải trình"
                  : "Đơn từ của tôi"
                : isAdmin
                  ? "Lịch chấm công nhân sự"
                  : "Bảng công của tôi"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {activeTab === "timesheet"
              ? "Tổng hợp ngày công, giờ làm thực tế, tăng ca (OT) và ước tính lương toàn cửa hàng"
              : activeTab === "requests"
                ? isAdmin
                  ? "Xem xét và phê duyệt đơn xin nghỉ phép, giải trình đi trễ/về sớm, quên chấm công"
                  : "Gửi đơn giải trình chấm công hoặc xin nghỉ phép và theo dõi kết quả phê duyệt"
                : isAdmin
                  ? "Tra cứu chi tiết giờ vào/ra, trạng thái ca và điều chỉnh chấm công theo ngày"
                  : "Theo dõi lịch sử chấm công, giờ làm việc và tăng ca theo tháng"}
          </p>
        </div>

        {activeTab === "requests" && pendingCount > 0 && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            <Clock3 size={14} />
            {pendingCount} đơn đang chờ duyệt
          </span>
        )}
      </header>

      {requestFeedback && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
          {requestFeedback}
        </div>
      )}

      {error && !loading && (
        <ErrorState message={error} onRetry={() => void loadCalendar()} />
      )}

      {/* =========================================================
          TAB 2: ADMIN MONTHLY PAYROLL TIMESHEET REPORT
      ========================================================= */}
      {activeTab === "timesheet" && isAdmin && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4  sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  className="h-9 w-9 rounded-lg border border-slate-200 text-lg text-slate-600 hover:bg-slate-50"
                >
                  ‹
                </button>
                <span className="min-w-[140px] text-center text-sm font-semibold text-slate-900">
                  {monthNames[month - 1]} {year}
                </span>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  className="h-9 w-9 rounded-lg border border-slate-200 text-lg text-slate-600 hover:bg-slate-50"
                >
                  ›
                </button>
              </div>

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">Tất cả vị trí / quầy</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="text-xs font-medium text-slate-600">
                  Đơn giá giờ:
                </span>
                <input
                  type="number"
                  min={1000}
                  max={1000000}
                  step={500}
                  value={hourlyRateVnd || ""}
                  onChange={(e) => setHourlyRateVnd(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="Nhập VNĐ/h"
                  className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-xs font-semibold text-slate-800 outline-none focus:border-slate-400"
                />
                <span className="text-xs font-semibold text-slate-500">đ/h</span>
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={hideEmptyRows}
                  onChange={(e) => setHideEmptyRows(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900"
                />
                Ẩn nhân viên chưa có công
              </label>
            </div>

            <button
              type="button"
              onClick={handleExportCompanyReportCsv}
              disabled={!report || report.rows.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
            >
              <Download size={15} />
              Xuất CSV
            </button>
          </div>

          {report && report.rows.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">
                  Tổng giờ làm việc thực tế
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {(
                    report.rows.reduce((acc, r) => acc + r.total_working_minutes, 0) / 60
                  ).toFixed(1)}
                  h
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">
                  Số phút trễ ca mở quầy
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {report.rows.reduce((acc, r) => acc + r.total_late_minutes, 0)}p
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">
                  Giờ tăng ca (OT)
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {(
                    report.rows.reduce((acc, r) => acc + r.total_overtime_minutes, 0) / 60
                  ).toFixed(1)}
                  h
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">
                  Ước tính lương theo giờ
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {report.rows
                    .reduce(
                      (acc, r) =>
                        acc +
                        calculateFnbPayrollVnd(
                          r.total_working_minutes,
                          r.total_overtime_minutes
                        ),
                      0
                    )
                    .toLocaleString("vi-VN")}
                  đ
                </p>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {reportLoading ? (
              <LoadingState message="Đang tính toán bảng công và lương tháng..." />
            ) : !report || report.rows.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                Không tìm thấy dữ liệu nhân sự theo bộ lọc hiện tại.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Mã NV</th>
                      <th className="px-4 py-3.5">Họ và tên</th>
                      <th className="px-4 py-3.5">Vị trí / Quầy</th>
                      <th className="px-4 py-3.5 text-center">Đúng giờ</th>
                      <th className="px-4 py-3.5 text-center">Đi trễ</th>
                      <th className="px-4 py-3.5 text-center">Vắng</th>
                      <th className="px-4 py-3.5 text-right">Tổng giờ công</th>
                      <th className="px-4 py-3.5 text-right">Phút trễ</th>
                      <th className="px-4 py-3.5 text-right">Tăng ca</th>
                      <th className="px-4 py-3.5 text-right">Lương tạm tính</th>
                      <th className="px-4 py-3.5 text-right">Độ khớp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...report.rows]
                      .filter((r) =>
                        hideEmptyRows
                          ? r.total_working_minutes > 0 ||
                            r.present_days > 0 ||
                            r.late_days > 0 ||
                            r.absent_days > 0
                          : true
                      )
                      .sort((a, b) => b.total_working_minutes - a.total_working_minutes)
                      .map((row) => {
                        const payroll = calculateFnbPayrollVnd(
                          row.total_working_minutes,
                          row.total_overtime_minutes
                        );
                        return (
                          <tr key={row.employee_id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3.5 font-mono text-xs font-medium text-slate-500">
                              {row.employee_code}
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-slate-900">
                              {row.full_name}
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">
                              {row.department || "—"}
                            </td>
                            <td className="px-4 py-3.5 text-center text-slate-700">
                              {row.present_days > 0 ? row.present_days : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-center text-slate-700">
                              {row.late_days > 0 ? row.late_days : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-center text-slate-700">
                              {row.absent_days > 0 ? row.absent_days : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                              {row.total_working_minutes > 0 ? (
                                formatMinutes(row.total_working_minutes)
                              ) : (
                                <span className="font-normal text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right text-slate-600">
                              {row.total_late_minutes > 0 ? (
                                `${row.total_late_minutes}p`
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right text-slate-600">
                              {row.total_overtime_minutes > 0 ? (
                                formatMinutes(row.total_overtime_minutes)
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                              {payroll > 0 ? (
                                `${payroll.toLocaleString("vi-VN")}đ`
                              ) : (
                                <span className="font-normal text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right text-xs text-slate-500">
                              {row.avg_face_similarity != null
                                ? `${(row.avg_face_similarity * 100).toFixed(1)}%`
                                : "—"}
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
      )}

      {/* =========================================================
          TAB 3: EXPLANATION & LEAVE REQUESTS WORKFLOW
      ========================================================= */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {isAdmin
                    ? "Danh sách Đơn giải trình & Xin nghỉ phép"
                    : "Đơn giải trình & Nghỉ phép của tôi"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Hiển thị <strong>{filteredRequests.length}</strong> / {requests.length} đơn từ
                </p>
              </div>
              {!isAdmin && (
                <button
                  type="button"
                  onClick={() => openRequestModalForDay(selectedDate)}
                  className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
                >
                  <Send size={14} />
                  + Tạo đơn mới
                </button>
              )}
            </div>

            <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
              <input
                type="text"
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                placeholder="Tìm theo tên NV, mã NV hoặc lý do..."
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <select
                value={requestTypeFilter}
                onChange={(e) => setRequestTypeFilter(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option value="ALL">Tất cả loại đơn</option>
                <option value="FORGOT_CHECKIN">Quên chấm công vào / ra</option>
                <option value="LATE_EXPLANATION">Giải trình đi trễ</option>
                <option value="EARLY_LEAVE">Giải trình về sớm</option>
                <option value="LEAVE">Xin nghỉ phép có phép</option>
              </select>
              <select
                value={requestStatusFilter}
                onChange={(e) => setRequestStatusFilter(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="PENDING">Chờ duyệt (PENDING)</option>
                <option value="APPROVED">Đã duyệt (APPROVED)</option>
                <option value="REJECTED">Từ chối (REJECTED)</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {requestsLoading ? (
              <LoadingState message="Đang tải danh sách đơn từ..." />
            ) : filteredRequests.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                {requests.length === 0
                  ? "Chưa có đơn giải trình hoặc xin nghỉ phép nào được gửi."
                  : "Không tìm thấy đơn từ nào khớp với bộ lọc hiện tại."}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredRequests.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {item.employee_name || `Nhân viên #${item.employee_id}`}
                        </span>
                        {item.employee_code && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                            {item.employee_code}
                          </span>
                        )}
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {REQUEST_TYPE_LABELS[item.request_type] || item.request_type}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            item.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : item.status === "REJECTED"
                                ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                          }`}
                        >
                          {item.status === "APPROVED"
                            ? "ĐÃ DUYỆT"
                            : item.status === "REJECTED"
                              ? "TỪ CHỐI"
                              : "CHỜ DUYỆT"}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-500">
                        Ngày: <strong className="text-slate-700">{item.date}</strong>
                        {item.requested_check_in && (
                          <> · Giờ vào đề xuất: {formatClock(item.requested_check_in)}</>
                        )}
                        {item.requested_check_out && (
                          <> · Giờ ra đề xuất: {formatClock(item.requested_check_out)}</>
                        )}
                      </p>
                      <p className="text-sm text-slate-700">
                        <span className="font-medium text-slate-500">Lý do: </span>
                        {item.reason}
                      </p>
                      {item.admin_note && (
                        <p className="text-xs italic text-slate-500">
                          Ghi chú Admin: {item.admin_note}
                        </p>
                      )}
                    </div>

                    {item.status === "PENDING" && (
                      <div className="flex shrink-0 items-center gap-2">
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              disabled={reviewingId === item.id}
                              onClick={() => void handleReviewRequest(item.id, "APPROVED")}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
                            >
                              <CheckCircle2 size={14} />
                              Duyệt
                            </button>
                            <button
                              type="button"
                              disabled={reviewingId === item.id}
                              onClick={() => void handleReviewRequest(item.id, "REJECTED")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <XCircle size={14} />
                              Từ chối
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={cancellingId === item.id}
                            onClick={() => void handleCancelRequest(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            <XCircle size={14} />
                            {cancellingId === item.id ? "Đang huỷ..." : "Huỷ đơn"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 1: CALENDAR VIEW
      ========================================================= */}
      {activeTab === "calendar" && (
        <>
          {isAdmin && (
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="w-full sm:w-52">
                  <span className="mb-1.5 block text-xs font-semibold   text-slate-500">
                    Lọc vị trí / quầy
                  </span>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-slate-400"
                  >
                    <option value="">Tất cả vị trí / quầy</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="w-full sm:w-72">
                  <span className="mb-1.5 block text-xs font-semibold   text-slate-500">
                    Nhân sự
                  </span>
                  <select
                    value={employeeId}
                    onChange={(event) => chooseEmployee(event.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-slate-400"
                  >
                    <option value="">-- Chọn nhân sự --</option>
                    {filteredEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name} ({employee.employee_code})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {calendar && (
                <button
                  type="button"
                  onClick={handleExportCalendarCsv}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Download size={15} />
                  Xuất CSV
                </button>
              )}
            </div>
          )}

          {isAdmin && !employeeId ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <p className="font-semibold text-slate-700">
                Chọn một nhân sự để xem lịch chấm công.
              </p>
            </div>
          ) : loading ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <LoadingState message="Đang tải lịch chấm công..." />
            </div>
          ) : (
            calendar && (
              <>
                {/* MONTHLY SUMMARY STRIP */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">
                      Tổng giờ làm việc thực tế
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {formatMinutes(calendarSummary.workingMinutes)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">
                      Số phút trễ ca mở quầy
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {calendarSummary.lateMinutes}p
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">
                      Giờ tăng ca (OT)
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {formatMinutes(calendarSummary.overtimeMinutes)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">
                      Ước tính lương theo giờ
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {calculateFnbPayrollVnd(
                        calendarSummary.workingMinutes,
                        calendarSummary.overtimeMinutes
                      ).toLocaleString("vi-VN")}
                      đ
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          {selectedEmployee?.full_name || "Lịch chấm công của tôi"}
                        </h2>
                        <p className="text-sm text-slate-500">
                          {monthNames[month - 1]} {year} · {calendar.total_days} ngày
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isAdmin && (
                          <button
                            type="button"
                            onClick={handleExportCalendarCsv}
                            className="mr-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <Download size={14} />
                            Xuất CSV
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="Tháng trước"
                          onClick={() => moveMonth(-1)}
                          className="h-9 w-9 rounded-lg border border-slate-200 text-lg text-slate-600 hover:bg-slate-50"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setYear(now.getFullYear());
                            setMonth(now.getMonth() + 1);
                            setSelectedDate(todayIso());
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Hôm nay
                        </button>
                        <button
                          type="button"
                          aria-label="Tháng sau"
                          onClick={() => moveMonth(1)}
                          className="h-9 w-9 rounded-lg border border-slate-200 text-lg text-slate-600 hover:bg-slate-50"
                        >
                          ›
                        </button>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                        {weekDays.map((day) => (
                          <div
                            key={day}
                            className="px-2 py-3 text-center text-xs font-semibold   text-slate-500"
                          >
                            {day}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7">
                        {cells.map((date, index) => {
                          const day = date ? daysByDate.get(date) : undefined;
                          const future = Boolean(day && day.date > currentToday);
                          const selected = Boolean(day && day.date === selectedDate);
                          return (
                            <div
                              key={date || `empty-${index}`}
                              onClick={() => day && selectDay(day)}
                              className={`min-h-[112px] border-b border-r border-slate-100 p-2 ${
                                !date ? "bg-slate-50/60" : ""
                              } ${day?.is_weekend ? "bg-slate-50" : ""} ${
                                day ? "cursor-pointer hover:bg-slate-50" : ""
                              }`}
                            >
                              {day && (
                                <div
                                  className={`flex h-full min-h-[96px] flex-col rounded-md border p-2 ${statusClass(
                                    day,
                                    future,
                                    selected
                                  )}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm font-semibold">
                                      {Number(date.slice(-2))}
                                    </span>
                                    <span className="text-[10px] font-semibold">
                                      {future ? "Sắp tới" : getDayStatusLabel(day)}
                                    </span>
                                  </div>
                                  <div className="mt-auto text-xs">
                                    {future ? (
                                      <span>Chưa diễn ra</span>
                                    ) : (
                                      <>
                                        <div>
                                          Vào <strong>{formatClock(day.check_in)}</strong>
                                        </div>
                                        <div>
                                          Ra <strong>{formatClock(day.check_out)}</strong>
                                        </div>
                                        {day.working_minutes ? (
                                          <div className="mt-0.5 text-[10px] font-semibold opacity-80">
                                            Công: {formatMinutes(day.working_minutes)}
                                          </div>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-600">
                      <span className="inline-flex items-center">
                        <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        Đúng giờ
                      </span>
                      <span className="inline-flex items-center">
                        <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                        Đi trễ
                      </span>
                      <span className="inline-flex items-center">
                        <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />
                        Vắng mặt
                      </span>
                      <span className="inline-flex items-center">
                        <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-slate-300 bg-slate-100" />
                        Nghỉ ca / Chưa chấm công
                      </span>
                    </div>
                  </div>

                  {/* SELECTED DAY SIDEBAR */}
                  <aside className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div>
                        <p className="text-xs font-semibold   text-slate-400">
                          Ngày đang chọn
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-slate-900">
                          {selectedLabel}
                        </h2>
                      </div>
                    </div>

                    {scheduleLoading ? (
                      <p className="mt-4 text-xs text-slate-500">Đang tải...</p>
                    ) : scheduleError ? (
                      <p className="mt-6 text-sm text-slate-600">{scheduleError}</p>
                    ) : daySchedule?.schedule ? (
                      <>
                        <p className="mt-6 text-sm font-semibold text-slate-500">
                          {daySchedule.schedule.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {daySchedule.schedule.code}
                        </p>
                      </>
                    ) : (
                      <h3 className="mt-6 text-base font-semibold text-slate-900">
                        Chưa gán ca làm việc
                      </h3>
                    )}

                    {shift ? (
                      <div className="mt-4 grid gap-3">
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            Ca làm việc
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">{shift.name}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            Khung giờ
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {formatShiftTime(shift.start_time)} -{" "}
                            {formatShiftTime(shift.end_time)}
                          </p>
                        </div>
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            Thời gian cho phép trễ
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {shift.late_tolerance_minutes} phút
                          </p>
                        </div>
                      </div>
                    ) : (
                      !scheduleLoading &&
                      !scheduleError && (
                        <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          Không có lịch làm việc cho ngày này.
                        </div>
                      )
                    )}

                    {selectedDay && selectedDay.date <= currentToday && (
                      <div className="mt-5 space-y-2 border-t border-slate-100 pt-5 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span>Giờ vào:</span>
                          <strong>{formatClock(selectedDay.check_in)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Giờ ra:</span>
                          <strong>{formatClock(selectedDay.check_out)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Trạng thái:</span>
                          <strong>{getDayStatusLabel(selectedDay)}</strong>
                        </div>
                        {selectedDay.has_record && (
                          <>
                            <div className="flex justify-between">
                              <span>Thời gian làm việc:</span>
                              <strong className="text-slate-900">
                                {formatMinutes(selectedDay.working_minutes)}
                              </strong>
                            </div>
                            {(selectedDay.late_minutes || 0) > 0 && (
                              <div className="flex justify-between text-amber-700">
                                <span>Số phút đi trễ:</span>
                                <strong>{selectedDay.late_minutes} phút</strong>
                              </div>
                            )}
                            {(selectedDay.early_leave_minutes || 0) > 0 && (
                              <div className="flex justify-between text-amber-700">
                                <span>Số phút về sớm:</span>
                                <strong>{selectedDay.early_leave_minutes} phút</strong>
                              </div>
                            )}
                            {(selectedDay.overtime_minutes || 0) > 0 && (
                              <div className="flex justify-between text-emerald-700">
                                <span>Tăng ca:</span>
                                <strong>
                                  {formatMinutes(selectedDay.overtime_minutes)}
                                </strong>
                              </div>
                            )}
                            {selectedDay.face_similarity != null && (
                              <div className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                <span className="font-semibold">
                                  Độ khớp khuôn mặt
                                </span>
                                <strong>
                                  {(selectedDay.face_similarity * 100).toFixed(1)}%
                                </strong>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {manageable && selectedDay && (
                      <button
                        type="button"
                        onClick={() => openEditor(selectedDay)}
                        className="mt-4 w-full rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
                      >
                        {selectedDay.has_record ? "Sửa" : "Thêm"}
                      </button>
                    )}

                    {!isAdmin && selectedDay && (
                      <button
                        type="button"
                        onClick={() => openRequestModalForDay(selectedDay.date)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Send size={15} />
                        Gửi đơn
                      </button>
                    )}
                  </aside>
                </div>
              </>
            )
          )}
        </>
      )}

      {/* ADMIN EDIT ATTENDANCE MODAL */}
      {editingDay && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={saveDay}
            className="w-full max-w-lg space-y-4 rounded-lg bg-white p-4 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {editingDay.has_record ? "Sửa chấm công" : "Thêm chấm công"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingDay(null)}
                className="text-xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs text-slate-500">
                  Giờ vào
                </span>
                <input
                  type="datetime-local"
                  value={form.check_in}
                  onChange={(event) =>
                    setForm({ ...form, check_in: event.target.value })
                  }
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-slate-500">
                  Giờ ra
                </span>
                <input
                  type="datetime-local"
                  value={form.check_out}
                  onChange={(event) =>
                    setForm({ ...form, check_out: event.target.value })
                  }
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">
                Trạng thái
              </span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as AttendanceStatus,
                  })
                }
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="PRESENT">Đúng giờ</option>
                <option value="LATE">Đi trễ</option>
                <option value="ABSENT">Vắng mặt</option>
              </select>
            </label>
            <div className="flex justify-between pt-2">
              {editingDay.attendance_id ? (
                <button
                  type="button"
                  onClick={() => void removeDay()}
                  disabled={saving}
                  className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Xoá
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDay(null)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
                >
                  {saving ? "Đang lưu..." : "Lưu"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* EMPLOYEE SUBMIT EXPLANATION / LEAVE MODAL */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={submitAttendanceRequest}
            className="w-full max-w-lg space-y-4 rounded-lg bg-white p-4 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Gửi đơn giải trình / nghỉ phép
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="text-xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs text-slate-500">
                  Ngày áp dụng
                </span>
                <input
                  type="date"
                  required
                  value={requestForm.date}
                  onChange={(e) =>
                    setRequestForm({ ...requestForm, date: e.target.value })
                  }
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <label>
                <span className="mb-1 block text-xs text-slate-500">
                  Loại đơn từ
                </span>
                <select
                  value={requestForm.request_type}
                  onChange={(e) =>
                    setRequestForm({
                      ...requestForm,
                      request_type: e.target.value as AttendanceRequestType,
                    })
                  }
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="FORGOT_CHECKIN">Quên chấm công vào / ra</option>
                  <option value="LATE_EXPLANATION">Giải trình đi trễ</option>
                  <option value="EARLY_LEAVE">Giải trình về sớm</option>
                  <option value="LEAVE">Xin nghỉ phép</option>
                </select>
              </label>
            </div>

            {requestForm.request_type !== "LEAVE" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-xs text-slate-500">
                    Giờ vào thực tế
                  </span>
                  <input
                    type="datetime-local"
                    value={requestForm.requested_check_in}
                    onChange={(e) =>
                      setRequestForm({
                        ...requestForm,
                        requested_check_in: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs text-slate-500">
                    Giờ ra thực tế
                  </span>
                  <input
                    type="datetime-local"
                    value={requestForm.requested_check_out}
                    onChange={(e) =>
                      setRequestForm({
                        ...requestForm,
                        requested_check_out: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">
                Lý do giải trình
              </span>
              <textarea
                rows={3}
                required
                placeholder="Nhập lý do thực tế tại quầy..."
                value={requestForm.reason}
                onChange={(e) =>
                  setRequestForm({ ...requestForm, reason: e.target.value })
                }
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  "Quên check-out do đông khách cuối ca",
                  "Đổi ca / Làm thay ca",
                  "Tăng ca dọn quầy đóng cửa",
                  "Vào ca trễ có báo Quản lý ca",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setRequestForm((prev) => ({ ...prev, reason: preset }))
                    }
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={requestSubmitting}
                className="rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
              >
                {requestSubmitting ? "Đang gửi..." : "Gửi"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
