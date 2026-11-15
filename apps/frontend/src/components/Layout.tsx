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
  LayoutDashboard,
  LogOut,
  ScanFace,
  UserRound,
  UsersRound,
} from "lucide-react";

interface StoredUser {
  username?: string;
  role?: string;
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const storedUser =
    localStorage.getItem("user");

  let user: StoredUser = {};

  try {
    user = storedUser
      ? JSON.parse(storedUser)
      : {};
  } catch {
    user = {};
  }

  const username =
    user.username || "User";

  const role =
    user.role || "EMPLOYEE";

  const avatar =
    username.charAt(0).toUpperCase();

  const isDashboardActive =
    location.pathname === "/dashboard";

  const isEmployeesActive =
    location.pathname.startsWith(
      "/employees"
    );

  const isAttendanceActive =
    location.pathname.startsWith(
      "/attendance"
    );

  const isUsersActive =
    location.pathname.startsWith(
      "/users"
    );

  const isShiftsActive =
    location.pathname.startsWith("/shifts") ||
    (location.pathname.startsWith("/schedules") &&
      new URLSearchParams(location.search).get("tab") === "shifts");
  const isSchedulesActive =
    location.pathname.startsWith("/schedules") && !isShiftsActive;
  const isMyScheduleActive =
    location.pathname === "/my-schedule" ||
    location.pathname.startsWith("/employees/") && location.pathname.endsWith("/schedule");

  function handleLogout() {
    localStorage.removeItem(
      "access_token"
    );

    localStorage.removeItem(
      "user"
    );

    navigate("/login", {
      replace: true,
    });
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* =====================================================
          MOBILE OVERLAY
      ===================================================== */}

      {mobileMenuOpen && (
        <div
          className="
            fixed inset-0 z-40
            bg-slate-900/40
            backdrop-blur-sm
            lg:hidden
          "
          onClick={closeMobileMenu}
        />
      )}

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-64 flex-col
          border-r border-slate-200
          bg-white
          transition-transform duration-200
          lg:translate-x-0

          ${mobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full"
          }
        `}
      >

        {/* ===================================================
            BRAND
        =================================================== */}

        <div className="flex h-16 items-center border-b border-slate-100 px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white">
            A
          </div>
          <div className="ml-2.5 text-base font-semibold text-slate-900">Averis</div>

          {/* Mobile close */}

          <button
            type="button"
            onClick={closeMobileMenu}
            className="
              ml-auto
              flex h-8 w-8
              items-center justify-center
              rounded-lg
              text-slate-400
              hover:bg-slate-100
              hover:text-slate-700
              lg:hidden
            "
          >
            ×
          </button>

        </div>

        {/* ===================================================
            NAVIGATION (CLEAN, UNIFORM, SINGLE-COLOR)
        =================================================== */}

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
          <Link
            to="/dashboard"
            onClick={closeMobileMenu}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${isDashboardActive
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            <LayoutDashboard size={17} strokeWidth={2} />
            <span>Tổng quan</span>
          </Link>

          <Link
            to="/recognition"
            onClick={closeMobileMenu}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${location.pathname === "/recognition"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            <ScanFace size={17} strokeWidth={2} />
            <span>Chấm công</span>
          </Link>

          {role === "ADMIN" ? (
            <>
              <Link
                to="/employees"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${isEmployeesActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
              >
                <UsersRound size={17} strokeWidth={2} />
                <span>Nhân sự</span>
              </Link>

              <Link
                to="/shifts"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${isShiftsActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
              >
                <Clock3 size={17} strokeWidth={2} />
                <span>Ca làm việc</span>
              </Link>

              <Link
                to="/schedules"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${isSchedulesActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
              >
                <CalendarDays size={17} strokeWidth={2} />
                <span>Lịch tuần</span>
              </Link>

              <Link
                to="/attendance"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${isAttendanceActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
              >
                <CalendarCheck2 size={17} strokeWidth={2} />
                <span>Bảng công</span>
              </Link>

              <Link
                to="/users"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${isUsersActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
              >
                <UsersRound size={17} strokeWidth={2} />
                <span>Tài khoản</span>
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/my-schedule"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${isMyScheduleActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
              >
                <CalendarDays size={17} strokeWidth={2} />
                <span>Lịch của tôi</span>
              </Link>

              <Link
                to="/attendance"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition ${isAttendanceActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
              >
                <CalendarCheck2 size={17} strokeWidth={2} />
                <span>Bảng công</span>
              </Link>
            </>
          )}
        </nav>


        {/* ===================================================
            USER / LOGOUT
        =================================================== */}

        <div
          className="
            border-t border-slate-100
            p-4
          "
        >

          <Link
            to="/profile"
            onClick={closeMobileMenu}
            aria-label="Open my profile"
            className="mb-3 flex items-center gap-3 rounded-md bg-slate-50 p-3 no-underline transition hover:bg-slate-100"
          >

            <div
              className="
                flex h-10 w-10
                shrink-0
                items-center justify-center
                rounded-full
                bg-slate-200
                text-sm font-semibold
                text-slate-700
              "
            >
              <UserRound size={20} strokeWidth={2} />
            </div>

            <div className="min-w-0">

              <div
                className="
                  truncate
                  text-sm font-semibold
                  text-slate-800
                "
              >
                {username}
              </div>

              <div
                className="
                  mt-0.5
                  text-[11px]
                  font-semibold
                  
                  
                  text-slate-400
                "
              >
                {role === "ADMIN" ? "Quản trị viên" : "Nhân viên"}
              </div>

            </div>

          </Link>


          <button
            type="button"
            onClick={handleLogout}
            className="
              flex w-full
              items-center
              justify-center
              gap-2
              rounded-md
              border border-slate-200
              bg-white
              px-4 py-2.5
              text-sm font-semibold
              text-slate-700
              transition
              hover:bg-slate-100
              hover:text-slate-900
            "
          >
            <span className="text-base">
              <LogOut size={16} strokeWidth={2} />
            </span>

            Đăng xuất
          </button>

        </div>

      </aside>


      {/* =====================================================
          MAIN AREA
      ===================================================== */}

      <div
        className="
          min-h-screen
          lg:pl-64
        "
      >

        {/* ===================================================
            TOPBAR
        =================================================== */}

        <header
          className="
            sticky top-0 z-30
            flex h-16
            items-center
            justify-between
            border-b border-slate-200
            bg-white/95
            px-4
            backdrop-blur
            sm:px-6
            lg:px-8
          "
        >

          {/* Mobile menu button */}

          <button
            type="button"
            onClick={() =>
              setMobileMenuOpen(true)
            }
            className="
              flex h-10 w-10
              items-center justify-center
              rounded-md
              text-slate-600
              hover:bg-slate-100
              lg:hidden
            "
          >
            ☰
          </button>


          <div
            className="
              hidden
              text-sm font-semibold
              text-slate-700
              sm:block
            "
          >
            Hệ thống Quản lý Chấm công Averis
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* User */}

            <Link
              to="/profile"
              aria-label="Open my profile"
              className="flex items-center gap-2 border-l border-slate-200 pl-4 no-underline"
            >

              <div
                className="
                  flex h-8 w-8
                  items-center justify-center
                  rounded-full
                  bg-slate-200
                  text-xs font-semibold
                  text-slate-700
                "
              >
                <UserRound size={16} strokeWidth={2} />
              </div>

              <span
                className="
                  hidden
                  text-sm font-semibold
                  text-slate-700
                  md:block
                "
              >
                {username}
              </span>

            </Link>

          </div>

        </header>


        {/* ===================================================
            PAGE CONTENT
        =================================================== */}

        <main
          className="
            min-h-[calc(100vh-4rem)]
            p-4
            sm:p-4
            lg:p-8
          "
        >
          <Outlet />
        </main>

      </div>

    </div>
  );
}