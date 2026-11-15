import { useEffect, useState } from "react";
import { Clock3, MoonStar, ShieldCheck } from "lucide-react";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getApiErrorMessage } from "../api/error";
import { getShifts } from "../api/schedule.api";
import type { Shift } from "../types/schedule";

function formatTime(value: string) {
  return value.slice(0, 5);
}

export default function Shifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadShifts() {
    try {
      setLoading(true);
      setError("");
      setShifts(await getShifts());
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to load shifts."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadShifts(); }, []);

  if (loading) return <LoadingState message="Đang tải ca làm việc..." />;
  if (error) return <ErrorState message={error} onRetry={() => void loadShifts()} />;

  const activeCount = shifts.filter((shift) => shift.is_active).length;
  const overnightCount = shifts.filter((shift) => shift.is_overnight).length;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ca làm việc</h1>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Tổng số ca</div><div className="mt-1 text-2xl font-semibold text-slate-900">{shifts.length}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Đang hoạt động</div><div className="mt-1 text-2xl font-semibold text-slate-900">{activeCount}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Ca qua đêm</div><div className="mt-1 text-2xl font-semibold text-slate-900">{overnightCount}</div></div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Danh mục ca làm việc</h2></div>
        {shifts.length === 0 ? <div className="px-5 py-16 text-center text-sm text-slate-500">Chưa có ca làm việc nào.</div> : <div className="divide-y divide-slate-100">{shifts.map((shift) => <article key={shift.id} className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{shift.name}</h3><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{shift.code}</span>{!shift.is_active && <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs text-rose-600">Ngưng</span>}</div><p className="mt-1 text-sm text-slate-500">{formatTime(shift.start_time)} - {formatTime(shift.end_time)}{shift.is_overnight ? " · ca qua đêm" : ""}</p></div><div className="grid grid-cols-2 gap-3 text-sm md:min-w-[260px]"><div className="rounded-md bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">Cho phép trễ</p><p className="mt-0.5 font-semibold text-slate-800">{shift.late_tolerance_minutes} phút</p></div><div className="rounded-md bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">Mở chấm công sớm</p><p className="mt-0.5 font-semibold text-slate-800">{shift.early_checkin_minutes} phút</p></div></div></article>)}</div>}
      </div>
    </section>
  );
}