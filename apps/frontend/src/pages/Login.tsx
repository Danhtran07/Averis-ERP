import { FormEvent, useState } from "react";
import { CircleAlert, LockKeyhole } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 sm:px-8">
      <div className="w-full max-w-md">
        {/* LOGO */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-900 text-xl font-black text-white">
            A
          </div>
          <div className="mt-3 text-xl font-semibold text-slate-900">
            Averis
          </div>
          <div className="mt-1 text-xs font-medium text-slate-500">
            Hệ thống Chấm công Khuôn mặt AI
          </div>
        </div>

        {/* LOGIN CARD */}
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Đăng nhập hệ thống
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Nhập thông tin tài khoản Averis của bạn để tiếp tục.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Tên đăng nhập
              </label>
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
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Mật khẩu
              </label>
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
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3.5"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-600">
                  <CircleAlert size={16} strokeWidth={2} />
                </div>
                <p className="text-sm leading-6 text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
          <LockKeyhole size={14} strokeWidth={2} />
          <span>Xác thực bảo mật JWT</span>
        </div>
      </div>
    </div>
  );
}
