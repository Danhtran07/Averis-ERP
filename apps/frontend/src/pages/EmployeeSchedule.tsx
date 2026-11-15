import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, MoonStar, UserRound } from "lucide-react";
import { useParams } from "react-router-dom";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getApiErrorMessage } from "../api/error";
import { getEmployeeSchedule, getMySchedule, getMyWeekSchedule } from "../api/schedule.api";
import { getEmployees } from "../api/employee.api";
import type { Employee } from "../types/employee";
import type { EmployeeSchedule, EmployeeWeekSchedule } from "../types/schedule";

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

export default function EmployeeSchedule() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const isAdmin = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").role === "ADMIN";
    } catch {
      return false;
    }
  })();
  const [targetDate, setTargetDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<EmployeeSchedule | null>(null);
  const [weekData, setWeekData] = useState<EmployeeWeekSchedule | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const weekStartDate = useMemo(() => getMondayOfDate(targetDate), [targetDate]);

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
        const weekResult = await getMyWeekSchedule(weekStartDate).catch(() => null);
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

  useEffect(() => {
    void loadSchedule();
  }, [employeeId, targetDate, isAdmin]);

  const weeklyDays = useMemo(() => {
    if (weekData && weekData.days.length === 7) {
      return weekData.days;
    }
    const rulesMap = new Map(
      (data?.schedule?.rules ?? []).map((r) => [r.day_of_week, r.shift])
    );
    return [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => {
      const dateStr = addDays(weekStartDate, dayOfWeek - 1);
      const shift = rulesMap.get(dayOfWeek) ?? null;
      return {
        date: dateStr,
        day_of_week: dayOfWeek,
        shift,
        is_off: !shift,
      };
    });
  }, [weekData, data, weekStartDate]);

  if (loading) return <LoadingState message="Đang tải lịch làm việc..." />;
  if (error) return <ErrorState message={error} onRetry={() => void loadSchedule()} />;

  const shift = data?.shift;

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isAdmin && employee ? `Lịch ca: ${employee.full_name}` : "Lịch ca của tôi"}
          </h1>
        </div>
        <label className="w-full sm:w-48">
          <span className="mb-1.5 block text-xs font-semibold   text-slate-500">
            Ngày
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400"
          />
        </label>
      </header>

      {/* Selected Day Shift Card */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                {new Date(`${targetDate}T12:00:00`).toLocaleDateString("vi-VN", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              {data?.schedule ? (
                <>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">
                    {data.schedule.name}
                  </h2>
                  <p className="mt-1 text-xs font-semibold   text-slate-400">
                    {data.schedule.code}
                  </p>
                </>
              ) : (
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Chưa được phân ca</h2>
              )}
            </div>
          </div>
          {shift && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-sky-600/20">
              <Clock3 size={14} />
              Có ca làm việc
            </span>
          )}
        </div>

        {shift ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-4">
              <Clock3 className="text-slate-700" size={18} />
              <p className="mt-3 text-xs font-semibold   text-slate-400">
                Ca làm việc
              </p>
              <p className="mt-1 font-semibold text-slate-900">{shift.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{shift.code}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-xs font-semibold   text-slate-400">
                Khung giờ
              </p>
              <p className="mt-4 font-semibold text-slate-900">
                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
              </p>
              {shift.is_overnight && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                  <MoonStar size={12} /> Ca qua đêm
                </p>
              )}
            </div>
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-xs font-semibold   text-slate-400">
                Quy định chấm công
              </p>
              <p className="mt-4 font-semibold text-slate-900">
                Cho phép trễ {shift.late_tolerance_minutes} phút
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Mở check-in trước {shift.early_checkin_minutes} phút
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
            Không có ca làm việc nào được xếp cho ngày này (Ngày nghỉ / Chưa phân ca).
          </div>
        )}
      </div>

      {/* 7-Day Weekly Schedule Overview */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Lịch làm việc 7 ngày trong tuần</h2>
            <p className="text-xs text-slate-500">
              Tuần bắt đầu từ {weekStartDate} · Bấm vào từng ngày để xem chi tiết ca
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTargetDate(new Date().toISOString().slice(0, 10))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Về hôm nay
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {weeklyDays.map((dayItem, idx) => {
            const isSelected = dayItem.date === targetDate;
            const dayShift = dayItem.shift;
            return (
              <button
                key={dayItem.date}
                type="button"
                onClick={() => setTargetDate(dayItem.date)}
                className={`flex flex-col justify-between rounded-md border p-3.5 text-left transition ${
                  isSelected
                    ? "border-sky-600 bg-gradient-to-br from-sky-600 to-blue-600 text-white shadow-sm shadow-sky-600/20"
                    : dayShift
                      ? "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40"
                      : "border-slate-100 bg-slate-50/70 text-slate-400 hover:border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-xs font-semibold  ${
                      isSelected ? "text-white" : "text-slate-500"
                    }`}
                  >
                    {DAY_NAMES[idx]}
                  </span>
                  <span className={`text-[11px] font-semibold ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                    {dayItem.date.slice(5)}
                  </span>
                </div>

                <div className="mt-3">
                  {dayShift ? (
                    <>
                      <p className={`text-xs font-semibold line-clamp-1 ${isSelected ? "text-white" : "text-slate-900"}`}>
                        {dayShift.name}
                      </p>
                      <p className={`mt-1 text-[11px] font-medium ${isSelected ? "text-slate-300" : "text-slate-600"}`}>
                        {formatTime(dayShift.start_time)}–{formatTime(dayShift.end_time)}
                      </p>
                    </>
                  ) : (
                    <p className={`text-xs font-medium ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                      {FULL_DAY_NAMES[idx]} · Nghỉ
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}