import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScanFace } from "lucide-react";

import { getEmployees } from "../api/employee.api";
import {
  getAIBiometricsMetrics,
  getAttendanceRequests,
  getAttendances,
} from "../api/attendance.api";
import { getMySchedule } from "../api/schedule.api";
import { getApiErrorMessage } from "../api/error";

import type { Employee } from "../types/employee";
import type {
  AIBiometricsMetricsResponse,
  Attendance,
  AttendanceRequestItem,
} from "../types/attendance";
import type { EmployeeSchedule } from "../types/schedule";

import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";

interface StoredUser {
  username?: string;
  role?: string;
}

interface Statistic {
  label: string;
  value: string | number;
}

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHours(minutes: number) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export default function Dashboard() {
  const user = useMemo<StoredUser>(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return {};
    try {
      return JSON.parse(storedUser);
    } catch {
      return {};
    }
  }, []);

  const username = user.username || "User";
  const isAdmin = user.role === "ADMIN";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [aiMetrics, setAiMetrics] = useState<AIBiometricsMetricsResponse | null>(null);
  const [requests, setRequests] = useState<AttendanceRequestItem[]>([]);
  const [mySchedule, setMySchedule] = useState<EmployeeSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const currentMonthPrefix = today.slice(0, 7);

  const displayDate = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      if (isAdmin) {
        const [employeeData, attendanceData, aiData, reqData] = await Promise.all([
          getEmployees(),
          getAttendances(),
          getAIBiometricsMetrics().catch(() => null),
          getAttendanceRequests().catch(() => []),
        ]);
        setEmployees(employeeData);
        setAttendances(attendanceData);
        setAiMetrics(aiData);
        setRequests(reqData);
      } else {
        const [attendanceData, scheduleData, reqData] = await Promise.all([
          getAttendances(),
          getMySchedule(today).catch(() => null),
          getAttendanceRequests().catch(() => []),
        ]);
        setAttendances(attendanceData);
        setMySchedule(scheduleData);
        setRequests(reqData);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể tải dữ liệu."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [isAdmin]);

  const todayAttendances = useMemo(
    () => attendances.filter((item) => item.date === today),
    [attendances, today]
  );

  const monthAttendances = useMemo(
    () => attendances.filter((item) => item.date.startsWith(currentMonthPrefix)),
    [attendances, currentMonthPrefix]
  );

  const totalEmployees = employees.length;
  const presentCount = todayAttendances.filter((item) => item.status === "PRESENT").length;
  const lateCount = todayAttendances.filter((item) => item.status === "LATE").length;

  const pendingRequestsCount = useMemo(
    () => requests.filter((r) => r.status === "PENDING").length,
    [requests]
  );

  const employeeMap = useMemo(() => {
    const map = new Map<number, Employee>();
    employees.forEach((employee) => {
      map.set(employee.id, employee);
    });
    return map;
  }, [employees]);

  const departmentStats = useMemo(() => {
    if (!isAdmin || employees.length === 0) return [];
    const groups = new Map<
      string,
      { department: string; total: number; checkedIn: number; late: number }
    >();

    const todayByEmp = new Map<number, Attendance>();
    todayAttendances.forEach((a) => todayByEmp.set(a.employee_id, a));

    employees.forEach((emp) => {
      const dept = emp.department?.trim() || "Chưa phân quầy";
      const current = groups.get(dept) || {
        department: dept,
        total: 0,
        checkedIn: 0,
        late: 0,
      };
      current.total += 1;
      const att = todayByEmp.get(emp.id);
      if (att && (att.status === "PRESENT" || att.status === "LATE")) {
        current.checkedIn += 1;
      }
      if (att && att.status === "LATE") {
        current.late += 1;
      }
      groups.set(dept, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.total - a.total);
  }, [employees, todayAttendances, isAdmin]);

  const totalMonthWorkingMinutes = useMemo(
    () => monthAttendances.reduce((sum, a) => sum + (a.working_minutes || 0), 0),
    [monthAttendances]
  );
  const totalMonthLateMinutes = useMemo(
    () => monthAttendances.reduce((sum, a) => sum + (a.late_minutes || 0), 0),
    [monthAttendances]
  );
  const totalMonthOvertimeMinutes = useMemo(
    () => monthAttendances.reduce((sum, a) => sum + (a.overtime_minutes || 0), 0),
    [monthAttendances]
  );

  const adminStatistics: Statistic[] = [
    { label: "Nhân sự vào ca hôm nay", value: `${presentCount + lateCount} / ${totalEmployees}` },
    { label: "Tổng giờ công tháng", value: formatHours(totalMonthWorkingMinutes) },
    { label: "Phút trễ ca / Tăng ca", value: `${totalMonthLateMinutes}p / ${formatHours(totalMonthOvertimeMinutes)}` },
    { label: "Đơn chờ duyệt", value: pendingRequestsCount },
  ];

  const myTodayRecord = todayAttendances[0] || null;
  const myLateMinutesMonth = monthAttendances.reduce(
    (sum, a) => sum + (a.late_minutes || 0),
    0
  );
  const myOvertimeMinutesMonth = monthAttendances.reduce(
    (sum, a) => sum + (a.overtime_minutes || 0),
    0
  );
  const myWorkingMinutesMonth = monthAttendances.reduce(
    (sum, a) => sum + (a.working_minutes || 0),
    0
  );

  const employeeStatistics: Statistic[] = [
    {
      label: "Ca hôm nay",
      value: myTodayRecord
        ? myTodayRecord.status === "PRESENT"
          ? "Đúng giờ"
          : myTodayRecord.status === "LATE"
            ? "Đi trễ"
            : "Vắng"
        : "Chưa chấm công",
    },
    { label: "Tổng giờ làm tháng này", value: formatHours(myWorkingMinutesMonth) },
    { label: "Phút trễ / Tăng ca", value: `${myLateMinutesMonth}p / ${formatHours(myOvertimeMinutesMonth)}` },
    { label: "Đơn chờ duyệt", value: pendingRequestsCount },
  ];

  const recentAttendance = useMemo(() => {
    const source = isAdmin ? todayAttendances : attendances;
    return [...source]
      .sort((a, b) => {
        const timeA = a.check_in ? new Date(a.check_in).getTime() : 0;
        const timeB = b.check_in ? new Date(b.check_in).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 6);
  }, [todayAttendances, attendances, isAdmin]);

  const weeklyAttendance = useMemo(() => {
    const result: { day: string; date: string; percent: number }[] = [];
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);

    const denominator = isAdmin ? Math.max(1, totalEmployees) : 1;

    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateString = date.toISOString().split("T")[0];
      const dayAttendances = attendances.filter((item) => item.date === dateString);
      const validCount = dayAttendances.filter(
        (item) => item.status === "PRESENT" || item.status === "LATE"
      ).length;
      const percent =
        isAdmin && totalEmployees === 0
          ? 0
          : Math.min(100, Math.round((validCount / denominator) * 100));

      result.push({
        day: date.toLocaleDateString("vi-VN", { weekday: "long" }),
        date: dateString,
        percent,
      });
    }
    return result;
  }, [attendances, totalEmployees, isAdmin]);

  if (loading) {
    return <LoadingState message="Đang tải..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadDashboard} />;
  }

  const statistics = isAdmin ? adminStatistics : employeeStatistics;

  const biometricStats: Statistic[] = aiMetrics
    ? [
        {
          label: "Độ khớp khuôn mặt TB",
          value:
            aiMetrics.avg_face_similarity > 0
              ? `${(aiMetrics.avg_face_similarity * 100).toFixed(1)}%`
              : "—",
        },
        {
          label: "Điểm xác thực TB",
          value:
            aiMetrics.avg_liveness_score > 0
              ? `${(aiMetrics.avg_liveness_score * 100).toFixed(1)}%`
              : "—",
        },
        {
          label: "Đã đăng ký khuôn mặt",
          value: `${aiMetrics.enrolled_employees} / ${totalEmployees}`,
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tổng quan</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {displayDate}
            {!isAdmin && mySchedule?.shift && (
              <>
                {" · "}
                {mySchedule.shift.name} ({mySchedule.shift.start_time.slice(0, 5)}–
                {mySchedule.shift.end_time.slice(0, 5)})
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-slate-500 sm:inline">{username}</span>
          <Link
            to="/recognition"
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-slate-800"
          >
            <ScanFace size={16} strokeWidth={2} aria-hidden="true" />
            Chấm công
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {statistics.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </section>

      {isAdmin && biometricStats.length > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {biometricStats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Chuyên cần 7 ngày</h2>
            <div className="mt-4 space-y-3">
              {weeklyAttendance.map((item) => (
                <AttendanceRow key={item.date} day={item.day} percent={item.percent} />
              ))}
            </div>
          </div>

          {isAdmin && departmentStats.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-slate-900">Theo vị trí / quầy</h2>
                <Link
                  to="/attendance?tab=timesheet"
                  className="text-xs text-slate-500 no-underline hover:text-slate-900 hover:underline"
                >
                  Bảng công
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {departmentStats.map((dept) => {
                  const pct =
                    dept.total > 0 ? Math.round((dept.checkedIn / dept.total) * 100) : 0;
                  return (
                    <div key={dept.department} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700">{dept.department}</span>
                        <span className="text-slate-500">
                          {dept.checkedIn}/{dept.total}
                          {dept.late > 0 ? ` · ${dept.late} trễ` : ""}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-800"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-900">Chấm công gần đây</h2>
            <Link
              to="/attendance"
              className="text-xs text-slate-500 no-underline hover:text-slate-900 hover:underline"
            >
              Xem tất cả
            </Link>
          </div>

          <div className="mt-2 divide-y divide-slate-100">
            {recentAttendance.length === 0 ? (
              <div className="py-6">
                <EmptyState title="Chưa có dữ liệu" message="" />
              </div>
            ) : (
              recentAttendance.map((item) => {
                const employee = employeeMap.get(item.employee_id);
                return (
                  <Activity
                    key={item.id}
                    name={
                      isAdmin
                        ? employee?.full_name ?? `Nhân viên #${item.employee_id}`
                        : item.date
                    }
                    department={isAdmin ? employee?.department : undefined}
                    time={item.check_in ? formatTime(item.check_in) : "-"}
                    checkOut={item.check_out ? formatTime(item.check_out) : null}
                    status={item.status}
                  />
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ stat }: { stat: Statistic }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{stat.label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-slate-900">{stat.value}</div>
    </div>
  );
}

function AttendanceRow({ day, percent }: { day: string; percent: number }) {
  return (
    <div className="grid grid-cols-[90px_1fr_40px] items-center gap-3">
      <span className="text-xs text-slate-500">{day}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-800" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-right text-xs text-slate-600">{percent}%</span>
    </div>
  );
}

function Activity({
  name,
  department,
  time,
  checkOut,
  status,
}: {
  name: string;
  department?: string | null;
  time: string;
  checkOut: string | null;
  status: string;
}) {
  const statusClass =
    status === "PRESENT"
      ? "text-slate-900"
      : status === "LATE"
        ? "text-amber-700"
        : "text-slate-400";

  const statusLabel =
    status === "PRESENT"
      ? "Đúng giờ"
      : status === "LATE"
        ? "Đi trễ"
        : status === "ABSENT"
          ? "Vắng"
          : status;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-800">{name}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {department ? `${department} · ` : ""}
          {time}
          {checkOut ? ` – ${checkOut}` : ""}
        </div>
      </div>
      <span className={`shrink-0 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
    </div>
  );
}
