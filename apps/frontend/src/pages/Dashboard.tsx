import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  ScanFace,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

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
  sub?: string;
  icon: ReactNode;
  tone: "indigo" | "emerald" | "amber" | "slate";
}

function formatTime(value: string | null) {
  if (!value) return "—";
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
  const [aiMetrics, setAiMetrics] = useState<AIBiometricsMetricsResponse | null>(
    null
  );
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
        const [employeeData, attendanceData, aiData, reqData] =
          await Promise.all([
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
    () =>
      attendances.filter((item) => item.date.startsWith(currentMonthPrefix)),
    [attendances, currentMonthPrefix]
  );

  const totalEmployees = employees.length;
  const presentCount = todayAttendances.filter(
    (item) => item.status === "PRESENT"
  ).length;
  const lateCount = todayAttendances.filter(
    (item) => item.status === "LATE"
  ).length;

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
    () =>
      monthAttendances.reduce((sum, a) => sum + (a.working_minutes || 0), 0),
    [monthAttendances]
  );
  const totalMonthLateMinutes = useMemo(
    () => monthAttendances.reduce((sum, a) => sum + (a.late_minutes || 0), 0),
    [monthAttendances]
  );
  const totalMonthOvertimeMinutes = useMemo(
    () =>
      monthAttendances.reduce((sum, a) => sum + (a.overtime_minutes || 0), 0),
    [monthAttendances]
  );

  const adminStatistics: Statistic[] = [
    {
      label: "Nhân sự vào ca hôm nay",
      value: `${presentCount + lateCount} / ${totalEmployees}`,
      sub: `${presentCount} đúng giờ · ${lateCount} trễ ca`,
      icon: <UsersRound size={18} />,
      tone: "indigo",
    },
    {
      label: "Tổng giờ công tháng",
      value: formatHours(totalMonthWorkingMinutes),
      sub: `${monthAttendances.length} lượt chấm công`,
      icon: <Clock3 size={18} />,
      tone: "emerald",
    },
    {
      label: "Phút trễ ca / Tăng ca",
      value: `${totalMonthLateMinutes}p / ${formatHours(totalMonthOvertimeMinutes)}`,
      sub: "Thống kê vận hành tháng",
      icon: <AlertTriangle size={18} />,
      tone: "amber",
    },
    {
      label: "Đơn từ chờ duyệt",
      value: pendingRequestsCount,
      sub: pendingRequestsCount > 0 ? "Cần xử lý phê duyệt" : "Đã xử lý hết",
      icon: <FileText size={18} />,
      tone: "slate",
    },
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
      label: "Trạng thái ca hôm nay",
      value: myTodayRecord
        ? myTodayRecord.status === "PRESENT"
          ? "Đúng giờ"
          : myTodayRecord.status === "LATE"
            ? "Đi trễ"
            : "Vắng"
        : "Chưa chấm công",
      sub: mySchedule?.shift
        ? `${mySchedule.shift.name} (${mySchedule.shift.start_time.slice(0, 5)}–${mySchedule.shift.end_time.slice(0, 5)})`
        : "Chưa có ca phân công",
      icon: <CalendarClock size={18} />,
      tone: myTodayRecord?.status === "PRESENT" ? "emerald" : "indigo",
    },
    {
      label: "Tổng giờ làm tháng này",
      value: formatHours(myWorkingMinutesMonth),
      sub: `${monthAttendances.length} ca đã ghi nhận`,
      icon: <Clock3 size={18} />,
      tone: "emerald",
    },
    {
      label: "Phút trễ / Tăng ca",
      value: `${myLateMinutesMonth}p / ${formatHours(myOvertimeMinutesMonth)}`,
      sub: "Tích luỹ trong tháng",
      icon: <AlertTriangle size={18} />,
      tone: "amber",
    },
    {
      label: "Đơn chờ duyệt",
      value: pendingRequestsCount,
      sub: "Giải trình & đổi ca",
      icon: <FileText size={18} />,
      tone: "slate",
    },
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
      const dayAttendances = attendances.filter(
        (item) => item.date === dateString
      );
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
    return <LoadingState message="Đang tải dữ liệu tổng quan..." />;
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
          sub: "ArcFace 512-D Cosine",
          icon: <ScanFace size={18} />,
          tone: "indigo",
        },
        {
          label: "Điểm xác thực Liveness TB",
          value:
            aiMetrics.avg_liveness_score > 0
              ? `${(aiMetrics.avg_liveness_score * 100).toFixed(1)}%`
              : "—",
          sub: "Anti-Spoofing đa tầng",
          icon: <ShieldCheck size={18} />,
          tone: "emerald",
        },
        {
          label: "Nhân sự đã đăng ký mặt",
          value: `${aiMetrics.enrolled_employees} / ${totalEmployees}`,
          sub: `${aiMetrics.total_face_embeddings} mẫu sinh trắc học`,
          icon: <CheckCircle2 size={18} />,
          tone: "slate",
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      {/* HEADER */}
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Tổng quan vận hành
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              7 ngày / tuần
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500 capitalize">
            {displayDate}
            {!isAdmin && mySchedule?.shift && (
              <span className="font-semibold text-indigo-700 normal-case">
                {" · "}
                {mySchedule.shift.name} ({mySchedule.shift.start_time.slice(0, 5)}
                –{mySchedule.shift.end_time.slice(0, 5)})
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/attendance"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
          >
            Bảng công tháng
          </Link>
          <Link
            to="/recognition"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white no-underline shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
          >
            <ScanFace size={15} strokeWidth={2} aria-hidden="true" />
            Quét khuôn mặt
          </Link>
        </div>
      </header>

      {/* PRIMARY KPI CARDS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statistics.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </section>

      {/* AI BIOMETRIC METRICS STRIP */}
      {isAdmin && biometricStats.length > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {biometricStats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </section>
      )}

      {/* MAIN CONTENT GRID */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {/* 7-DAY ATTENDANCE CHART */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Tỷ lệ vào ca 7 ngày trong tuần (T2 – CN)
              </h2>
              <Link
                to="/schedules"
                className="text-xs font-semibold text-indigo-600 no-underline hover:text-indigo-800"
              >
                Lịch phân ca →
              </Link>
            </div>
            <div className="mt-5 space-y-3.5">
              {weeklyAttendance.map((item) => (
                <AttendanceRow
                  key={item.date}
                  day={item.day}
                  isToday={item.date === today}
                  percent={item.percent}
                />
              ))}
            </div>
          </div>

          {/* STATION BREAKDOWN */}
          {isAdmin && departmentStats.length > 0 && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-bold text-slate-900">
                  Nhân sự theo Vị trí / Quầy hôm nay
                </h2>
                <Link
                  to="/timesheet"
                  className="text-xs font-semibold text-indigo-600 no-underline hover:text-indigo-800"
                >
                  Bảng lương giờ →
                </Link>
              </div>

              <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
                {departmentStats.map((dept) => {
                  const pct =
                    dept.total > 0
                      ? Math.round((dept.checkedIn / dept.total) * 100)
                      : 0;
                  return (
                    <div
                      key={dept.department}
                      className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">
                          {dept.department}
                        </span>
                        <span className="font-semibold text-slate-600">
                          {dept.checkedIn}/{dept.total} ca
                          {dept.late > 0 ? (
                            <span className="ml-1 text-amber-600">
                              · {dept.late} trễ
                            </span>
                          ) : (
                            ""
                          )}
                        </span>
                      </div>
                      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200/80">
                        <div
                          className="h-full rounded-full bg-indigo-600 transition-all"
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

        {/* RECENT ATTENDANCE FEED */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <h2 className="text-sm font-bold text-slate-900">
              Lượt chấm công gần đây
            </h2>
            <Link
              to="/attendance"
              className="text-xs font-semibold text-indigo-600 no-underline hover:text-indigo-800"
            >
              Xem tất cả →
            </Link>
          </div>

          <div className="mt-2 divide-y divide-slate-100">
            {recentAttendance.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  title="Chưa có lượt chấm công"
                  message=""
                />
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
                    time={item.check_in ? formatTime(item.check_in) : "—"}
                    checkOut={item.check_out ? formatTime(item.check_out) : null}
                    status={item.status}
                    lateMinutes={item.late_minutes}
                    earlyLeaveMinutes={item.early_leave_minutes}
                    workingMinutes={item.working_minutes}
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
  const toneStyles: Record<Statistic["tone"], string> = {
    indigo: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
    amber: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
    slate: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80",
  };

  return (
    <div className="flex items-start justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-slate-300">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500">{stat.label}</div>
        <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          {stat.value}
        </div>
      </div>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneStyles[stat.tone]}`}
      >
        {stat.icon}
      </div>
    </div>
  );
}

function AttendanceRow({
  day,
  isToday,
  percent,
}: {
  day: string;
  isToday?: boolean;
  percent: number;
}) {
  return (
    <div className="grid grid-cols-[105px_1fr_44px] items-center gap-3">
      <span
        className={`text-xs capitalize ${
          isToday ? "font-bold text-indigo-700" : "font-medium text-slate-600"
        }`}
      >
        {day}
        {isToday ? " (Nay)" : ""}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            percent >= 80
              ? "bg-emerald-500"
              : percent > 0
                ? "bg-indigo-600"
                : "bg-slate-300"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-right text-xs font-semibold text-slate-700">
        {percent}%
      </span>
    </div>
  );
}

function Activity({
  name,
  department,
  time,
  checkOut,
  status,
  lateMinutes = 0,
  earlyLeaveMinutes = 0,
  workingMinutes = 0,
}: {
  name: string;
  department?: string | null;
  time: string;
  checkOut?: string | null;
  status: string;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  workingMinutes?: number;
}) {
  const isShortShift = Boolean(checkOut && workingMinutes < 180);
  const isEarlyLeave = earlyLeaveMinutes > 15;
  const isLate = lateMinutes > 0 || status === "LATE";

  let statusInfo: { label: string; badge: string };
  if (status === "ABSENT") {
    statusInfo = {
      label: "Vắng mặt",
      badge: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    };
  } else if (lateMinutes > 0 && isEarlyLeave) {
    statusInfo = {
      label: "Trễ · Về sớm",
      badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    };
  } else if (isEarlyLeave) {
    statusInfo = {
      label: `Về sớm (${earlyLeaveMinutes}p)`,
      badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    };
  } else if (isShortShift && lateMinutes === 0) {
    statusInfo = {
      label: `Thiếu giờ (${workingMinutes}p)`,
      badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    };
  } else if (isLate) {
    statusInfo = {
      label: lateMinutes > 0 ? `Đi trễ (${lateMinutes}p)` : "Đi trễ",
      badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    };
  } else {
    statusInfo = {
      label: "Đúng giờ",
      badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    };
  }

  return (
    <div className="flex items-center justify-between py-3.5 text-sm">
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{name}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {department ? `${department} · ` : ""}Vào <strong>{time}</strong>
          {checkOut ? (
            <>
              {" "}
              · Ra <strong>{checkOut}</strong>
            </>
          ) : (
            ""
          )}
        </div>
      </div>

      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusInfo.badge}`}
      >
        {statusInfo.label}
      </span>
    </div>
  );
}
