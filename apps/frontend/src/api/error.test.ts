import { describe, expect, it } from "vitest";
import { getApiErrorMessage, translateErrorMessage } from "./error";

describe("translateErrorMessage", () => {
  it("translates store threshold message into Vietnamese", () => {
    const raw = "Face similarity (56.8%) is below store security threshold (65%)";
    const result = translateErrorMessage(raw);
    expect(result).toBe(
      "Độ khớp khuôn mặt (56.8%) chưa đạt ngưỡng bảo mật của cửa hàng (65%). Vui lòng nhìn thẳng vào camera và thử lại."
    );
  });

  it("translates standard AI error codes into Vietnamese", () => {
    expect(translateErrorMessage("No face detected")).toBe(
      "Không phát hiện khuôn mặt trong khung hình."
    );
    expect(translateErrorMessage("Face was not recognized")).toBe(
      "Không nhận diện được khuôn mặt nhân viên."
    );
    expect(translateErrorMessage("Liveness validation failed")).toBe(
      "Xác thực thực thể sống không thành công (nghi ngờ giả mạo)."
    );
  });

  it("handles fallback with Vietnamese message", () => {
    expect(getApiErrorMessage(new Error("Liveness validation failed"))).toBe(
      "Xác thực thực thể sống không thành công (nghi ngờ giả mạo)."
    );
  });
});
