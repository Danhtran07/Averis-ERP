import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Send,
  Users,
  X,
} from "lucide-react";
import { useParams } from "react-router-dom";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getApiErrorMessage } from "../api/error";
import {
  getDepartmentWeekRoster,
  getMyShiftRegistrations,
  getShifts,
  submitShiftRegistrations,
} from "../api/schedule.api";
import { getEmployees } from "../api/employee.api";
import type { Employee } from "../types/employee";
import type {
  DepartmentRosterMember,
  DepartmentWeekRosterResponse,
  Shift,
  ShiftRegistrationResponse,
} from "../types/schedule";

const DAY_NAMES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const FULL_DAY_NAMES = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
];

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

function getMondayOfDate(dateStr: string): string {
  const dt = new Date(`${dateStr}T12:00:00`);
  const jsDay = dt.getDay(); // 0=Sun, 1=Mon...
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const dt = new Date(`${dateStr}T12:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function getWeekDaysFromMonday(mondayStr: string) {
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const dStr = addDays(mondayStr, offset);
    return {
      date: dStr,
      dayName: DAY_NAMES[offset],
      fullDayName: FULL_DAY_NAMES[offset],
    };
  });
}

function formatSalaryType(type: string): { label: "FT" | "PT"; title: string } {
  if (type === "MONTHLY" || type === "FT") {
    return { label: "FT", title: "Full-time (Toàn thời gian)" };
  }
  return { label: "PT", title: "Part-time (Bán thời gian)" };
}

export default function EmployeeSchedule() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const isAdmin = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").role === "ADMIN";
    } catch {
      return false;
    }
  })();
  const isSelf = !employeeId || employeeId === "me";

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentWeekMonday = useMemo(() => getMondayOfDate(todayStr), [todayStr]);
  const nextWeekMonday = useMemo(() => addDays(currentWeekMonday, 7), [currentWeekMonday]);

  // Active week monday for the weekly matrix table
  const [activeWeekMonday, setActiveWeekMonday] = useState<string>(currentWeekMonday);

  // Data states
  const [rosterData, setRosterData] = useState<DepartmentWeekRosterResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [isFetchingWeek, setIsFetchingWeek] = useState<boolean>(false);
  const [targetEmployee, setTargetEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState<string>("");

  // Shift registration modal states
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [modalWeekMonday, setModalWeekMonday] = useState<string>(nextWeekMonday);
  const [registrationForm, setRegistrationForm] = useState<
    Record<string, { shift_id: number | null; note: string }>
  >({});
  const [submittingRegister, setSubmittingRegister] = useState<boolean>(false);
  const [registerError, setRegisterError] = useState<string>("");
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState<string>("");
  const [modalWeekRegistrations, setModalWeekRegistrations] = useState<ShiftRegistrationResponse[]>([]);

  // Computed days for active week matrix
  const matrixDays = useMemo(() => getWeekDaysFromMonday(activeWeekMonday), [activeWeekMonday]);
  const matrixWeekSunday = useMemo(() => addDays(activeWeekMonday, 6), [activeWeekMonday]);
  const matrixRangeLabel = `${formatShortDate(activeWeekMonday)} – ${formatShortDate(matrixWeekSunday)}`;

  // Computed days for registration modal
  const modalWeekDays = useMemo(() => getWeekDaysFromMonday(modalWeekMonday), [modalWeekMonday]);
  const modalWeekSunday = useMemo(() => addDays(modalWeekMonday, 6), [modalWeekMonday]);
  const modalRangeLabel = `${formatShortDate(modalWeekMonday)} – ${formatShortDate(modalWeekSunday)}`;

  // ---------------------------------------------------------------------------
  // Load department weekly matrix data
  // ---------------------------------------------------------------------------
  async function loadDepartmentRoster(weekMonday: string, isInitial = false) {
    try {
      if (isInitial) {
        setInitialLoading(true);
      } else {
        setIsFetchingWeek(true);
      }
      setError("");

      const isSpecificEmployee = Boolean(employeeId && employeeId !== "me" && isAdmin);
      const res = await getDepartmentWeekRoster(
        weekMonday,
        isSpecificEmployee ? Number(employeeId) : undefined
      );
      setRosterData(res);

      if (isSpecificEmployee && !targetEmployee) {
        const employees = await getEmployees().catch(() => []);
        setTargetEmployee(employees.find((item) => item.id === Number(employeeId)) || null);
      }
    } catch (err) {
      if (isInitial) {
        setError(getApiErrorMessage(err, "Không thể tải lịch làm việc của bộ phận."));
      }
    } finally {
      setInitialLoading(false);
      setIsFetchingWeek(false);
    }
  }

  // Load shifts list and existing registrations for the registration modal
  async function loadRegistrationContext(weekMonday: string) {
    try {
      const weekSunday = addDays(weekMonday, 6);
      const [shiftList, myRegs] = await Promise.all([
        getShifts().catch(() => [] as Shift[]),
        isSelf
          ? getMyShiftRegistrations(weekMonday, weekSunday).catch(() => [] as ShiftRegistrationResponse[])
          : Promise.resolve([] as ShiftRegistrationResponse[]),
      ]);

      setShifts(shiftList.filter((s) => s.is_active));
      setModalWeekRegistrations(myRegs);

      // Pre-fill modal form
      const formMap: Record<string, { shift_id: number | null; note: string }> = {};
      const regMap = new Map(myRegs.map((r) => [r.date, r]));
      const days = getWeekDaysFromMonday(weekMonday);

      for (const day of days) {
        const existing = regMap.get(day.date);
        formMap[day.date] = {
          shift_id: existing ? existing.shift_id : null,
          note: existing?.note || "",
        };
      }
      setRegistrationForm(formMap);
    } catch {
      // Non-blocking
    }
  }

  // Initial load
  useEffect(() => {
    void loadDepartmentRoster(activeWeekMonday, true);
  }, [employeeId, isAdmin]);

  // Navigate week
  function handleSelectWeek(newWeekMonday: string) {
    setActiveWeekMonday(newWeekMonday);
    void loadDepartmentRoster(newWeekMonday, false);
  }

  function openRegistrationModal(weekMonday: string) {
    setModalWeekMonday(weekMonday);
    setRegisterError("");
    void loadRegistrationContext(weekMonday);
    setShowRegisterModal(true);
  }

  // Quick presets inside modal
  function applyPreset(shiftId: number | null, weekdaysOnly: boolean = false) {
    setRegistrationForm((prev) => {
      const updated = { ...prev };
      modalWeekDays.forEach((day, index) => {
        if (!weekdaysOnly || index < 5) {
          updated[day.date] = {
            ...updated[day.date],
            shift_id: shiftId,
          };
        } else if (weekdaysOnly && index >= 5) {
          updated[day.date] = {
            ...updated[day.date],
            shift_id: null,
          };
        }
      });
      return updated;
    });
  }

  async function handleSubmitRegistration() {
    try {
      setSubmittingRegister(true);
      setRegisterError("");
      const items = modalWeekDays.map((day) => ({
        date: day.date,
        shift_id: registrationForm[day.date]?.shift_id ?? null,
        note: registrationForm[day.date]?.note?.trim() || null,
      }));

      const updated = await submitShiftRegistrations({ items });
      setModalWeekRegistrations(updated);
      setRegisterSuccessMsg(`Đã lưu đăng ký ca tuần (${modalRangeLabel}) thành công.`);
      setShowRegisterModal(false);
      setTimeout(() => setRegisterSuccessMsg(""), 5000);

      // Refresh current week in background
      void loadDepartmentRoster(activeWeekMonday, false);
    } catch (err) {
      setRegisterError(getApiErrorMessage(err, "Không thể gửi đăng ký lịch làm việc."));
    } finally {
      setSubmittingRegister(false);
    }
  }

  // Initial full-page loading only
  if (initialLoading) {
    return <LoadingState message="Đang tải bảng lịch làm việc..." />;
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => void loadDepartmentRoster(activeWeekMonday, true)}
      />
    );
  }

  const isViewingCurrentWeek = activeWeekMonday === currentWeekMonday;
  const isViewingNextWeek = activeWeekMonday === nextWeekMonday;

  return (
    <section className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* -------------------------------------------------------------------- */}
      {/* 1. TOP HEADER: Clean Title, Department, and Primary Actions          */}
      {/* -------------------------------------------------------------------- */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900">
              {isAdmin && targetEmployee
                ? `Lịch ca: ${targetEmployee.full_name}`
                : "Lịch làm việc & Đăng ký ca"}
            </h1>
            {rosterData?.department && (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {rosterData.department}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Xem lịch làm việc của bộ phận và kiểm tra ca trực cùng đồng nghiệp
          </p>
        </div>

        {isSelf && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openRegistrationModal(currentWeekMonday)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition"
            >
              <Calendar size={14} className="text-slate-500" />
              <span>Đăng ký tuần này</span>
            </button>

            <button
              type="button"
              onClick={() => openRegistrationModal(nextWeekMonday)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-sky-800 transition"
            >
              <Send size={14} />
              <span>Đăng ký tuần tới</span>
            </button>
          </div>
        )}
      </header>

      {/* Success Notification */}
      {registerSuccessMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{registerSuccessMsg}</span>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 2. WEEKLY ROSTER MATRIX TABLE CARD                                   */}
      {/* -------------------------------------------------------------------- */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Table Toolbar & Week Navigator */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
              <Users size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {rosterData?.department || "Bộ phận"}
                </span>
                {rosterData?.members && (
                  <span className="text-[11px] font-semibold text-slate-400">
                    ({rosterData.members.length} nhân sự)
                  </span>
                )}
                {isFetchingWeek && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 animate-pulse">
                    <RefreshCw size={11} className="animate-spin" /> Đang tải...
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Tuần: <strong className="text-slate-700">{matrixRangeLabel}</strong>
              </p>
            </div>
          </div>

          {/* Week Navigation Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSelectWeek(addDays(activeWeekMonday, -7))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs"
              title="Tuần trước"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              onClick={() => handleSelectWeek(currentWeekMonday)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition shadow-2xs ${
                isViewingCurrentWeek
                  ? "bg-sky-700 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Tuần này
            </button>

            <button
              type="button"
              onClick={() => handleSelectWeek(nextWeekMonday)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition shadow-2xs ${
                isViewingNextWeek
                  ? "bg-sky-700 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Tuần tới
            </button>

            <button
              type="button"
              onClick={() => handleSelectWeek(addDays(activeWeekMonday, 7))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs"
              title="Tuần sau nữa"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Table Content */}
        {!rosterData?.department ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Tài khoản chưa được cấu hình bộ phận (Ví dụ: Bếp, Thu ngân, Pha chế). Vui lòng liên hệ quản lý để gán bộ phận.
          </div>
        ) : rosterData.members.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Không có nhân sự nào trong bộ phận {rosterData.department}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-700">
                  <th className="w-14 border-r border-slate-200 px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wider">
                    STT
                  </th>
                  <th className="min-w-[210px] border-r border-slate-200 px-4 py-3.5 text-xs font-bold uppercase tracking-wider">
                    Nhân viên
                  </th>
                  <th className="w-24 border-r border-slate-200 px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wider">
                    Loại NV
                  </th>

                  {matrixDays.map((dayItem) => {
                    const isToday = dayItem.date === todayStr;

                    return (
                      <th
                        key={dayItem.date}
                        className={`min-w-[150px] border-r border-slate-200 px-3 py-3.5 text-center select-none ${
                          isToday
                            ? "bg-sky-50 text-sky-900 border-b-2 border-b-sky-700"
                            : "bg-slate-50/90 text-slate-700"
                        }`}
                      >
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-sm font-bold tracking-wide text-slate-900">
                            {formatShortDate(dayItem.date)}
                          </span>
                          <span className="mt-0.5 text-xs font-semibold text-slate-500">
                            {dayItem.fullDayName}
                          </span>
                          {isToday && (
                            <span className="mt-1 rounded border border-sky-200 bg-sky-100 px-2 py-0.5 text-[9px] font-bold uppercase text-sky-700">
                              Hôm nay
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rosterData.members.map((member: DepartmentRosterMember, mIdx: number) => {
                  const salaryInfo = formatSalaryType(member.salary_type);
                  const isUserRow = member.is_self;

                  return (
                    <tr
                      key={member.id}
                      className={`transition ${
                        isUserRow
                          ? "bg-sky-50/40 hover:bg-sky-50/70"
                          : "hover:bg-slate-50/60"
                      }`}
                    >
                      {/* STT */}
                      <td className="border-r border-slate-200 px-3 py-4 text-center font-mono text-xs font-semibold text-slate-500">
                        {mIdx + 1}
                      </td>

                      {/* Name & Code */}
                      <td className="border-r border-slate-200 px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold border ${
                              isUserRow
                                ? "bg-slate-800 text-white border-slate-800"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {member.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-slate-900 truncate">
                                {member.full_name}
                              </span>
                              {isUserRow && (
                                <span className="shrink-0 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-xs text-slate-400 mt-0.5 block">
                              {member.employee_code}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Salary Type: FT or PT */}
                      <td className="border-r border-slate-200 px-3 py-4 text-center">
                        <span
                          title={salaryInfo.title}
                          className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-bold text-xs text-slate-600"
                        >
                          {salaryInfo.label}
                        </span>
                      </td>

                      {/* 7 Days Shifts */}
                      {member.schedule.map((dayShift, sIdx) => {
                        const dayMeta = matrixDays[sIdx];
                        const isToday = dayMeta?.date === todayStr;

                        return (
                          <td
                            key={dayShift.date || sIdx}
                            className={`border-r border-slate-200 p-3 text-center align-middle transition ${
                              isToday ? "bg-sky-50/20" : ""
                            }`}
                          >
                            {dayShift.is_off ? (
                              <div className="flex items-center justify-center py-2">
                                <span className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-400">
                                  Nghỉ
                                </span>
                                {dayShift.registration_status === "PENDING" && (
                                  <span className="ml-1 text-[9px] font-semibold text-amber-600">
                                    (Chờ duyệt)
                                  </span>
                                )}
                              </div>
                            ) : dayShift.shift ? (
                              <div
                                className="flex flex-col items-center justify-center rounded-xl border border-sky-200/90 bg-sky-50/80 px-3 py-2.5 text-center transition hover:border-sky-400 hover:bg-sky-50 shadow-2xs"
                                title={`${dayShift.shift.name} (${formatTime(dayShift.shift.start_time)} - ${formatTime(dayShift.shift.end_time)})`}
                              >
                                <span className="font-bold text-xs sm:text-sm text-sky-950 tracking-tight leading-tight">
                                  {formatTime(dayShift.shift.start_time)}–{formatTime(dayShift.shift.end_time)}
                                </span>
                                <span className="mt-1 text-xs font-medium text-sky-700 truncate max-w-[120px] leading-tight">
                                  {dayShift.shift.name}
                                </span>
                                {dayShift.registration_status === "PENDING" && (
                                  <span className="mt-1 rounded border border-amber-200 bg-amber-50 text-amber-800 px-1.5 py-0.2 text-[8px] font-semibold">
                                    Chờ duyệt
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm font-medium text-slate-300">–</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend Footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/80 px-5 py-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-5">
            <span className="font-bold text-slate-700">Chú thích:</span>
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-400">
                Nghỉ
              </span>
              <span>Nghỉ ca (OFF)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-md border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                10:30 – 22:30
              </span>
              <span>Ca làm việc</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span>·</span>
              <span>FT: Full-time</span>
              <span>·</span>
              <span>PT: Part-time</span>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 4. SHIFT REGISTRATION MODAL                                          */}
      {/* -------------------------------------------------------------------- */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Đăng ký ca làm việc
                  </h3>
                  <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                    {rosterData?.department || "Bộ phận"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chọn ca làm việc hoặc ngày nghỉ cho tuần {modalRangeLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Week Switcher Tabs */}
            <div className="flex items-center gap-2 px-6 pt-3 pb-1 border-b border-slate-100 bg-slate-50/60">
              <span className="text-xs font-semibold text-slate-500 mr-1">Chọn tuần:</span>
              <button
                type="button"
                onClick={() => {
                  setModalWeekMonday(currentWeekMonday);
                  void loadRegistrationContext(currentWeekMonday);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  modalWeekMonday === currentWeekMonday
                    ? "bg-sky-600 text-white shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                Tuần này ({formatShortDate(currentWeekMonday)} – {formatShortDate(addDays(currentWeekMonday, 6))})
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalWeekMonday(nextWeekMonday);
                  void loadRegistrationContext(nextWeekMonday);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  modalWeekMonday === nextWeekMonday
                    ? "bg-sky-600 text-white shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                Tuần tới ({formatShortDate(nextWeekMonday)} – {formatShortDate(addDays(nextWeekMonday, 6))})
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6 space-y-4">
              {registerError && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span>{registerError}</span>
                </div>
              )}

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-500 mr-1">Điền nhanh:</span>
                {shifts.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => applyPreset(s.id, true)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    {s.name} (T2–T6)
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => applyPreset(null)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Nghỉ tất cả
                </button>
              </div>

              {/* 7 Days Inputs */}
              <div className="space-y-2.5">
                {modalWeekDays.map((day) => {
                  const currentVal = registrationForm[day.date] || { shift_id: null, note: "" };
                  const existingReg = modalWeekRegistrations.find((r) => r.date === day.date);

                  return (
                    <div
                      key={day.date}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3"
                    >
                      {/* Day Label */}
                      <div className="sm:w-36 shrink-0">
                        <span className="font-semibold text-slate-900 text-xs">
                          {day.fullDayName}
                        </span>
                        <span className="ml-2 text-xs font-mono text-slate-500">
                          {formatShortDate(day.date)}
                        </span>
                        {existingReg && (
                          <div className="mt-0.5">
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                existingReg.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : existingReg.status === "PENDING"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {existingReg.status === "APPROVED"
                                ? "Đã duyệt"
                                : existingReg.status === "PENDING"
                                  ? "Chờ duyệt"
                                  : "Từ chối"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Shift Selection */}
                      <div className="flex-1">
                        <select
                          value={currentVal.shift_id ?? ""}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setRegistrationForm((prev) => ({
                              ...prev,
                              [day.date]: {
                                ...prev[day.date],
                                shift_id: val,
                              },
                            }));
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-sky-500"
                        >
                          <option value="">Nghỉ ca (Không đi làm / OFF)</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({formatTime(s.start_time)} – {formatTime(s.end_time)})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Note */}
                      <div className="sm:w-44 shrink-0">
                        <input
                          type="text"
                          placeholder="Ghi chú (nếu có)"
                          value={currentVal.note}
                          onChange={(e) => {
                            const noteVal = e.target.value;
                            setRegistrationForm((prev) => ({
                              ...prev,
                              [day.date]: {
                                ...prev[day.date],
                                note: noteVal,
                              },
                            }));
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-3.5 bg-slate-50/60">
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={submittingRegister}
                onClick={() => void handleSubmitRegistration()}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-sky-800 transition disabled:opacity-50"
              >
                <Send size={14} />
                <span>{submittingRegister ? "Đang gửi..." : "Lưu & Gửi đăng ký"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
