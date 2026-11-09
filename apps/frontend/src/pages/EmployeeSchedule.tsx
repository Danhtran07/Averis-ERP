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

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
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
      setError(getApiErrorMessage(err, "Unable to load employee schedule."));
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

  if (loading) return <LoadingState message="Loading schedule..." />;
  if (error) return <ErrorState message={error} onRetry={() => void loadSchedule()} />;

  const shift = data?.shift;

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
            Personal planning
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {isAdmin && employee ? `${employee.full_name}'s schedule` : "My schedule"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            View your assigned shift for any day and inspect your full 7-day weekly work pattern.
          </p>
        </div>
        <label className="w-full sm:w-48">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Date
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </header>

      {/* Selected Day Shift Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              {isAdmin ? <UserRound size={22} /> : <CalendarDays size={22} />}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">
                {new Date(`${targetDate}T12:00:00`).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              {data?.schedule ? (
                <>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {data.schedule.name}
                  </h2>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                    {data.schedule.code}
                  </p>
                </>
              ) : (
                <h2 className="mt-1 text-xl font-bold text-slate-900">No shift assigned</h2>
              )}
            </div>
          </div>
          {shift && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <Clock3 size={14} />
              Active Shift Day
            </span>
          )}
        </div>

        {shift ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <Clock3 className="text-blue-600" size={18} />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Shift
              </p>
              <p className="mt-1 font-bold text-slate-900">{shift.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{shift.code}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Hours
              </p>
              <p className="mt-4 font-bold text-slate-900">
                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
              </p>
              {shift.is_overnight && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-violet-600">
                  <MoonStar size={12} /> Overnight shift
                </p>
              )}
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Check-in Policy
              </p>
              <p className="mt-4 font-bold text-slate-900">
                {shift.late_tolerance_minutes} min late grace
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Opens {shift.early_checkin_minutes} min before start
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
            There is no active shift scheduled for this date (Rest day / Unassigned).
          </div>
        )}
      </div>

      {/* 7-Day Weekly Schedule Overview */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">7-Day Weekly Overview</h2>
            <p className="text-xs text-slate-500">
              Week starting {weekStartDate} · Click any day to inspect shift details
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTargetDate(new Date().toISOString().slice(0, 10))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Jump to Today
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
                className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-100"
                    : dayShift
                      ? "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                      : "border-slate-100 bg-slate-50/70 text-slate-400 hover:border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-xs font-bold uppercase ${
                      isSelected ? "text-blue-700" : "text-slate-500"
                    }`}
                  >
                    {DAY_NAMES[idx]}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {dayItem.date.slice(5)}
                  </span>
                </div>

                <div className="mt-3">
                  {dayShift ? (
                    <>
                      <p className="text-xs font-bold text-slate-900 line-clamp-1">
                        {dayShift.name}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-blue-600">
                        {formatTime(dayShift.start_time)}–{formatTime(dayShift.end_time)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs font-medium text-slate-400">
                      {FULL_DAY_NAMES[idx]} Off
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