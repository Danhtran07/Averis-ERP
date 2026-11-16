import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock3,
  Coins,
  Info,
  Pencil,
  Search,
  Sparkles,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";

import { getEmployees, updateEmployee } from "../api/employee.api";
import { getApiErrorMessage } from "../api/error";
import type { Employee, SalaryType } from "../types/employee";

export default function Salaries() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [salaryTypeFilter, setSalaryTypeFilter] = useState<"ALL" | "MONTHLY" | "HOURLY">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("");

  // Modal state
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [salaryType, setSalaryType] = useState<SalaryType>("HOURLY");
  const [baseSalary, setBaseSalary] = useState<number>(0);
  const [hourlyRate, setHourlyRate] = useState<number>(30000);
  const [allowance, setAllowance] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // Preset positions modal
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetTargetDept, setPresetTargetDept] = useState("Pha chế (Barista)");
  const [presetSalaryType, setPresetSalaryType] = useState<SalaryType>("HOURLY");
  const [presetBaseSalary, setPresetBaseSalary] = useState<number>(0);
  const [presetHourlyRate, setPresetHourlyRate] = useState<number>(35000);
  const [presetAllowance, setPresetAllowance] = useState<number>(200000);
  const [presetSaving, setPresetSaving] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    try {
      setLoading(true);
      setError("");
      const data = await getEmployees();
      setEmployees(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể tải danh sách nhân viên."));
    } finally {
      setLoading(false);
    }
  }

  // Departments list
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((emp) => {
      if (emp.department?.trim()) set.add(emp.department.trim());
    });
    return Array.from(set).sort();
  }, [employees]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return employees.filter((emp) => {
      if (departmentFilter && (emp.department || "").trim() !== departmentFilter) {
        return false;
      }
      if (salaryTypeFilter !== "ALL") {
        const type = (emp.salary_type || "HOURLY").toUpperCase();
        if (type !== salaryTypeFilter) return false;
      }
      if (!keyword) return true;
      return [emp.employee_code, emp.full_name, emp.email, emp.department || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [employees, search, departmentFilter, salaryTypeFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = employees.length;
    const monthlyList = employees.filter((e) => (e.salary_type || "HOURLY").toUpperCase() === "MONTHLY");
    const hourlyList = employees.filter((e) => (e.salary_type || "HOURLY").toUpperCase() !== "MONTHLY");

    const totalMonthlyBase = monthlyList.reduce((acc, e) => acc + (e.base_salary || 0), 0);
    const avgHourlyRate = hourlyList.length > 0
      ? Math.round(hourlyList.reduce((acc, e) => acc + (e.hourly_rate || 30000), 0) / hourlyList.length)
      : 0;
    const totalAllowance = employees.reduce((acc, e) => acc + (e.allowance || 0), 0);

    return {
      total,
      monthlyCount: monthlyList.length,
      hourlyCount: hourlyList.length,
      totalMonthlyBase,
      avgHourlyRate,
      totalAllowance,
    };
  }, [employees]);

  function openEditModal(emp: Employee) {
    setEditingEmployee(emp);
    setSalaryType((emp.salary_type as SalaryType) || "HOURLY");
    setBaseSalary(emp.base_salary ?? (emp.salary_type === "MONTHLY" ? 10000000 : 0));
    setHourlyRate(emp.hourly_rate ?? 30000);
    setAllowance(emp.allowance ?? 0);
    setModalError("");
  }

  function closeEditModal() {
    if (saving) return;
    setEditingEmployee(null);
    setModalError("");
  }

  async function handleSaveSalary(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      setSaving(true);
      setModalError("");
      const updated = await updateEmployee(editingEmployee.id, {
        salary_type: salaryType,
        base_salary: salaryType === "MONTHLY" ? baseSalary : 0,
        hourly_rate: salaryType === "HOURLY" ? hourlyRate : 0,
        allowance: allowance || 0,
      });

      setEmployees((prev) =>
        prev.map((emp) => (emp.id === editingEmployee.id ? { ...emp, ...updated } : emp))
      );
      setEditingEmployee(null);
      setSuccessMsg(`Đã cập nhật chính sách lương cho "${editingEmployee.full_name}" thành công.`);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setModalError(getApiErrorMessage(err, "Không thể lưu chính sách lương."));
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyPreset(e: React.FormEvent) {
    e.preventDefault();
    const targets = employees.filter(
      (emp) => (emp.department || "").trim() === presetTargetDept
    );

    if (targets.length === 0) {
      setModalError(`Không có nhân sự nào thuộc vị trí "${presetTargetDept}".`);
      return;
    }

    try {
      setPresetSaving(true);
      const updatedList = await Promise.all(
        targets.map((emp) =>
          updateEmployee(emp.id, {
            salary_type: presetSalaryType,
            base_salary: presetSalaryType === "MONTHLY" ? presetBaseSalary : 0,
            hourly_rate: presetSalaryType === "HOURLY" ? presetHourlyRate : 0,
            allowance: presetAllowance || 0,
          })
        )
      );

      setEmployees((prev) =>
        prev.map((emp) => {
          const found = updatedList.find((u) => u.id === emp.id);
          return found ? { ...emp, ...found } : emp;
        })
      );

      setShowPresetModal(false);
      setSuccessMsg(
        `Đã áp dụng chính sách lương đồng loạt cho ${targets.length} nhân sự vị trí "${presetTargetDept}".`
      );
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể áp dụng định mức hàng loạt."));
    } finally {
      setPresetSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Chính sách lương
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPresetModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
          >
            <Sparkles size={15} className="text-sky-600" />
            <span>Áp dụng theo vị trí</span>
          </button>
        </div>
      </div>

      {/* SUCCESS BANNER */}
      {successMsg && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-2xs">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ERROR BANNER */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 shadow-2xs">
          <Info size={18} className="shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* METRIC CARDS */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Tổng nhân sự
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <UsersRound size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats.total}</span>
            <span className="text-xs font-medium text-slate-500">
              ({stats.monthlyCount} Full-time · {stats.hourlyCount} Part-time)
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Quỹ lương Full-time
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Banknote size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900">
              {stats.totalMonthlyBase.toLocaleString("vi-VN")}
            </span>
            <span className="text-xs font-medium text-slate-500">đ/tháng</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Mức giờ bình quân
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Coins size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900">
              {stats.avgHourlyRate.toLocaleString("vi-VN")}
            </span>
            <span className="text-xs font-medium text-slate-500">đ/h</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Tổng phụ cấp
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-emerald-700">
              {stats.totalAllowance.toLocaleString("vi-VN")}
            </span>
            <span className="text-xs font-medium text-emerald-600">đ/tháng</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã NV, họ tên, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-4 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter by Salary Type */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSalaryTypeFilter("ALL")}
              className={`rounded-lg px-3 py-1.5 transition ${
                salaryTypeFilter === "ALL"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tất cả ({employees.length})
            </button>
            <button
              type="button"
              onClick={() => setSalaryTypeFilter("MONTHLY")}
              className={`rounded-lg px-3 py-1.5 transition ${
                salaryTypeFilter === "MONTHLY"
                  ? "bg-sky-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Full-time ({stats.monthlyCount})
            </button>
            <button
              type="button"
              onClick={() => setSalaryTypeFilter("HOURLY")}
              className={`rounded-lg px-3 py-1.5 transition ${
                salaryTypeFilter === "HOURLY"
                  ? "bg-purple-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Part-time ({stats.hourlyCount})
            </button>
          </div>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
          >
            <option value="">Tất cả vị trí / quầy</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SALARIES TABLE */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {loading ? (
          <div className="p-16 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            <p className="mt-3 text-xs font-medium text-slate-500">Đang tải chính sách đãi ngộ...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <Banknote size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Không tìm thấy nhân viên phù hợp</p>
            <p className="mt-1 text-xs text-slate-400">Vui lòng điều chỉnh từ khóa tìm kiếm hoặc bộ lọc.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Mã NV</th>
                  <th className="px-5 py-3.5">Nhân viên</th>
                  <th className="px-5 py-3.5">Vị trí / Quầy</th>
                  <th className="px-5 py-3.5">Hình thức</th>
                  <th className="px-5 py-3.5 text-right">Mức lương</th>
                  <th className="px-5 py-3.5 text-right">Phụ cấp</th>
                  <th className="px-5 py-3.5 text-center">Tăng ca (OT)</th>
                  <th className="px-5 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const isMonthly = (emp.salary_type || "HOURLY").toUpperCase() === "MONTHLY";
                  const base = emp.base_salary || 0;
                  const rate = emp.hourly_rate || 30000;
                  const allow = emp.allowance || 0;

                  return (
                    <tr key={emp.id} className="transition hover:bg-slate-50/80">
                      {/* Employee Code */}
                      <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-600">
                        {emp.employee_code}
                      </td>

                      {/* Employee Name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700">
                            {emp.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(-2)
                              .join("")
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{emp.full_name}</div>
                            <div className="text-[11px] text-slate-400">{emp.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-5 py-4 text-xs font-medium text-slate-600">
                        {emp.department ? (
                          <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 font-medium">
                            {emp.department}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Salary Type Badge */}
                      <td className="px-5 py-4">
                        {isMonthly ? (
                          <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                            Full-time
                          </span>
                        ) : (
                          <span className="inline-flex rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                            Part-time
                          </span>
                        )}
                      </td>

                      {/* Base / Hourly Rate */}
                      <td className="px-5 py-4 text-right font-bold text-slate-900">
                        {isMonthly
                          ? `${base.toLocaleString("vi-VN")} đ/tháng`
                          : `${rate.toLocaleString("vi-VN")} đ/h`}
                      </td>

                      {/* Allowance */}
                      <td className="px-5 py-4 text-right">
                        {allow > 0 ? (
                          <span className="text-xs font-bold text-emerald-700">
                            +{allow.toLocaleString("vi-VN")} đ
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* OT Multiplier Rule */}
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                          1.5x
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                        >
                          <Pencil size={13} />
                          <span>Thiết lập</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: EDIT EMPLOYEE SALARY */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Thiết lập lương</h3>
                <p className="text-xs text-slate-500">
                  {editingEmployee.full_name} ({editingEmployee.employee_code})
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={saving}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveSalary} className="mt-5 space-y-4">
              {/* Type Toggle */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Hình thức <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setSalaryType("HOURLY")}
                    className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                      salaryType === "HOURLY"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "text-slate-600 hover:bg-white/70"
                    }`}
                  >
                    <Clock3 size={15} />
                    <span>Part-time (Lương giờ)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSalaryType("MONTHLY")}
                    className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                      salaryType === "MONTHLY"
                        ? "bg-sky-600 text-white shadow-2xs"
                        : "text-slate-600 hover:bg-white/70"
                    }`}
                  >
                    <Banknote size={15} />
                    <span>Full-time (Lương tháng)</span>
                  </button>
                </div>
              </div>

              {/* Amount input */}
              {salaryType === "MONTHLY" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lương cơ bản tháng (VNĐ) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500000"
                    value={baseSalary || ""}
                    onChange={(e) => setBaseSalary(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="12000000"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[8500000, 9500000, 10500000, 12000000, 15000000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setBaseSalary(val)}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                          baseSalary === val
                            ? "border-sky-600 bg-sky-50 text-sky-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {val.toLocaleString("vi-VN")} đ
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Đơn giá giờ (VNĐ/h) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={hourlyRate || ""}
                    onChange={(e) => setHourlyRate(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="30000"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-purple-500 focus:bg-white"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[25000, 28000, 30000, 32000, 35000, 42000, 45000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setHourlyRate(val)}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                          hourlyRate === val
                            ? "border-purple-600 bg-purple-50 text-purple-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {val.toLocaleString("vi-VN")} đ/h
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Allowance */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phụ cấp (VNĐ/tháng)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100000"
                  value={allowance || ""}
                  onChange={(e) => setAllowance(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[0, 200000, 300000, 500000, 800000, 1000000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAllowance(val)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                        allowance === val
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {val === 0 ? "0 đ" : `+${val.toLocaleString("vi-VN")} đ`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:opacity-50"
                >
                  {saving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BATCH PRESET APPLICATION */}
      {showPresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Áp dụng theo vị trí</h3>
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                disabled={presetSaving}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApplyPreset} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chọn vị trí / quầy áp dụng
                </label>
                <select
                  value={presetTargetDept}
                  onChange={(e) => setPresetTargetDept(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-sky-500 focus:bg-white"
                >
                  <option value="Pha chế (Barista)">Pha chế (Barista)</option>
                  <option value="Thu ngân (Cashier)">Thu ngân (Cashier)</option>
                  <option value="Phục vụ (Server)">Phục vụ (Server)</option>
                  <option value="Bếp (Kitchen)">Bếp (Kitchen)</option>
                  <option value="Quản lý ca (Shift Manager)">Quản lý ca (Shift Manager)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hình thức chi trả
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setPresetSalaryType("HOURLY")}
                    className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                      presetSalaryType === "HOURLY"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "text-slate-600"
                    }`}
                  >
                    Part-time (Giờ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetSalaryType("MONTHLY")}
                    className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                      presetSalaryType === "MONTHLY"
                        ? "bg-sky-600 text-white shadow-2xs"
                        : "text-slate-600"
                    }`}
                  >
                    Full-time (Tháng)
                  </button>
                </div>
              </div>

              {presetSalaryType === "MONTHLY" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lương tháng cơ bản (VNĐ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500000"
                    value={presetBaseSalary || ""}
                    onChange={(e) => setPresetBaseSalary(Number(e.target.value) || 0)}
                    placeholder="Ví dụ: 10000000"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Đơn giá theo giờ (VNĐ/h)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={presetHourlyRate || ""}
                    onChange={(e) => setPresetHourlyRate(Number(e.target.value) || 0)}
                    placeholder="Ví dụ: 30000"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-purple-500 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phụ cấp cố định (VNĐ)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={presetAllowance || ""}
                  onChange={(e) => setPresetAllowance(Number(e.target.value) || 0)}
                  placeholder="Ví dụ: 300000"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPresetModal(false)}
                  disabled={presetSaving}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={presetSaving}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-sky-700 disabled:opacity-50"
                >
                  {presetSaving ? "Đang áp dụng..." : "Áp dụng hàng loạt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
