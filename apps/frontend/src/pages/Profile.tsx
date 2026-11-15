import { useEffect, useState } from "react";

import { getApiErrorMessage } from "../api/error";
import {
  changePassword,
  getProfile,
  updateProfile,
  uploadProfileAvatar,
} from "../api/auth.api";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import type { Profile as ProfileData, ProfileUpdate } from "../types/user";

const emptyForm: ProfileUpdate = { full_name: "", email: "", phone: "", avatar_url: "", bio: "" };
const apiOrigin = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function Profile() {
  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  })();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [form, setForm] = useState<ProfileUpdate>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  async function loadProfile() {
    try {
      setLoading(true); setError("");
      const data = await getProfile();
      setProfile(data);
      setForm({ full_name: data.full_name || "", email: data.email || "", phone: data.phone || "", avatar_url: data.avatar_url || "", bio: data.bio || "" });
    } catch (err) { setError(getApiErrorMessage(err, "Không thể tải thông tin hồ sơ.")); } finally { setLoading(false); }
  }

  useEffect(() => { void loadProfile(); }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { setSaving(true); setError(""); setSuccess(""); const data = await updateProfile(form); setProfile(data); setSuccess("Đã cập nhật hồ sơ thành công."); } catch (err) { setError(getApiErrorMessage(err, "Không thể cập nhật hồ sơ.")); } finally { setSaving(false); }
  }

  async function handleAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setUploading(true); setError(""); const data = await uploadProfileAvatar(file); setProfile(data); setForm((current) => ({ ...current, avatar_url: data.avatar_url || "" })); setSuccess("Đã cập nhật ảnh đại diện thành công."); } catch (err) { setError(getApiErrorMessage(err, "Không thể tải lên ảnh đại diện.")); } finally { setUploading(false); event.target.value = ""; }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!passwordForm.current_password || !passwordForm.new_password) {
      setPasswordError("Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.");
      return;
    }
    if (passwordForm.new_password.trim().length < 6) {
      setPasswordError("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError("Xác nhận mật khẩu mới không khớp.");
      return;
    }

    try {
      setChangingPassword(true);
      const res = await changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordSuccess(res.message || "Đổi mật khẩu thành công.");
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (err) {
      setPasswordError(getApiErrorMessage(err, "Không thể đổi mật khẩu."));
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) return <LoadingState message="Đang tải hồ sơ cá nhân..." />;
  if (error && !profile) return <ErrorState message={error} onRetry={() => void loadProfile()} />;

  const avatar = profile?.avatar_url ? `${apiOrigin}${profile.avatar_url}` : "";
  return <section className="mx-auto max-w-4xl space-y-6">
    <header><h1 className="text-xl font-semibold text-slate-900">Hồ sơ cá nhân</h1><p className="mt-1 text-sm text-slate-500">{storedUser.username || "Người dùng"} · {storedUser.role === "ADMIN" ? "Quản trị viên" : "Nhân viên"}</p></header>
    {error && <div className="rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">{error}</div>}
    {success && <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{success}</div>}
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="rounded-lg border border-slate-200 bg-white p-4 text-center"><div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-4xl font-semibold text-slate-700">{avatar ? <img src={avatar} alt="Ảnh đại diện" className="h-full w-full object-cover" /> : (profile?.full_name || storedUser.username || "U").charAt(0).toUpperCase()}</div><h2 className="mt-4 truncate text-lg font-semibold text-slate-900">{profile?.full_name || storedUser.username || "Người dùng"}</h2><p className="mt-1 text-xs font-semibold   text-slate-400">{storedUser.role === "ADMIN" ? "Quản trị viên" : "Nhân viên"}</p><label className="mt-5 inline-flex cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatar} disabled={uploading} className="sr-only" />{uploading ? "Đang tải lên..." : "Đổi ảnh đại diện"}</label></aside>
      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4"><div className="grid gap-5 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Họ và tên</span><input value={form.full_name || ""} onChange={(event) => setForm({ ...form, full_name: event.target.value })} maxLength={100} className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label><label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Email</span><input type="email" value={form.email || ""} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label><label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Số điện thoại</span><input value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label><label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Giới thiệu / Ghi chú</span><textarea rows={5} value={form.bio || ""} onChange={(event) => setForm({ ...form, bio: event.target.value })} className="w-full resize-y rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label></div><div className="mt-6 flex justify-end"><button type="submit" disabled={saving} className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div></form>

        <form onSubmit={handlePasswordSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Đổi mật khẩu</h2>
          <p className="mt-1 text-xs text-slate-500">Cập nhật mật khẩu đăng nhập tài khoản (tối thiểu 6 ký tự).</p>
          {passwordError && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {passwordSuccess}
            </div>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label>
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Mật khẩu hiện tại</span>
              <input
                type="password"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                placeholder="••••••••"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Mật khẩu mới</span>
              <input
                type="password"
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                placeholder="Tối thiểu 6 ký tự"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Xác nhận mật khẩu</span>
              <input
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                placeholder="Nhập lại mật khẩu mới"
              />
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={changingPassword}
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {changingPassword ? "Đang cập nhật..." : "Đổi mật khẩu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>;
}