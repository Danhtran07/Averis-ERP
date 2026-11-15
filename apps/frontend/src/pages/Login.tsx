import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Coffee,
  LockKeyhole,
  Store,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { login, registerStore } from "../api/auth.api";
import { getApiErrorMessage } from "../api/error";

const REGISTER_STEPS = [
  { id: 1, label: "Pháp nhân" },
  { id: 2, label: "Vận hành" },
  { id: 3, label: "Quản trị" },
] as const;

const SERVICE_PLANS = [
  { id: "STARTER", title: "Starter", desc: "1 cơ sở · Chấm công AI" },
  { id: "PROFESSIONAL", title: "Pro F&B", desc: "3D Liveness · Tính lương" },
  { id: "ENTERPRISE", title: "Enterprise", desc: "Đa chi nhánh" },
] as const;

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [regForm, setRegForm] = useState({
    company_name: "",
    tax_code: "",
    store_name: "",
    business_type: "Quán Cà phê / Trà sữa",
    employee_scale: "1 - 15 nhân sự",
    branch_count: 1,
    service_plan: "PROFESSIONAL",
    business_email: "",
    representative_title: "Chủ cơ sở / Giám đốc",
    address: "",
    phone: "",
    default_hourly_rate: 30000,
    late_tolerance_minutes: 15,
    min_face_similarity: 0.65,
    admin_full_name: "",
    admin_email: "",
    admin_username: "",
    admin_password: "",
    confirm_password: "",
    agreed_terms: true,
  });

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

  function validateStep(currentStep: 1 | 2 | 3): boolean {
    setError("");
    if (currentStep === 1) {
      if (!regForm.company_name.trim() || regForm.company_name.trim().length < 2) {
        setError("Vui lòng nhập tên doanh nghiệp.");
        return false;
      }
      const cleanTax = regForm.tax_code.trim();
      if (!/^[0-9]{10}(-[0-9]{3})?$/.test(cleanTax)) {
        setError("Mã số thuế gồm 10 số (hoặc 10 số-3 số, VD: 0401234567).");
        return false;
      }
      if (!regForm.store_name.trim() || regForm.store_name.trim().length < 2) {
        setError("Vui lòng nhập tên quán / thương hiệu.");
        return false;
      }
      if (!regForm.phone.trim() || regForm.phone.trim().length < 8) {
        setError("Vui lòng nhập số điện thoại hợp lệ.");
        return false;
      }
      if (!regForm.address.trim() || regForm.address.trim().length < 3) {
        setError("Vui lòng nhập địa chỉ cơ sở.");
        return false;
      }
      return true;
    }

    if (currentStep === 2) {
      if (!regForm.default_hourly_rate || regForm.default_hourly_rate < 1000) {
        setError("Đơn giá lương giờ phải từ 1.000đ trở lên.");
        return false;
      }
      return true;
    }

    if (!regForm.admin_full_name.trim() || regForm.admin_full_name.trim().length < 2) {
      setError("Vui lòng nhập họ tên người đại diện.");
      return false;
    }
    if (!regForm.admin_email.trim() || !regForm.admin_email.includes("@")) {
      setError("Vui lòng nhập email quản trị hợp lệ.");
      return false;
    }
    if (!regForm.admin_username.trim() || regForm.admin_username.trim().length < 3) {
      setError("Tên đăng nhập tối thiểu 3 ký tự.");
      return false;
    }
    if (!regForm.admin_password || regForm.admin_password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return false;
    }
    if (regForm.admin_password !== regForm.confirm_password) {
      setError("Xác nhận mật khẩu không khớp.");
      return false;
    }
    if (!regForm.agreed_terms) {
      setError("Vui lòng đồng ý điều khoản dịch vụ trước khi kích hoạt.");
      return false;
    }
    return true;
  }

  function handleNextStep() {
    if (validateStep(step)) {
      setStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
    }
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (step < 3) {
      handleNextStep();
      return;
    }

    if (!validateStep(3)) return;

    setLoading(true);
    try {
      const response = await registerStore({
        store_name: regForm.store_name.trim(),
        company_name: regForm.company_name.trim(),
        tax_code: regForm.tax_code.trim(),
        business_type: regForm.business_type,
        employee_scale: regForm.employee_scale,
        branch_count: Math.max(1, Number(regForm.branch_count) || 1),
        service_plan: regForm.service_plan,
        business_email:
          regForm.business_email.trim() || regForm.admin_email.trim(),
        representative_title: regForm.representative_title.trim(),
        address: regForm.address.trim(),
        phone: regForm.phone.trim(),
        default_hourly_rate: Number(regForm.default_hourly_rate) || 30000,
        late_tolerance_minutes: Number(regForm.late_tolerance_minutes) || 15,
        min_face_similarity: Number(regForm.min_face_similarity) || 0.65,
        admin_full_name: regForm.admin_full_name.trim(),
        admin_email: regForm.admin_email.trim(),
        admin_username: regForm.admin_username.trim(),
        admin_password: regForm.admin_password,
      });

      localStorage.setItem("access_token", response.access_token);
      localStorage.setItem("user", JSON.stringify(response.user));

      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể đăng ký hồ sơ doanh nghiệp."));
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-5 py-8 sm:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100/60 via-slate-50 to-slate-100"
      />

      <div
        className={`relative z-10 w-full transition-all ${
          mode === "register" ? "max-w-[540px]" : "max-w-[420px]"
        }`}
      >
        {/* BRAND HEADER */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 p-3.5 text-white shadow-lg shadow-sky-600/25 ring-1 ring-white/20">
            <Coffee size={24} strokeWidth={2.2} />
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            Averis F&amp;B
          </div>
        </div>

        {/* CENTERED CARD */}
        <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-7 shadow-xl shadow-slate-900/5 backdrop-blur-sm sm:p-8">
          {mode === "login" ? (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Đăng nhập hệ thống
                </h1>
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
                    <p className="text-sm leading-5 font-medium text-rose-700">
                      {error}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                </button>
              </form>

              <div className="mt-5 border-t border-slate-100 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setStep(1);
                    setMode("register");
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800"
                >
                  <Store size={14} />
                  <span>Doanh nghiệp mới? Đăng ký dịch vụ</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* HEADER */}
              <div className="mb-5 flex items-center justify-between">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  Đăng ký Doanh nghiệp
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setMode("login");
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                >
                  ← Đăng nhập
                </button>
              </div>

              {/* STEPPER */}
              <div className="mb-6 grid grid-cols-3 gap-2">
                {REGISTER_STEPS.map((item) => {
                  const isDone = step > item.id;
                  const isCurrent = step === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id < step) {
                          setError("");
                          setStep(item.id);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                        isCurrent
                          ? "border-indigo-600 bg-indigo-50/70 text-indigo-700"
                          : isDone
                            ? "border-emerald-200 bg-emerald-50/60 text-emerald-700"
                            : "border-slate-200 bg-slate-50/60 text-slate-400"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          isCurrent
                            ? "bg-indigo-600 text-white"
                            : isDone
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {isDone ? <Check size={12} /> : item.id}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                {/* STEP 1: THÔNG TIN PHÁP NHÂN */}
                {step === 1 && (
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Tên doanh nghiệp *
                      </label>
                      <input
                        type="text"
                        placeholder="Công ty TNHH..."
                        value={regForm.company_name}
                        onChange={(e) =>
                          setRegForm({ ...regForm, company_name: e.target.value })
                        }
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Mã số thuế *
                      </label>
                      <input
                        type="text"
                        maxLength={14}
                        placeholder="0401234567"
                        value={regForm.tax_code}
                        onChange={(e) =>
                          setRegForm({ ...regForm, tax_code: e.target.value })
                        }
                        className={`${inputCls} font-mono`}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Tên quán / Thương hiệu *
                      </label>
                      <input
                        type="text"
                        placeholder="VD: Averis Coffee"
                        value={regForm.store_name}
                        onChange={(e) =>
                          setRegForm({ ...regForm, store_name: e.target.value })
                        }
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Mô hình F&amp;B
                      </label>
                      <select
                        value={regForm.business_type}
                        onChange={(e) =>
                          setRegForm({ ...regForm, business_type: e.target.value })
                        }
                        className={inputCls}
                      >
                        <option value="Quán Cà phê / Trà sữa">
                          Quán Cà phê / Trà sữa
                        </option>
                        <option value="Nhà hàng / Bistro">Nhà hàng / Bistro</option>
                        <option value="Tiệm bánh / Bakery">Tiệm bánh / Bakery</option>
                        <option value="Lounge / Pub / Bar">Lounge / Pub / Bar</option>
                        <option value="Chuỗi cửa hàng F&B">Chuỗi F&amp;B</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Hotline *
                      </label>
                      <input
                        type="tel"
                        placeholder="0905123456"
                        value={regForm.phone}
                        onChange={(e) =>
                          setRegForm({ ...regForm, phone: e.target.value })
                        }
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Email hóa đơn
                      </label>
                      <input
                        type="email"
                        placeholder="ketoan@congty.vn"
                        value={regForm.business_email}
                        onChange={(e) =>
                          setRegForm({
                            ...regForm,
                            business_email: e.target.value,
                          })
                        }
                        className={inputCls}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Địa chỉ cơ sở *
                      </label>
                      <input
                        type="text"
                        placeholder="Số nhà, đường, quận/huyện, thành phố"
                        value={regForm.address}
                        onChange={(e) =>
                          setRegForm({ ...regForm, address: e.target.value })
                        }
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 2: GÓI DỊCH VỤ & VẬN HÀNH */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                        Gói dịch vụ
                      </label>
                      <div className="grid grid-cols-3 gap-2.5">
                        {SERVICE_PLANS.map((plan) => {
                          const active = regForm.service_plan === plan.id;
                          return (
                            <button
                              key={plan.id}
                              type="button"
                              onClick={() =>
                                setRegForm({ ...regForm, service_plan: plan.id })
                              }
                              className={`rounded-xl border p-3 text-left transition ${
                                active
                                  ? "border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600"
                                  : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                              }`}
                            >
                              <div className="text-sm font-bold text-slate-900">
                                {plan.title}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {plan.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Quy mô nhân sự
                        </label>
                        <select
                          value={regForm.employee_scale}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              employee_scale: e.target.value,
                            })
                          }
                          className={inputCls}
                        >
                          <option value="1 - 15 nhân sự">1 - 15 nhân sự</option>
                          <option value="16 - 50 nhân sự">16 - 50 nhân sự</option>
                          <option value="51 - 200 nhân sự">51 - 200 nhân sự</option>
                          <option value="Trên 200 nhân sự">Trên 200 nhân sự</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Số chi nhánh
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={regForm.branch_count}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              branch_count: Math.max(
                                1,
                                Number(e.target.value) || 1
                              ),
                            })
                          }
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Lương giờ mặc định (VNĐ/h) *
                        </label>
                        <input
                          type="number"
                          min={1000}
                          max={5000000}
                          step={500}
                          placeholder="VD: 30000"
                          value={regForm.default_hourly_rate || ""}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              default_hourly_rate: Number(e.target.value) || 0,
                            })
                          }
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Trễ ca cho phép (phút)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={regForm.late_tolerance_minutes}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              late_tolerance_minutes: Math.max(
                                0,
                                Number(e.target.value) || 0
                              ),
                            })
                          }
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: NGƯỜI ĐẠI DIỆN & TÀI KHOẢN ADMIN */}
                {step === 3 && (
                  <div className="space-y-3.5">
                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Người đại diện *
                        </label>
                        <input
                          type="text"
                          placeholder="Nguyễn Văn A"
                          value={regForm.admin_full_name}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              admin_full_name: e.target.value,
                            })
                          }
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Chức vụ
                        </label>
                        <select
                          value={regForm.representative_title}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              representative_title: e.target.value,
                            })
                          }
                          className={inputCls}
                        >
                          <option value="Chủ cơ sở / Giám đốc">
                            Chủ cơ sở / Giám đốc
                          </option>
                          <option value="Chủ hộ kinh doanh">Chủ hộ kinh doanh</option>
                          <option value="Quản lý chuỗi">Quản lý chuỗi</option>
                          <option value="Cửa hàng trưởng">Cửa hàng trưởng</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Email quản trị *
                        </label>
                        <input
                          type="email"
                          placeholder="admin@cuahang.vn"
                          value={regForm.admin_email}
                          onChange={(e) =>
                            setRegForm({ ...regForm, admin_email: e.target.value })
                          }
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Tên đăng nhập *
                        </label>
                        <input
                          type="text"
                          minLength={3}
                          placeholder="admin_store"
                          value={regForm.admin_username}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              admin_username: e.target.value,
                            })
                          }
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Mật khẩu *
                        </label>
                        <input
                          type="password"
                          minLength={6}
                          placeholder="Tối thiểu 6 ký tự"
                          value={regForm.admin_password}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              admin_password: e.target.value,
                            })
                          }
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Xác nhận mật khẩu *
                        </label>
                        <input
                          type="password"
                          minLength={6}
                          placeholder="Nhập lại mật khẩu"
                          value={regForm.confirm_password}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              confirm_password: e.target.value,
                            })
                          }
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={regForm.agreed_terms}
                        onChange={(e) =>
                          setRegForm({
                            ...regForm,
                            agreed_terms: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-slate-900"
                      />
                      <span>
                        Tôi xác nhận thông tin MST hợp lệ và đồng ý điều khoản dịch vụ.
                      </span>
                    </label>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/90 p-3"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                      <CircleAlert size={14} strokeWidth={2.2} />
                    </div>
                    <p className="text-xs leading-5 font-medium text-rose-700">
                      {error}
                    </p>
                  </div>
                )}

                {/* FOOTER BUTTONS */}
                <div className="flex items-center gap-3 pt-2">
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setStep((prev) =>
                          prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev
                        );
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <ArrowLeft size={16} />
                      <span>Quay lại</span>
                    </button>
                  )}

                  {step < 3 ? (
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
                    >
                      <span>Tiếp tục</span>
                      <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      )}
                      {loading
                        ? "Đang khởi tạo..."
                        : "Hoàn tất đăng ký"}
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
