import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MoonStar,
  Plus,
  Send,
  Users,
  X,
} from "lucide-react";
import { useParams } from "react-router-dom";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getApiErrorMessage } from "../api/error";
import {
  getDepartmentCoworkers,
  getDepartmentWeekRoster,
  getEmployeeSchedule,
  getMySchedule,
  getMyShiftRegistrations,
  getMyWeekSchedule,
  getShifts,
  submitShiftRegistrations,
} from "../api/schedule.api";
import { getEmployees } from "../api/employee.api";
import type { Employee } from "../types/employee";
import type {
  DepartmentCoworkersResponse,
  DepartmentRosterMember,
  DepartmentWeekRosterResponse,
  EmployeeSchedule,
  EmployeeWeekSchedule,
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

  // Selected date for daily inspector
  const [targetDate, setTargetDate] = useState<string>(todayStr);

  // Active week monday for the weekly matrix table
  const [activeWeekMonday, setActiveWeekMonday] = useState<string>(currentWeekMonday);

  // Data states
  const [data, setData] = useState<EmployeeSchedule | null>(null);
  const [weekData, setWeekData] = useState<EmployeeWeekSchedule | null>(null);
  const [rosterData, setRosterData] = useState<DepartmentWeekRosterResponse | null>(null);
  const [loadingRoster, setLoadingRoster] = useState<boolean>(true);
  const [coworkersData, setCoworkersData] = useState<DepartmentCoworkersResponse | null>(null);
  const [loadingCoworkers, setLoadingCoworkers] = useState<boolean>(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Shift registration states
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [modalWeekMonday, setModalWeekMonday] = useState(nextWeekMonday);
  const [registrationForm, setRegistrationForm] = useState<
    Record<string, { shift_id: number | null; note: string }>
  >({});
  const [submittingRegister, setSubmittingRegister] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState("");
  const [myWeekRegistrations, setMyWeekRegistrations] = useState<ShiftRegistrationResponse[]>([]);

  // Computed days for active week matrix
  const matrixDays = useMemo(() => getWeekDaysFromMonday(activeWeekMonday), [activeWeekMonday]);
  const matrixWeekSunday = useMemo(() => addDays(activeWeekMonday, 6), [activeWeekMonday]);
  const matrixRangeLabel = `${formatShortDate(activeWeekMonday)} – ${formatShortDate(matrixWeekSunday)}`;

  // Computed days for registration modal
  const modalWeekDays = useMemo(() => getWeekDaysFromMonday(modalWeekMonday), [modalWeekMonday]);
  const modalWeekSunday = useMemo(() => addDays(modalWeekMonday, 6), [modalWeekMonday]);
  const modalRangeLabel = `${formatShortDate(modalWeekMonday)} – ${formatShortDate(modalWeekSunday)}`;

  // Load single day employee schedule
  async function loadSchedule() {
    try {
      setLoading(true);
      setError("");
      const isSpecificEmployee = Boolean(employeeId && employeeId !== "me" && isAdmin);
      const result = isSpecificEmployee
        ? await getEmployeeSchedule(Number(employeeId), targetDate)
        : await getMySchedule(targetDate);
      setData(result);

      if (!isSpecificEmployee) {
        const weekResult = await getMyWeekSchedule(activeWeekMonday).catch(() => null);
        setWeekData(weekResult);
      } else {
        setWeekData(null);
      }

      if (isSpecificEmployee) {
        const employees = await getEmployees();
        setEmployee(employees.find((item) => item.id === Number(employeeId)) || null);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể tải lịch làm việc của nhân sự."));
    } finally {
      setLoading(false);
    }
  }

  // Load department weekly matrix
  async function loadDepartmentRoster() {
    try {
      setLoadingRoster(true);
      const isSpecificEmployee = Boolean(employeeId && employeeId !== "me" && isAdmin);
      const res = await getDepartmentWeekRoster(
        activeWeekMonday,
        isSpecificEmployee ? Number(employeeId) : undefined
      );
      setRosterData(res);
    } catch {
      setRosterData(null);
    } finally {
      setLoadingRoster(false);
    }
  }

  // Load daily coworkers
  async function loadCoworkers() {
    try {
      setLoadingCoworkers(true);
      const isSpecificEmployee = Boolean(employeeId && employeeId !== "me" && isAdmin);
      const res = await getDepartmentCoworkers(
        targetDate,
        isSpecificEmployee ? Number(employeeId) : undefined
      );
      setCoworkersData(res);
    } catch {
      setCoworkersData(null);
    } finally {
      setLoadingCoworkers(false);
    }
  }

  // Load shifts for registration modal
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
      setMyWeekRegistrations(myRegs);

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

  useEffect(() => {
    void loadSchedule();
  }, [employeeId, targetDate, isAdmin]);

  useEffect(() => {
    void loadDepartmentRoster();
  }, [employeeId, activeWeekMonday, isAdmin]);

  useEffect(() => {
    void loadCoworkers();
  }, [employeeId, targetDate, isAdmin]);

  function openRegistrationForWeek(weekMonday: string) {
    setModalWeekMonday(weekMonday);
    setRegisterError("");
    void loadRegistrationContext(weekMonday);
    setShowRegisterModal(true);
  }

  // Quick preset helper inside modal
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
      setMyWeekRegistrations(updated);
      setRegisterSuccessMsg(`Đã gửi đăng ký lịch tuần (${modalRangeLabel}) thành công.`);
      setShowRegisterModal(false);
      setTimeout(() => setRegisterSuccessMsg(""), 5000);

      void loadDepartmentRoster();
      void loadSchedule();
      void loadCoworkers();
    } catch (err) {
      setRegisterError(getApiErrorMessage(err, "Không thể gửi đăng ký lịch làm việc."));
    } finally {
      setSubmittingRegister(false);
    }
  }

  if (loading) return <LoadingState message="Đang tải lịch làm việc..." />;
  if (error) return <ErrorState message={error} onRetry={() => void loadSchedule()} />;

  const shift = data?.shift;
  const isViewingCurrentWeek = activeWeekMonday === currentWeekMonday;
  const isViewingNextWeek = activeWeekMonday === nextWeekMonday;

  return (
    <section className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Header with Title and Quick Actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {isAdmin && employee ? `Lịch ca: ${employee.full_name}` : "Lịch làm việc & Đăng ký ca"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Xem lịch trực tuần cùng đồng nghiệp trong bộ phận và đăng ký lịch làm việc
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSelf && (
            <button
              type="button"
              onClick={() => openRegistrationForWeek(nextWeekMonday)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 hover:from-sky-700 hover:to-blue-700 transition"
            >
              <Send size={14} />
              <span>Đăng ký ca tuần tới</span>
            </button>
          )}

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-2xs">
            <span className="text-slate-400">Xem ngày:</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => {
                const newDate = e.target.value;
                setTargetDate(newDate);
                setActiveWeekMonday(getMondayOfDate(newDate));
              }}
              className="bg-transparent text-xs font-semibold text-slate-800 outline-none"
            />
          </label>
        </div>
      </header>

      {/* Success Notification */}
      {registerSuccessMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{registerSuccessMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MAIN WEEKLY DEPARTMENT ROSTER TABLE (EXCEL-STYLE SPREADSHEET VIEW)       */}
      {/* ========================================================================= */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Table Control Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white shadow-xs">
              <Users size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Bảng lịch ca tuần: {rosterData?.department || "Bộ phận"}
                </h2>
                {rosterData?.members && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">
                    {rosterData.members.length} nhân sự
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Chỉ hiển thị thành viên cùng bộ phận · Tuần từ {matrixRangeLabel}
              </p>
            </div>
          </div>

          {/* Week Navigation Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveWeekMonday(addDays(activeWeekMonday, -7))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs"
              title="Tuần trước"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              onClick={() => setActiveWeekMonday(currentWeekMonday)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition shadow-2xs ${
                isViewingCurrentWeek
                  ? "bg-sky-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Tuần này
            </button>

            <button
              type="button"
              onClick={() => setActiveWeekMonday(nextWeekMonday)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition shadow-2xs ${
                isViewingNextWeek
                  ? "bg-sky-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Tuần tới
            </button>

            <button
              type="button"
              onClick={() => setActiveWeekMonday(addDays(activeWeekMonday, 7))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs"
              title="Tuần sau nữa"
            >
              <ChevronRight size={16} />
            </button>

            {isSelf && (
              <button
                type="button"
                onClick={() => openRegistrationForWeek(activeWeekMonday)}
                className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 transition shadow-2xs"
              >
                <Plus size={14} />
                <span>Đăng ký tuần này</span>
              </button>
            )}
          </div>
        </div>

        {/* Loading / Empty / Table Body */}
        {loadingRoster ? (
          <div className="py-16 text-center text-xs text-slate-400">
            Đang tải dữ liệu bảng lịch ca tuần...
          </div>
        ) : !rosterData?.department ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Tài khoản chưa được cấu hình bộ phận (Ví dụ: Bếp, Thu ngân, Pha chế). Vui lòng liên hệ quản lý để gán bộ phận.
          </div>
        ) : rosterData.members.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Không có nhân sự nào khác trong bộ phận {rosterData.department}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-700">
                  <th className="w-12 border-r border-slate-200 px-3 py-3 text-center font-bold">
                    STT
                  </th>
                  <th className="min-w-[190px] border-r border-slate-200 px-3.5 py-3 font-bold uppercase tracking-wider">
                    Nhân viên (NAME)
                  </th>
                  <th className="w-20 border-r border-slate-200 px-2 py-3 text-center font-bold uppercase tracking-wider">
                    Loại NV
                  </th>

                  {matrixDays.map((dayItem, dIdx) => {
                    const isToday = dayItem.date === todayStr;
                    const isSelected = dayItem.date === targetDate;
                    const isWeekend = dIdx >= 5;

                    return (
                      <th
                        key={dayItem.date}
                        onClick={() => setTargetDate(dayItem.date)}
                        className={`min-w-[120px] cursor-pointer border-r border-slate-200 px-2 py-2.5 text-center font-bold transition ${
                          isSelected
                            ? "bg-sky-100 text-sky-950 ring-2 ring-inset ring-sky-500"
                            : isWeekend
                              ? "bg-rose-50/80 text-rose-900 hover:bg-rose-100/80"
                              : "bg-emerald-50/70 text-emerald-950 hover:bg-emerald-100/70"
                        }`}
                      >
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-[11px] font-black tracking-wide">
                            {formatShortDate(dayItem.date)}
                          </span>
                          <span className="mt-0.5 text-[10px] font-semibold opacity-90">
                            {dayItem.fullDayName}
                          </span>
                          {isToday && (
                            <span className="mt-0.5 rounded bg-sky-600 px-1.5 py-0.2 text-[8px] font-bold text-white uppercase">
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
                          ? "bg-sky-50/60 font-medium hover:bg-sky-50"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      {/* STT */}
                      <td className="border-r border-slate-200 px-3 py-3 text-center font-mono text-[11px] text-slate-500">
                        {mIdx + 1}
                      </td>

                      {/* Name & Code */}
                      <td className="border-r border-slate-200 px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border ${
                              isUserRow
                                ? "bg-sky-600 text-white border-sky-600"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {member.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 truncate">
                                {member.full_name}
                              </span>
                              {isUserRow && (
                                <span className="shrink-0 rounded bg-sky-600 px-1.5 py-0.2 text-[9px] font-bold text-white shadow-2xs">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">
                              {member.employee_code}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Salary Type: FT or PT */}
                      <td className="border-r border-slate-200 px-2 py-3 text-center">
                        <span
                          title={salaryInfo.title}
                          className={`inline-block rounded px-2 py-0.5 font-black text-[10px] tracking-wider border ${
                            salaryInfo.label === "FT"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-purple-50 text-purple-800 border-purple-300"
                          }`}
                        >
                          {salaryInfo.label}
                        </span>
                      </td>

                      {/* 7 Days Shifts */}
                      {member.schedule.map((dayShift, sIdx) => {
                        const dayMeta = matrixDays[sIdx];
                        const isDaySelected = dayMeta?.date === targetDate;

                        return (
                          <td
                            key={dayShift.date || sIdx}
                            onClick={() => {
                              if (dayShift.date) setTargetDate(dayShift.date);
                            }}
                            className={`border-r border-slate-200 p-2 text-center align-middle transition cursor-pointer ${
                              isDaySelected
                                ? "bg-sky-100/50"
                                : ""
                            }`}
                          >
                            {dayShift.is_off ? (
                              <div className="flex flex-col items-center justify-center">
                                <span className="inline-flex items-center justify-center rounded-md bg-rose-700 px-3 py-1 font-black text-white text-[11px] tracking-wider shadow-2xs">
                                  OFF
                                </span>
                                {dayShift.registration_status === "PENDING" && (
                                  <span className="mt-0.5 text-[8px] font-semibold text-amber-600">
                                    Đang chờ duyệt
                                  </span>
                                )}
                              </div>
                            ) : dayShift.shift ? (
                              <div
                                className={`inline-flex flex-col items-center justify-center rounded-lg px-2.5 py-1 text-center shadow-2xs border ${
                                  dayShift.shift.start_time < "12:00:00"
                                    ? "bg-amber-100 text-amber-950 border-amber-300"
                                    : dayShift.shift.start_time >= "12:00:00" && dayShift.shift.start_time < "18:00:00"
                                      ? "bg-indigo-100 text-indigo-950 border-indigo-300"
                                      : "bg-slate-800 text-white border-slate-700"
                                }`}
                                title={`${dayShift.shift.name} (${formatTime(dayShift.shift.start_time)} - ${formatTime(dayShift.shift.end_time)})`}
                              >
                                <span className="font-bold text-[11px] tracking-tight leading-tight">
                                  {formatTime(dayShift.shift.start_time)}–{formatTime(dayShift.shift.end_time)}
                                </span>
                                <span className="mt-0.5 text-[9px] font-medium opacity-85 truncate max-w-[85px] leading-tight">
                                  {dayShift.shift.name}
                                </span>
                                {dayShift.registration_status === "PENDING" && (
                                  <span className="mt-0.5 rounded bg-amber-500 text-white px-1 py-0.2 text-[7px] font-bold">
                                    Chờ duyệt
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-slate-300">–</span>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold text-slate-700">Chú thích ca:</span>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-6 rounded bg-rose-700 text-white text-[8px] font-black text-center leading-3.5">
                OFF
              </span>
              <span>Nghỉ ca</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-6 rounded border border-amber-300 bg-amber-100"></span>
              <span>Ca Sáng</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-6 rounded border border-indigo-300 bg-indigo-100"></span>
              <span>Ca Chiều / Tối</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block rounded border border-emerald-300 bg-emerald-50 px-1 font-bold text-[9px] text-emerald-800">
                FT
              </span>
              <span>Full-time</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block rounded border border-purple-300 bg-purple-50 px-1 font-bold text-[9px] text-purple-800">
                PT
              </span>
              <span>Part-time</span>
            </div>
          </div>

          <div className="text-slate-400">
            * Bấm vào tiêu đề ngày hoặc ô ca để xem danh sách nhân sự đi làm trong ngày
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DAILY COWORKERS & SHIFT DETAILS (SELECTED DAY BREAKDOWN)                  */}
      {/* ========================================================================= */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Department Teammates on Selected Day */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <Users size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Đồng nghiệp cùng bộ phận đi làm ngày {formatShortDate(targetDate)}
                </h3>
                {coworkersData?.department && (
                  <p className="text-xs text-slate-500">
                    Bộ phận: <strong className="text-slate-800">{coworkersData.department}</strong>
                  </p>
                )}
              </div>
            </div>

            {coworkersData && coworkersData.coworkers.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
                {coworkersData.coworkers.length} nhân sự
              </span>
            )}
          </div>

          {loadingCoworkers ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Đang tải danh sách đồng nghiệp cùng bộ phận...
            </div>
          ) : !coworkersData?.department ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-xs text-slate-400">
              Chưa thiết lập bộ phận để hiển thị danh sách đồng nghiệp cùng ca.
            </div>
          ) : coworkersData.coworkers.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-500">
              Không có đồng nghiệp nào khác thuộc bộ phận {coworkersData.department} có ca làm việc vào ngày này.
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {coworkersData.coworkers.map((colleague) => {
                const isSameShift = Boolean(
                  shift &&
                    shift.start_time === colleague.shift.start_time &&
                    shift.end_time === colleague.shift.end_time
                );

                return (
                  <div
                    key={colleague.id}
                    className={`flex flex-col justify-between rounded-xl border p-3.5 transition ${
                      isSameShift
                        ? "border-sky-300 bg-sky-50/50"
                        : "border-slate-200 bg-slate-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white font-bold text-slate-700 shadow-2xs text-xs border border-slate-200">
                        {colleague.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-bold text-slate-900">
                            {colleague.full_name}
                          </span>
                          {isSameShift && (
                            <span className="shrink-0 rounded bg-sky-600 px-1.5 py-0.2 text-[9px] font-bold text-white">
                              Cùng ca
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">
                          {colleague.employee_code}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg bg-white p-2 border border-slate-100 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-slate-800 line-clamp-1">
                          {colleague.shift.name}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">
                          {formatTime(colleague.shift.start_time)} – {formatTime(colleague.shift.end_time)}
                        </p>
                      </div>
                      {colleague.shift.is_overnight && (
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700 flex items-center gap-0.5">
                          <MoonStar size={10} /> Đêm
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: My Shift on Selected Day */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-xs font-semibold text-slate-500">Ca làm việc của bạn</p>
                <h3 className="text-sm font-bold text-slate-900">
                  {new Date(`${targetDate}T12:00:00`).toLocaleDateString("vi-VN", {
                    weekday: "long",
                    day: "numeric",
                    month: "numeric",
                  })}
                </h3>
              </div>
              {shift ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                  Có ca
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
                  Nghỉ ca (OFF)
                </span>
              )}
            </div>

            {shift ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400">Ca trực</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{shift.name}</p>
                  <p className="text-xs font-mono text-slate-500">{shift.code}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400">Khung giờ</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                  </p>
                  {shift.is_overnight && (
                    <p className="mt-1 text-xs font-medium text-indigo-600 flex items-center gap-1">
                      <MoonStar size={12} /> Ca qua đêm
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400">Quy định chấm công</span>
                  <p className="text-xs font-medium text-slate-700 mt-0.5">
                    Cho phép trễ {shift.late_tolerance_minutes} phút · Mở sớm {shift.early_checkin_minutes} phút
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                Hôm nay bạn không có lịch ca làm việc (Ngày nghỉ).
              </div>
            )}
          </div>

          {isSelf && (
            <div className="mt-5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => openRegistrationForWeek(activeWeekMonday)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 py-2.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 transition"
              >
                <CalendarDays size={14} />
                <span>Đổi / Đăng ký ca tuần này</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SHIFT REGISTRATION MODAL                                                  */}
      {/* ========================================================================= */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Đăng ký ca làm việc
                </h3>
                <p className="text-xs text-slate-500">
                  Tuần từ {modalRangeLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

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
              <div className="space-y-3">
                {modalWeekDays.map((day) => {
                  const currentVal = registrationForm[day.date] || { shift_id: null, note: "" };
                  const existingReg = myWeekRegistrations.find((r) => r.date === day.date);

                  return (
                    <div
                      key={day.date}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3"
                    >
                      {/* Day Label */}
                      <div className="sm:w-36 shrink-0">
                        <span className="font-semibold text-slate-900 text-sm">
                          {day.fullDayName}
                        </span>
                        <span className="ml-2 text-xs font-mono text-slate-500">
                          {formatShortDate(day.date)}
                        </span>
                        {existingReg && (
                          <div className="mt-0.5">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-sky-500"
                        >
                          <option value="">Nghỉ ca (Không đi làm)</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({formatTime(s.start_time)} – {formatTime(s.end_time)})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Note */}
                      <div className="sm:w-48 shrink-0">
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={submittingRegister}
                onClick={() => void handleSubmitRegistration()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 hover:from-sky-700 hover:to-blue-700 transition disabled:opacity-50"
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
