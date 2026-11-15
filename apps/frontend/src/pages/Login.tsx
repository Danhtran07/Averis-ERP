import { FormEvent, useState } from "react";
import { CircleAlert, Coffee, LockKeyhole, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { login } from "../api/auth.api";
import { getApiErrorMessage } from "../api/error";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await login({
        username: username.trim(),
        password,
      });

      localStorage.setItem("access_token", response.access_token);
      localStorage.setItem("user", JSON.stringify(response.user));

      navigate("/dashboard", {
        replace: true,
      });
    } catch (err) {
      console.error("Login failed:", err);
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-5 py-10 sm:px-8">
      {/* Subtle decorative background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100/60 via-slate-50 to-slate-100"
      />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* BRAND HEADER */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 p-3.5 text-white shadow-lg shadow-slate-900/15 ring-1 ring-white/20">
            <Coffee size={24} strokeWidth={2.2} />
          </div>
          <div className="mt-3.5 text-2xl font-bold tracking-tight text-slate-900">
            Averis F&amp;B
          </div>
          <div className="mt-1 text-xs font-medium text-slate-500">
            Hệ thống Chấm công Khuôn mặt AI &amp; Quản lý Ca
          </div>
        </div>

        {/* LOGIN CARD */}
        <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-7 shadow-xl shadow-slate-900/5 backdrop-blur-sm sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Đăng nhập hệ thống
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Nhập thông tin tài khoản của bạn để tiếp tục.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Tên đăng nhập
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <UserRound size={17} />
                </span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Nhập tên đăng nhập"
                  autoComplete="username"
                  required
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pr-4 pl-10 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-3 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Mật khẩu
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <LockKeyhole size={17} />
                </span>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pr-4 pl-10 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-3 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/90 p-3.5"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-600">
                  <CircleAlert size={15} strokeWidth={2.2} />
                </div>
                <p className="text-sm leading-5 font-medium text-rose-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:bg-indigo-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-slate-400">
          <LockKeyhole size={13} strokeWidth={2} />
          <span>Xác thực bảo mật JWT · InsightFace ArcFace</span>
        </div>
      </div>
    </div>
  );
}
