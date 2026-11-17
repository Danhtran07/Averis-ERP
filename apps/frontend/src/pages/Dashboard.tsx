import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  Clock3,
  FileText,
  ScanFace,
  UsersRound,
} from "lucide-react";

import { getEmployees } from "../api/employee.api";
import {
  getAttendanceRequests,
  getAttendances,
} from "../api/attendance.api";
import { getMySchedule } from "../api/schedule.api";
import { getApiErrorMessage } from "../api/error";

import type { Employee } from "../types/employee";
import type {
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
        const [employeeData, attendanceData, reqData] = await Promise.all([
          getEmployees(),
          getAttendances(),
          getAttendanceRequests().catch(() => []),
        ]);
        setEmployees(employeeData);
        setAttendances(attendanceData);
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

    const DEPT_ORDER = ["Quản lý", "Bếp", "Pha chế", "Thu ngân", "Phục vụ"];

    function getDeptGroup(rawDept?: string | null): string {
      const raw = (rawDept || "").trim();
      if (!raw) return "Khác";
      const lower = raw.toLowerCase();
      if (lower.includes("phục vụ") || lower.includes("server")) return "Phục vụ";
      if (lower.includes("bếp") || lower.includes("kitchen")) return "Bếp";
      if (lower.includes("pha chế") || lower.includes("barista")) return "Pha chế";
      if (lower.includes("thu ngân") || lower.includes("cashier")) return "Thu ngân";
      if (lower.includes("quản lý") || lower.includes("manager")) return "Quản lý";
      return raw;
    }

    const groups = new Map<
      string,
      {
        department: string;
        total: number;
        checkedIn: number;
        late: number;
        absent: number;
        members: {
          id: number;
          name: string;
          code: string;
          isCheckedIn: boolean;
          isLate: boolean;
          isAbsent: boolean;
        }[];
      }
    >();

    const todayByEmp = new Map<number, Attendance>();
    todayAttendances.forEach((a) => todayByEmp.set(a.employee_id, a));

    employees.forEach((emp) => {
      const groupName = getDeptGroup(emp.department);
      const current = groups.get(groupName) || {
        department: groupName,
        total: 0,
        checkedIn: 0,
        late: 0,
        absent: 0,
        members: [],
      };
      current.total += 1;
      const att = todayByEmp.get(emp.id);
      const isCheckedIn = Boolean(
        att && (att.status === "PRESENT" || att.status === "LATE")
      );
      const isLate = Boolean(att && att.status === "LATE");
      const isAbsent = Boolean(att && att.status === "ABSENT");

      if (isCheckedIn) current.checkedIn += 1;
      if (isLate) current.late += 1;
      if (isAbsent) current.absent += 1;

      current.members.push({
        id: emp.id,
        name: emp.full_name,
        code: emp.employee_code,
        isCheckedIn,
        isLate,
        isAbsent,
      });

      groups.set(groupName, current);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const idxA = DEPT_ORDER.indexOf(a.department);
      const idxB = DEPT_ORDER.indexOf(b.department);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.department.localeCompare(b.department, "vi");
    });
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
    const result: {
      day: string;
      shortDay: string;
      date: string;
      percent: number;
      checkedIn: number;
      total: number;
      isFuture: boolean;
    }[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);

    const denominator = isAdmin ? Math.max(1, totalEmployees) : 1;
    const shortNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

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
      const isFuture = dateString > todayStr;
      const percent =
        isAdmin && totalEmployees === 0
          ? 0
          : isFuture
          ? 0
          : Math.min(100, Math.round((validCount / denominator) * 100));

      result.push({
        day: date.toLocaleDateString("vi-VN", { weekday: "long" }),
        shortDay: shortNames[i],
        date: dateString,
        percent,
        checkedIn: validCount,
        total: denominator,
        isFuture,
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

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      {/* HEADER */}
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Tổng quan vận hành
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              7 ngày / tuần
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500 capitalize">
            {displayDate}
            {!isAdmin && mySchedule?.shift && (
              <span className="font-semibold text-sky-700 normal-case">
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

      {/* MAIN CONTENT GRID */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {/* 7-DAY ATTENDANCE WEEKLY STRIP */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Tỷ lệ vào ca 7 ngày trong tuần
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Hôm nay: <strong className="text-sky-700">{todayAttendances.length}/{totalEmployees} nhân sự vào ca</strong>
                </p>
              </div>
              <Link
                to="/schedules"
                className="text-xs font-semibold text-sky-600 no-underline hover:text-sky-800"
              >
                Lịch phân ca →
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-7 divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
              {weeklyAttendance.map((item) => {
                const isToday = item.date === today;
                return (
                  <div
                    key={item.date}
                    className={`px-2 py-3 text-center sm:px-3 ${
                      isToday ? "bg-white font-semibold shadow-2xs" : ""
                    }`}
                  >
                    <div className="text-[11px] text-slate-500">
                      {item.shortDay}
                      {isToday && (
                        <span className="ml-1 font-bold text-sky-700">(Nay)</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {item.date.slice(8, 10)}/{item.date.slice(5, 7)}
                    </div>
                    <div
                      className={`mt-2 text-base font-bold ${
                        isToday
                          ? "text-sky-700"
                          : item.isFuture
                          ? "text-slate-300"
                          : "text-slate-800"
                      }`}
                    >
                      {item.isFuture ? "—" : `${item.percent}%`}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {item.isFuture
                        ? "Chưa tới"
                        : `${item.checkedIn}/${item.total}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STATION BREAKDOWN TABLE */}
          {isAdmin && departmentStats.length > 0 && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Nhân sự theo Vị trí / Quầy hôm nay
                </h2>
                <Link
                  to="/timesheet"
                  className="text-xs font-semibold text-sky-600 no-underline hover:text-sky-800"
                >
                  Bảng lương giờ →
                </Link>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse border border-slate-200 text-left text-xs">
                  <thead>
                    <tr className="bg-sky-800 text-white font-semibold text-xs">
                      <th className="border border-sky-700/80 py-2.5 px-3.5">Vị trí / Quầy</th>
                      <th className="border border-sky-700/80 px-3 py-2.5 text-center">Tổng nhân sự</th>
                      <th className="border border-sky-700/80 px-3.5 py-2.5">Nhân sự ca trực hôm nay</th>
                      <th className="border border-sky-700/80 py-2.5 px-3.5 text-right">Tình trạng</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {departmentStats.map((dept) => {
                      const isFull =
                        dept.checkedIn === dept.total && dept.total > 0;
                      return (
                        <tr
                          key={dept.department}
                          className="hover:bg-slate-50/80 transition"
                        >
                          <td className="border border-slate-200 py-3 px-3.5 font-semibold text-slate-800">
                            {dept.department}
                          </td>
                          <td className="border border-slate-200 px-3 py-3 text-center">
                            <span className="font-semibold text-slate-900">
                              {dept.checkedIn}
                            </span>
                            <span className="text-slate-400">/{dept.total}</span>
                          </td>
                          <td className="border border-slate-200 px-3.5 py-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              {dept.members.map((m) => (
                                <span
                                  key={m.id}
                                  className={
                                    m.isAbsent
                                      ? "font-medium text-rose-600"
                                      : m.isLate
                                      ? "font-medium text-amber-700"
                                      : m.isCheckedIn
                                      ? "text-slate-700"
                                      : "text-slate-400"
                                  }
                                >
                                  {m.name}
                                  {m.isAbsent
                                    ? " (vắng)"
                                    : m.isLate
                                    ? " (trễ)"
                                    : ""}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="border border-slate-200 py-3 px-3.5 text-right text-xs">
                            {dept.absent > 0 ? (
                              <span className="font-medium text-rose-600">
                                {dept.absent} vắng mặt
                              </span>
                            ) : isFull ? (
                              dept.late > 0 ? (
                                <span className="font-medium text-amber-700">
                                  {dept.late} trễ ca
                                </span>
                              ) : (
                                <span className="font-medium text-sky-700">
                                  Đủ ca
                                </span>
                              )
                            ) : dept.checkedIn === 0 ? (
                              <span className="text-slate-400">
                                Chưa vào ca
                              </span>
                            ) : (
                              <span className="text-slate-500">
                                {dept.late > 0 && (
                                  <span className="mr-1.5 font-medium text-amber-700">
                                    {dept.late} trễ ·
                                  </span>
                                )}
                                {dept.total - dept.checkedIn} chưa vào ca
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
              className="text-xs font-semibold text-sky-600 no-underline hover:text-sky-800"
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
    indigo: "bg-sky-50 text-sky-700 ring-1 ring-sky-200/80",
    emerald: "bg-sky-50 text-sky-700 ring-1 ring-sky-200/80",
    amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
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
      badge: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
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
