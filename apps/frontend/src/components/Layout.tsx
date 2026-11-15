import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useState } from "react";
import {
  CalendarCheck2,
  CalendarDays,
  Clock3,
  Coffee,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanFace,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

interface StoredUser {
  username?: string;
  role?: string;
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const storedUser = localStorage.getItem("user");

  let user: StoredUser = {};

  try {
    user = storedUser ? JSON.parse(storedUser) : {};
  } catch {
    user = {};
  }

  const username = user.username || "User";
  const role = user.role || "EMPLOYEE";
  const avatar = username.charAt(0).toUpperCase();

  const isDashboardActive = location.pathname === "/dashboard";
  const isRecognitionActive = location.pathname === "/recognition";
  const isEmployeesActive =
    location.pathname.startsWith("/employees") &&
    !location.pathname.endsWith("/schedule");
  const isAttendanceActive = location.pathname.startsWith("/attendance");
  const isUsersActive = location.pathname.startsWith("/users");
  const isShiftsActive =
    location.pathname.startsWith("/shifts") ||
    (location.pathname.startsWith("/schedules") &&
      new URLSearchParams(location.search).get("tab") === "shifts");
  const isSchedulesActive =
    location.pathname.startsWith("/schedules") && !isShiftsActive;
  const isMyScheduleActive =
    location.pathname === "/my-schedule" ||
    (location.pathname.startsWith("/employees/") &&
      location.pathname.endsWith("/schedule"));

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  const navItemClass = (active: boolean) =>
    `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium no-underline transition-all ${
      active
        ? "bg-slate-900 text-white shadow-sm shadow-slate-900/10"
        : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900"
    }`;

  return (
    <div className="min-h-screen bg-slate-50/80">
      {/* MOBILE OVERLAY */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* BRAND */}
        <div className="flex h-16 items-center border-b border-slate-100 px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white shadow-sm">
            <Coffee size={18} strokeWidth={2.2} />
          </div>
          <div className="ml-3 min-w-0">
            <div className="truncate text-base font-bold tracking-tight text-slate-900">
              Averis F&amp;B
            </div>
            <div className="truncate text-[11px] font-medium text-slate-400">
              AI Biometric &amp; Shift Ops
            </div>
          </div>

          <button
            type="button"
            onClick={closeMobileMenu}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3.5 py-5">
          <div className="space-y-1">
            <div className="px-3 pb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Vận hành Quầy
            </div>
            <Link
              to="/dashboard"
              onClick={closeMobileMenu}
              className={navItemClass(isDashboardActive)}
            >
              <LayoutDashboard size={17} strokeWidth={2} />
              <span>Tổng quan</span>
            </Link>

            <Link
              to="/recognition"
              onClick={closeMobileMenu}
              className={navItemClass(isRecognitionActive)}
            >
              <ScanFace size={17} strokeWidth={2} />
              <span>Kiosk Chấm công</span>
              <span
                className={`ml-auto h-2 w-2 rounded-full ${
                  isRecognitionActive ? "bg-emerald-400" : "bg-emerald-500"
                }`}
              />
            </Link>
          </div>

          {role === "ADMIN" ? (
            <div className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Quản lý Nhân sự &amp; Ca
              </div>
              <Link
                to="/employees"
                onClick={closeMobileMenu}
                className={navItemClass(isEmployeesActive)}
              >
                <UsersRound size={17} strokeWidth={2} />
                <span>Nhân sự &amp; Quầy</span>
              </Link>

              <Link
                to="/shifts"
                onClick={closeMobileMenu}
                className={navItemClass(isShiftsActive)}
              >
                <Clock3 size={17} strokeWidth={2} />
                <span>Ca làm việc F&amp;B</span>
              </Link>

              <Link
                to="/schedules"
                onClick={closeMobileMenu}
                className={navItemClass(isSchedulesActive)}
              >
                <CalendarDays size={17} strokeWidth={2} />
                <span>Lịch phân ca tuần</span>
              </Link>

              <Link
                to="/attendance"
                onClick={closeMobileMenu}
                className={navItemClass(isAttendanceActive)}
              >
                <CalendarCheck2 size={17} strokeWidth={2} />
                <span>Bảng công &amp; Lương</span>
              </Link>

              <Link
                to="/users"
                onClick={closeMobileMenu}
                className={navItemClass(isUsersActive)}
              >
                <ShieldCheck size={17} strokeWidth={2} />
                <span>Tài khoản hệ thống</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Cá nhân
              </div>
              <Link
                to="/my-schedule"
                onClick={closeMobileMenu}
                className={navItemClass(isMyScheduleActive)}
              >
                <CalendarDays size={17} strokeWidth={2} />
                <span>Lịch ca của tôi</span>
              </Link>

              <Link
                to="/attendance"
                onClick={closeMobileMenu}
                className={navItemClass(isAttendanceActive)}
              >
                <CalendarCheck2 size={17} strokeWidth={2} />
                <span>Bảng công &amp; Đơn từ</span>
              </Link>
            </div>
          )}
        </nav>

        {/* USER / LOGOUT */}
        <div className="border-t border-slate-100 p-3.5">
          <Link
            to="/profile"
            onClick={closeMobileMenu}
            aria-label="Open my profile"
            className="mb-2.5 flex items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-50/80 p-2.5 no-underline transition hover:border-slate-300 hover:bg-slate-100/80"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {avatar}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">
                {username}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    role === "ADMIN" ? "bg-indigo-500" : "bg-emerald-500"
                  }`}
                />
                {role === "ADMIN" ? "Quản lý / Admin" : "Nhân sự F&B"}
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut size={15} strokeWidth={2} />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* MAIN AREA */}
      <div className="min-h-screen lg:pl-64">
        {/* TOPBAR */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={18} />
            </button>

            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-slate-800">
                Hệ thống Quản lý Ca &amp; Chấm công Khuôn mặt F&amp;B
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {!isRecognitionActive && (
              <Link
                to="/recognition"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white no-underline shadow-sm transition hover:bg-indigo-950"
              >
                <ScanFace size={15} />
                <span>Mở Kiosk</span>
              </Link>
            )}

            <Link
              to="/profile"
              aria-label="Open my profile"
              className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 py-1.5 pr-3 pl-2 no-underline transition hover:bg-slate-100"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                <UserRound size={14} strokeWidth={2.2} />
              </div>
              <span className="hidden text-xs font-semibold text-slate-700 md:block">
                {username}
              </span>
            </Link>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
