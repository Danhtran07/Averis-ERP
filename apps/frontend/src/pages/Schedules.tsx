import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Clock3, MoonStar, Plus, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getApiErrorMessage } from "../api/error";
import { getEmployees } from "../api/employee.api";
import {
  assignSchedule,
  createSchedule,
  createShift,
  deactivateShift,
  getSchedules,
  getShifts,
} from "../api/schedule.api";
import type { Employee } from "../types/employee";
import type { Shift, ShiftPayload, WorkSchedule } from "../types/schedule";
import { SHIFT_TEMPLATES, type ShiftTemplateId } from "../utils/shiftTemplates";

const days = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
];

type WorkConfigTab = "shifts" | "schedules";

function formatTime(value: string) {
  return value.slice(0, 5);
}

function isWorkConfigTab(value: string | null): value is WorkConfigTab {
  return value === "shifts" || value === "schedules";
}

export default function Schedules() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: WorkConfigTab = isWorkConfigTab(rawTab) ? rawTab : "schedules";

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [shiftActionError, setShiftActionError] = useState("");
  const [updatingShiftId, setUpdatingShiftId] = useState<number | null>(null);
  const [savingShift, setSavingShift] = useState(false);
  const [template, setTemplate] = useState<ShiftTemplateId>("morning");
  const [shiftForm, setShiftForm] = useState({
    name: SHIFT_TEMPLATES.morning.name,
    code: SHIFT_TEMPLATES.morning.code,
    start_time: SHIFT_TEMPLATES.morning.start,
    end_time: SHIFT_TEMPLATES.morning.end,
    description: SHIFT_TEMPLATES.morning.description,
  });

  // Weekly schedule creation state
  const [scheduleForm, setScheduleForm] = useState<{
    name: string;
    code: string;
    description: string;
    dayShifts: Record<number, string>;
  }>({
    name: "Lịch vận hành F&B 7 ngày",
    code: "FNB-7DAY",
    description: "Vận hành quầy xuyên suốt Thứ 2 đến Chủ Nhật",
    dayShifts: {
      1: "",
      2: "",
      3: "",
      4: "",
      5: "",
      6: "",
      7: "",
    },
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleSuccess, setScheduleSuccess] = useState("");

  // Schedule assignment state
  const [assignForm, setAssignForm] = useState({
    employee_id: "",
    schedule_id: "",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: "",
  });
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assignSuccess, setAssignSuccess] = useState("");

  async function loadWorkConfig() {
    try {
      setLoading(true);
      setError("");
      const [shiftData, scheduleData, employeeData] = await Promise.all([
        getShifts(),
        getSchedules(),
        getEmployees().catch(() => [] as Employee[]),
      ]);
      setShifts(shiftData);
      setSchedules(scheduleData);
      setEmployees(employeeData);

      const defaultShift = shiftData.find((s) => s.is_active);
      if (defaultShift) {
        setScheduleForm((prev) => ({
          ...prev,
          dayShifts: {
            1: prev.dayShifts[1] || String(defaultShift.id),
            2: prev.dayShifts[2] || String(defaultShift.id),
            3: prev.dayShifts[3] || String(defaultShift.id),
            4: prev.dayShifts[4] || String(defaultShift.id),
            5: prev.dayShifts[5] || String(defaultShift.id),
            6: prev.dayShifts[6] || String(defaultShift.id),
            7: prev.dayShifts[7] || String(defaultShift.id),
          },
        }));
      }
      if (employeeData.length > 0) {
        setAssignForm((prev) => ({
          ...prev,
          employee_id: prev.employee_id || String(employeeData[0].id),
        }));
      }
      if (scheduleData.length > 0) {
        setAssignForm((prev) => ({
          ...prev,
          schedule_id: prev.schedule_id || String(scheduleData[0].id),
        }));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể tải danh sách ca và lịch làm việc."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkConfig();
  }, []);

  const activeCount = useMemo(
    () => shifts.filter((shift) => shift.is_active).length,
    [shifts]
  );
  const overnightCount = useMemo(
    () => shifts.filter((shift) => shift.is_overnight).length,
    [shifts]
  );

  function setTab(next: WorkConfigTab) {
    setSearchParams(next === "schedules" ? {} : { tab: next }, { replace: true });
  }

  function selectTemplate(value: ShiftTemplateId) {
    setTemplate(value);
    const preset = SHIFT_TEMPLATES[value];
    setShiftForm((current) => ({
      ...current,
      name: preset.name,
      code: preset.code,
      start_time: preset.start,
      end_time: preset.end,
      description: preset.description,
    }));
  }

  async function handleCreateShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    setSavingShift(true);
    const payload: ShiftPayload = {
      ...shiftForm,
      start_time: `${shiftForm.start_time}:00`,
      end_time: `${shiftForm.end_time}:00`,
      late_tolerance_minutes: 15,
      early_checkin_minutes: 30,
      checkin_close_minutes: 90,
      is_active: true,
    };
    try {
      const created = await createShift(payload);
      setShifts((current) => [...current, created].sort((a, b) => a.start_time.localeCompare(b.start_time)));
      setShiftForm({
        name: SHIFT_TEMPLATES.morning.name,
        code: SHIFT_TEMPLATES.morning.code,
        start_time: SHIFT_TEMPLATES.morning.start,
        end_time: SHIFT_TEMPLATES.morning.end,
        description: SHIFT_TEMPLATES.morning.description,
      });
      setTemplate("morning");
    } catch (err) {
      setCreateError(getApiErrorMessage(err, "Không thể tạo ca làm việc."));
    } finally {
      setSavingShift(false);
    }
  }

  async function handleDeactivateShift(shift: Shift) {
    if (!shift.is_active) return;
    setShiftActionError("");
    setUpdatingShiftId(shift.id);
    try {
      const updated = await deactivateShift(shift.id);
      setShifts((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (err) {
      setShiftActionError(getApiErrorMessage(err, "Không thể ngưng kích hoạt ca làm việc này."));
    } finally {
      setUpdatingShiftId(null);
    }
  }

  async function handleCreateSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScheduleError("");
    setScheduleSuccess("");
    setSavingSchedule(true);
    try {
      const rules = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        day_of_week: dayOfWeek,
        shift_id: scheduleForm.dayShifts[dayOfWeek]
          ? Number(scheduleForm.dayShifts[dayOfWeek])
          : null,
      }));
      const created = await createSchedule({
        name: scheduleForm.name.trim(),
        code: scheduleForm.code.trim(),
        description: scheduleForm.description.trim() || null,
        is_active: true,
        rules,
      });
      setSchedules((current) => [...current, created]);
      setAssignForm((prev) => ({
        ...prev,
        schedule_id: prev.schedule_id || String(created.id),
      }));
      setScheduleSuccess(`Đã tạo lịch làm việc tuần "${created.name}" (${created.code}).`);
      setScheduleForm((prev) => ({
        ...prev,
        name: "",
        code: "",
        description: "",
      }));
    } catch (err) {
      setScheduleError(getApiErrorMessage(err, "Không thể tạo lịch làm việc tuần."));
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleAssignSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError("");
    setAssignSuccess("");
    if (!assignForm.employee_id || !assignForm.schedule_id) {
      setAssignError("Vui lòng chọn cả nhân sự và lịch làm việc tuần.");
      return;
    }
    setSavingAssign(true);
    try {
      const assigned = await assignSchedule({
        employee_id: Number(assignForm.employee_id),
        schedule_id: Number(assignForm.schedule_id),
        effective_from: assignForm.effective_from,
        effective_to: assignForm.effective_to || null,
      });
      const emp = employees.find((e) => e.id === assigned.employee_id);
      const sched = schedules.find((s) => s.id === assigned.schedule_id);
      setAssignSuccess(
        `Đã gán "${sched?.name ?? `#${assigned.schedule_id}`}" cho ${emp?.full_name ?? `Nhân sự #${assigned.employee_id}`} từ ngày ${assigned.effective_from}.`
      );
    } catch (err) {
      setAssignError(getApiErrorMessage(err, "Không thể gán lịch làm việc cho nhân sự."));
    } finally {
      setSavingAssign(false);
    }
  }

  if (loading) return <LoadingState message="Đang tải cấu hình ca & lịch làm việc..." />;
  if (error) return <ErrorState message={error} onRetry={() => void loadWorkConfig()} />;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Ca làm việc &amp; Lịch tuần
          </h1>
        </div>
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setTab("shifts")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              tab === "shifts"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Ca làm việc
          </button>
          <button
            type="button"
            onClick={() => setTab("schedules")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              tab === "schedules"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Lịch tuần
          </button>
        </div>
      </header>

      {tab === "shifts" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Tổng số ca</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{shifts.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Đang hoạt động</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{activeCount}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Ca qua đêm</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{overnightCount}</div>
            </div>
          </div>

          <form onSubmit={handleCreateShift} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div><h2 className="text-sm font-semibold text-slate-900">Thêm ca làm việc</h2></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(SHIFT_TEMPLATES) as [ShiftTemplateId, (typeof SHIFT_TEMPLATES)[ShiftTemplateId]][]).map(
                  ([key, p]) => (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => selectTemplate(key)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      + {p.name}
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-slate-500">Loại ca mẫu F&amp;B
                <select value={template} onChange={(event) => selectTemplate(event.target.value as ShiftTemplateId)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                  <option value="morning">{SHIFT_TEMPLATES.morning.label}</option>
                  <option value="evening">{SHIFT_TEMPLATES.evening.label}</option>
                  <option value="peak">{SHIFT_TEMPLATES.peak.label}</option>
                  <option value="night">{SHIFT_TEMPLATES.night.label}</option>
                </select>
              </label>
              <label className="text-xs text-slate-500">Tên ca
                <input required maxLength={100} value={shiftForm.name} onChange={(event) => setShiftForm({ ...shiftForm, name: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              </label>
              <label className="text-xs text-slate-500">Mã ca
                <input required maxLength={50} value={shiftForm.code} onChange={(event) => setShiftForm({ ...shiftForm, code: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              </label>
              <label className="text-xs text-slate-500">Giờ bắt đầu
                <input required type="time" value={shiftForm.start_time} onChange={(event) => setShiftForm({ ...shiftForm, start_time: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              </label>
              <label className="text-xs text-slate-500">Giờ kết thúc
                <input required type="time" value={shiftForm.end_time} onChange={(event) => setShiftForm({ ...shiftForm, end_time: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              </label>
              <label className="text-xs text-slate-500">Mô tả
                <input value={shiftForm.description} onChange={(event) => setShiftForm({ ...shiftForm, description: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              </label>
            </div>
            {createError && <p role="alert" className="mt-3 text-sm text-rose-600">{createError}</p>}
            <button type="submit" disabled={savingShift} className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              <Plus size={16} /> {savingShift ? "Đang thêm..." : "Thêm"}
            </button>
          </form>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Danh mục ca làm việc</h2>
            </div>
            {shiftActionError && <p role="alert" className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-700">{shiftActionError}</p>}
            {shifts.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-slate-500">
                Chưa có ca làm việc nào được cấu hình.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {shifts.map((shift) => (
                  <article
                    key={shift.id}
                    className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-start gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{shift.name}</h3>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            {shift.code}
                          </span>
                          {!shift.is_active && (
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-400">
                              Ngưng hoạt động
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                          {shift.is_overnight ? " · ca qua đêm" : ""}
                        </p>
                        {shift.description && (
                          <p className="mt-1 text-sm text-slate-500">{shift.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm md:min-w-[260px]">
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        <p className="text-xs text-slate-500">Cho phép trễ</p>
                        <p className="mt-0.5 font-semibold text-slate-800">
                          {shift.late_tolerance_minutes} phút
                        </p>
                      </div>
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        <p className="text-xs text-slate-500">Mở chấm công sớm</p>
                        <p className="mt-0.5 font-semibold text-slate-800">
                          {shift.early_checkin_minutes} phút
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeactivateShift(shift)}
                      disabled={!shift.is_active || updatingShiftId === shift.id}
                      aria-label={`Ngưng ${shift.name}`}
                      title={shift.is_active ? "Ngưng kích hoạt ca" : "Ca đã ngưng hoạt động"}
                      className="inline-flex items-center justify-center gap-1.5 self-start rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:self-center"
                    >
                      <Trash2 size={14} />
                      {updatingShiftId === shift.id ? "Đang xử lý..." : "Ngưng ca"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {/* Create Weekly Schedule Form */}
            <form
              onSubmit={handleCreateSchedule}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Tạo lịch tuần</h2>
                  </div>
                </div>
                {shifts.some((s) => s.is_active) && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const activeShifts = shifts.filter((s) => s.is_active);
                        if (activeShifts.length === 0) return;
                        const morning =
                          activeShifts.find((s) => s.code.includes("MORNING") || s.code.includes("SANG")) ||
                          activeShifts[0];
                        const evening =
                          activeShifts.find((s) => s.code.includes("EVENING") || s.code.includes("CHIEU")) ||
                          activeShifts[Math.min(1, activeShifts.length - 1)];
                        setScheduleForm((prev) => ({
                          ...prev,
                          name: "Lịch ca xoay F&B (7 ngày)",
                          code: "FNB-ROTATING",
                          description: "T2–T5 Ca Sáng mở quầy, T6–CN Ca Chiều đóng quầy",
                          dayShifts: {
                            1: String(morning.id),
                            2: String(morning.id),
                            3: String(morning.id),
                            4: String(morning.id),
                            5: String(evening.id),
                            6: String(evening.id),
                            7: String(evening.id),
                          },
                        }));
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Mẫu ca xoay (T2–CN)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const activeShift = shifts.find((s) => s.is_active);
                        if (!activeShift) return;
                        setScheduleForm((prev) => ({
                          ...prev,
                          dayShifts: {
                            1: String(activeShift.id),
                            2: String(activeShift.id),
                            3: String(activeShift.id),
                            4: String(activeShift.id),
                            5: String(activeShift.id),
                            6: String(activeShift.id),
                            7: String(activeShift.id),
                          },
                        }));
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Điền nhanh 7 ngày (T2–CN)
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500">
                  Tên lịch tuần
                  <input
                    required
                    maxLength={100}
                    placeholder="Lịch vận hành F&B 7 ngày"
                    value={scheduleForm.name}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Mã lịch tuần
                  <input
                    required
                    maxLength={50}
                    placeholder="FNB-7DAY"
                    value={scheduleForm.code}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, code: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-500 sm:col-span-2">
                  Mô tả
                  <input
                    placeholder="Vận hành quầy xuyên suốt Thứ 2 đến Chủ Nhật"
                    value={scheduleForm.description}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, description: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-md border border-slate-100 bg-slate-50/70 p-3">
                <p className="mb-2 text-xs text-slate-500">
                  Phân ca theo ngày trong tuần (T2 – CN)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {days.map((dayName, idx) => {
                    const dayNum = idx + 1;
                    return (
                      <label
                        key={dayName}
                        className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        <span>{dayName}</span>
                        <select
                          value={scheduleForm.dayShifts[dayNum] ?? ""}
                          onChange={(e) =>
                            setScheduleForm((prev) => ({
                              ...prev,
                              dayShifts: {
                                ...prev.dayShifts,
                                [dayNum]: e.target.value,
                              },
                            }))
                          }
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800"
                        >
                          <option value="">Ngày nghỉ</option>
                          {shifts
                            .filter((s) => s.is_active)
                            .map((shift) => (
                              <option key={shift.id} value={shift.id}>
                                {shift.name} ({formatTime(shift.start_time)}–
                                {formatTime(shift.end_time)})
                              </option>
                            ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>

              {scheduleError && (
                <p role="alert" className="mt-3 text-sm text-rose-600">
                  {scheduleError}
                </p>
              )}
              {scheduleSuccess && (
                <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <CheckCircle2 size={16} />
                  {scheduleSuccess}
                </p>
              )}

              <button
                type="submit"
                disabled={savingSchedule}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Plus size={16} />
                {savingSchedule ? "Đang tạo..." : "Tạo lịch"}
              </button>
            </form>

            {/* Assign Schedule to Employee Form */}
            <form
              onSubmit={handleAssignSchedule}
              className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4"
            >
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Gán lịch tuần</h2>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs text-slate-500 sm:col-span-2">
                    Nhân sự
                    <select
                      required
                      value={assignForm.employee_id}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, employee_id: e.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">-- Chọn nhân sự --</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name} ({emp.employee_code}
                          {emp.department ? ` · ${emp.department}` : ""})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs text-slate-500 sm:col-span-2">
                    Lịch làm việc tuần
                    <select
                      required
                      value={assignForm.schedule_id}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, schedule_id: e.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">-- Chọn lịch tuần --</option>
                      {schedules
                        .filter((s) => s.is_active)
                        .map((sched) => (
                          <option key={sched.id} value={sched.id}>
                            {sched.name} ({sched.code})
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="text-xs text-slate-500">
                    Hiệu lực từ ngày
                    <input
                      required
                      type="date"
                      value={assignForm.effective_from}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, effective_from: e.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>

                  <label className="text-xs text-slate-500">
                    Đến ngày
                    <input
                      type="date"
                      value={assignForm.effective_to}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, effective_to: e.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                </div>

                {assignError && (
                  <p role="alert" className="mt-3 text-sm text-rose-600">
                    {assignError}
                  </p>
                )}
                {assignSuccess && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <CheckCircle2 size={16} />
                    {assignSuccess}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-2">
                <button
                  type="submit"
                  disabled={savingAssign || employees.length === 0 || schedules.length === 0}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  <UserCheck size={16} />
                  {savingAssign ? "Đang gán..." : "Gán lịch"}
                </button>
              </div>
            </form>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {schedules.map((schedule) => {
              const rules = new Map(
                schedule.rules.map((rule) => [rule.day_of_week, rule])
              );
              return (
                <article
                  key={schedule.id}
                  className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
                >
                  <div className="flex items-start justify-between border-b border-slate-100 px-5 py-5">
                    <div className="flex gap-3">
                      <div>
                        <h2 className="font-bold text-slate-900">{schedule.name}</h2>
                        <p className="mt-1 font-mono text-xs font-semibold text-indigo-600">
                          {schedule.code}
                        </p>
                        {schedule.description && (
                          <p className="mt-1 text-sm text-slate-500">{schedule.description}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        schedule.is_active
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {schedule.is_active ? "Đang áp dụng" : "Ngưng"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 divide-y divide-slate-100 px-5 py-2 sm:grid-cols-2 sm:divide-y-0 sm:gap-x-6">
                    {days.map((day, index) => {
                      const shift = rules.get(index + 1)?.shift;
                      const isMorning = shift?.code.includes("MORNING") || shift?.code.includes("SANG");
                      const isEvening = shift?.code.includes("EVENING") || shift?.code.includes("CHIEU");
                      const shiftBadgeClass = isMorning
                        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                        : isEvening
                          ? "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200"
                          : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
                      return (
                        <div key={day} className="flex items-center justify-between py-3">
                          <span className="text-sm font-semibold text-slate-700">{day}</span>
                          {shift ? (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${shiftBadgeClass}`}
                            >
                              <Clock3 size={13} />
                              {shift.name} · {formatTime(shift.start_time)}
                            </span>
                          ) : (
                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">
                              Nghỉ ca
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
          {schedules.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
              Chưa có lịch làm việc tuần nào được cấu hình.
            </div>
          )}
        </>
      )}
    </section>
  );
}
