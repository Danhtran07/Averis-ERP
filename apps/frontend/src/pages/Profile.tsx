import { useEffect, useState } from "react";

import { getApiErrorMessage } from "../api/error";
import {
  changePassword,
  getProfile,
  getStoreProfile,
  updateProfile,
  updateStoreProfile,
  uploadProfileAvatar,
  type StoreProfileUpdatePayload,
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

  const [storeForm, setStoreForm] = useState<StoreProfileUpdatePayload>({
    store_name: "Averis",
    company_name: "",
    tax_code: "",
    business_type: "Quán Cà phê / Trà sữa",
    employee_scale: "1 - 15 nhân sự",
    branch_count: 1,
    service_plan: "PROFESSIONAL",
    business_email: "",
    representative_name: "",
    representative_title: "Chủ cơ sở / Giám đốc",
    address: "",
    phone: "",
    default_hourly_rate: 35000,
    late_tolerance_minutes: 15,
    min_face_similarity: 0.65,
  });
  const [savingStore, setSavingStore] = useState(false);
  const [storeError, setStoreError] = useState("");
  const [storeSuccess, setStoreSuccess] = useState("");

  async function loadProfile() {
    try {
      setLoading(true); setError("");
      const data = await getProfile();
      setProfile(data);
      setForm({ full_name: data.full_name || "", email: data.email || "", phone: data.phone || "", avatar_url: data.avatar_url || "", bio: data.bio || "" });
      if (storedUser.role === "ADMIN") {
        const storeData = await getStoreProfile().catch(() => null);
        if (storeData) {
          setStoreForm({
            store_name: storeData.store_name || "Averis",
            company_name: storeData.company_name || "",
            tax_code: storeData.tax_code || "",
            business_type: storeData.business_type || "Quán Cà phê / Trà sữa",
            employee_scale: storeData.employee_scale || "1 - 15 nhân sự",
            branch_count: storeData.branch_count ?? 1,
            service_plan: storeData.service_plan || "PROFESSIONAL",
            business_email: storeData.business_email || "",
            representative_name: storeData.representative_name || "",
            representative_title:
              storeData.representative_title || "Chủ cơ sở / Giám đốc",
            address: storeData.address || "",
            phone: storeData.phone || "",
            default_hourly_rate: storeData.default_hourly_rate ?? 35000,
            late_tolerance_minutes: storeData.late_tolerance_minutes ?? 15,
            min_face_similarity: storeData.min_face_similarity ?? 0.65,
          });
        }
      }
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

  async function handleStoreSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStoreError("");
    setStoreSuccess("");
    if (!storeForm.store_name.trim()) {
      setStoreError("Vui lòng nhập tên cửa hàng / thương hiệu.");
      return;
    }
    const cleanTax = (storeForm.tax_code || "").trim();
    if (cleanTax && !/^[0-9]{10}(-[0-9]{3})?$/.test(cleanTax)) {
      setStoreError(
        "Mã số thuế không hợp lệ (Nhập 10 chữ số hoặc 10 số-3 số chi nhánh, VD: 0401234567)."
      );
      return;
    }
    try {
      setSavingStore(true);
      const updated = await updateStoreProfile({
        store_name: storeForm.store_name.trim(),
        company_name: (storeForm.company_name || "").trim() || null,
        tax_code: cleanTax || null,
        business_type: storeForm.business_type.trim() || "Quán Cà phê / Trà sữa",
        employee_scale: storeForm.employee_scale || "1 - 15 nhân sự",
        branch_count: Math.max(1, Number(storeForm.branch_count) || 1),
        service_plan: storeForm.service_plan || "PROFESSIONAL",
        business_email: (storeForm.business_email || "").trim() || null,
        representative_name: (storeForm.representative_name || "").trim() || null,
        representative_title:
          (storeForm.representative_title || "").trim() || "Chủ cơ sở / Giám đốc",
        address: (storeForm.address || "").trim() || null,
        phone: (storeForm.phone || "").trim() || null,
        default_hourly_rate: Number(storeForm.default_hourly_rate) || 35000,
        late_tolerance_minutes: Number(storeForm.late_tolerance_minutes) || 0,
        min_face_similarity: Number(storeForm.min_face_similarity) || 0.65,
      });
      setStoreForm({
        store_name: updated.store_name,
        company_name: updated.company_name || "",
        tax_code: updated.tax_code || "",
        business_type: updated.business_type,
        employee_scale: updated.employee_scale || "1 - 15 nhân sự",
        branch_count: updated.branch_count ?? 1,
        service_plan: updated.service_plan || "PROFESSIONAL",
        business_email: updated.business_email || "",
        representative_name: updated.representative_name || "",
        representative_title:
          updated.representative_title || "Chủ cơ sở / Giám đốc",
        address: updated.address || "",
        phone: updated.phone || "",
        default_hourly_rate: updated.default_hourly_rate,
        late_tolerance_minutes: updated.late_tolerance_minutes,
        min_face_similarity: updated.min_face_similarity,
      });
      window.dispatchEvent(new Event("store-profile-updated"));
      setStoreSuccess("Đã lưu hồ sơ pháp nhân doanh nghiệp và đồng bộ cấu hình dịch vụ.");
    } catch (err) {
      setStoreError(getApiErrorMessage(err, "Không thể cập nhật cấu hình doanh nghiệp."));
    } finally {
      setSavingStore(false);
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
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4"><div className="grid gap-5 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Họ và tên</span><input value={form.full_name || ""} onChange={(event) => setForm({ ...form, full_name: event.target.value })} maxLength={100} className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label><label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Email</span><input type="email" value={form.email || ""} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label><label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Số điện thoại</span><input value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label><label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Giới thiệu / Ghi chú</span><textarea rows={5} value={form.bio || ""} onChange={(event) => setForm({ ...form, bio: event.target.value })} className="w-full resize-y rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label></div><div className="mt-6 flex justify-end"><button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div></form>

        {storedUser.role === "ADMIN" && (
          <form onSubmit={handleStoreSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              Hồ sơ Doanh nghiệp &amp; Dịch vụ
            </h2>
            {storeError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {storeError}
              </div>
            )}
            {storeSuccess && (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {storeSuccess}
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Tên doanh nghiệp
                </span>
                <input
                  value={storeForm.company_name || ""}
                  onChange={(e) => setStoreForm({ ...storeForm, company_name: e.target.value })}
                  maxLength={200}
                  placeholder="Công ty TNHH..."
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Mã số thuế
                </span>
                <input
                  value={storeForm.tax_code || ""}
                  onChange={(e) => setStoreForm({ ...storeForm, tax_code: e.target.value })}
                  maxLength={14}
                  placeholder="0401234567"
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-slate-400"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Tên quán / Thương hiệu
                </span>
                <input
                  value={storeForm.store_name}
                  onChange={(e) => setStoreForm({ ...storeForm, store_name: e.target.value })}
                  maxLength={120}
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Mô hình kinh doanh
                </span>
                <select
                  value={storeForm.business_type}
                  onChange={(e) => setStoreForm({ ...storeForm, business_type: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                >
                  <option value="Quán Cà phê / Trà sữa">Quán Cà phê / Trà sữa</option>
                  <option value="Nhà hàng / Bistro">Nhà hàng / Bistro</option>
                  <option value="Tiệm bánh / Bakery">Tiệm bánh / Bakery</option>
                  <option value="Lounge / Pub / Bar">Lounge / Pub / Bar</option>
                  <option value="Chuỗi cửa hàng">Chuỗi cửa hàng</option>
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Gói dịch vụ
                </span>
                <select
                  value={storeForm.service_plan || "PROFESSIONAL"}
                  onChange={(e) => setStoreForm({ ...storeForm, service_plan: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-slate-400"
                >
                  <option value="STARTER">Starter (1 cơ sở)</option>
                  <option value="PROFESSIONAL">Pro</option>
                  <option value="ENTERPRISE">Enterprise (Chuỗi)</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Quy mô
                  </span>
                  <select
                    value={storeForm.employee_scale || "1 - 15 nhân sự"}
                    onChange={(e) =>
                      setStoreForm({ ...storeForm, employee_scale: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="1 - 15 nhân sự">1 - 15 nhân sự</option>
                    <option value="16 - 50 nhân sự">16 - 50 nhân sự</option>
                    <option value="51 - 200 nhân sự">51 - 200 nhân sự</option>
                    <option value="Trên 200 nhân sự">Trên 200 nhân sự</option>
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Chi nhánh
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={storeForm.branch_count ?? 1}
                    onChange={(e) =>
                      setStoreForm({
                        ...storeForm,
                        branch_count: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                </label>
              </div>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Người đại diện
                </span>
                <input
                  value={storeForm.representative_name || ""}
                  onChange={(e) =>
                    setStoreForm({ ...storeForm, representative_name: e.target.value })
                  }
                  maxLength={120}
                  placeholder="Họ và tên"
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Email hóa đơn
                </span>
                <input
                  type="email"
                  value={storeForm.business_email || ""}
                  onChange={(e) =>
                    setStoreForm({ ...storeForm, business_email: e.target.value })
                  }
                  maxLength={255}
                  placeholder="ketoan@congty.vn"
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Địa chỉ
                </span>
                <input
                  value={storeForm.address || ""}
                  onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                  maxLength={255}
                  placeholder="Số nhà, đường, quận/huyện..."
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Hotline
                </span>
                <input
                  value={storeForm.phone || ""}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  maxLength={30}
                  placeholder="090xxxxxxx"
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Lương giờ mặc định (VNĐ/h)
                </span>
                <input
                  type="number"
                  min={1000}
                  max={5000000}
                  step={500}
                  value={storeForm.default_hourly_rate}
                  onChange={(e) =>
                    setStoreForm({
                      ...storeForm,
                      default_hourly_rate: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Trễ ca cho phép (phút)
                </span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={storeForm.late_tolerance_minutes}
                  onChange={(e) =>
                    setStoreForm({
                      ...storeForm,
                      late_tolerance_minutes: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Ngưỡng khớp AI
                </span>
                <select
                  value={storeForm.min_face_similarity}
                  onChange={(e) =>
                    setStoreForm({
                      ...storeForm,
                      min_face_similarity: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                >
                  <option value={0.65}>65% (Tiêu chuẩn)</option>
                  <option value={0.72}>72% (Khuyên dùng)</option>
                  <option value={0.8}>80% (Nghiêm ngặt)</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={savingStore}
                className="rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
              >
                {savingStore ? "Đang lưu..." : "Lưu hồ sơ"}
              </button>
            </div>
          </form>
        )}

        <form onSubmit={handlePasswordSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Đổi mật khẩu</h2>
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
              className="rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
            >
              {changingPassword ? "Đang cập nhật..." : "Đổi mật khẩu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>;
}