export type ShiftTemplateId = "morning" | "evening" | "peak" | "night";

export const SHIFT_TEMPLATES: Record<
  ShiftTemplateId,
  {
    label: string;
    name: string;
    code: string;
    start: string;
    end: string;
    description: string;
  }
> = {
  morning: {
    label: "Ca Sáng - Mở quầy (06:30–14:30)",
    name: "Ca Sáng - Mở quầy",
    code: "MORNING-OPEN",
    start: "06:30",
    end: "14:30",
    description: "Ca mở quầy, chuẩn bị nguyên liệu và phục vụ sáng - trưa",
  },
  evening: {
    label: "Ca Chiều - Đóng quầy (14:30–22:30)",
    name: "Ca Chiều - Đóng quầy",
    code: "EVENING-CLOSE",
    start: "14:30",
    end: "22:30",
    description: "Ca phục vụ chiều tối, kết toán và vệ sinh đóng quầy",
  },
  peak: {
    label: "Ca Gãy Part-time (11:00–15:00)",
    name: "Ca Gãy Part-time",
    code: "PEAK-PARTTIME",
    start: "11:00",
    end: "15:00",
    description: "Ca tăng cường khung giờ cao điểm trưa (Part-time 4h)",
  },
  night: {
    label: "Ca Đêm (18:00–23:00)",
    name: "Ca Đêm",
    code: "NIGHT-SHIFT",
    start: "18:00",
    end: "23:00",
    description: "Ca phục vụ tối và dọn dẹp đóng cửa",
  },
};

export function normalizeClock(value: string): string {
  return value.slice(0, 5);
}

export function matchShiftTemplate(start: string, end: string): ShiftTemplateId {
  const startClock = normalizeClock(start);
  const endClock = normalizeClock(end);
  for (const [key, item] of Object.entries(SHIFT_TEMPLATES) as [
    ShiftTemplateId,
    (typeof SHIFT_TEMPLATES)[ShiftTemplateId],
  ][]) {
    if (startClock === item.start && endClock === item.end) {
      return key;
    }
  }
  const hour = Number(startClock.slice(0, 2));
  if (Number.isFinite(hour) && hour >= 18) return "night";
  if (Number.isFinite(hour) && hour >= 14) return "evening";
  if (Number.isFinite(hour) && hour >= 10) return "peak";
  return "morning";
}
