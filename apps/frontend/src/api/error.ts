import axios from "axios";

const ENGLISH_TO_VIETNAMESE: Record<string, string> = {
  "No face detected": "Không phát hiện khuôn mặt trong khung hình.",
  "Face is too far from the camera": "Khuôn mặt ở quá xa camera, vui lòng lại gần hơn.",
  "Multiple faces detected": "Phát hiện nhiều khuôn mặt trong khung hình, vui lòng chỉ đứng một mình.",
  "Face was not recognized": "Không nhận diện được khuôn mặt nhân viên.",
  "Multiple employees have similarly matching faces": "Khuôn mặt trùng khớp với nhiều nhân viên khác nhau.",
  "Lighting is insufficient for fast attendance": "Ánh sáng quá yếu, vui lòng đứng ở nơi đủ sáng.",
  "Liveness validation failed": "Xác thực thực thể sống không thành công (nghi ngờ giả mạo).",
  "A valid image file is required": "Cần cung cấp tệp hình ảnh khuôn mặt hợp lệ.",
  "Empty image data": "Dữ liệu hình ảnh trống.",
  "Recognition did not identify an employee": "Không xác định được danh tính nhân viên.",
  "Employee not found": "Không tìm thấy nhân viên trong hệ thống.",
  "Attendance already completed for today": "Nhân viên đã hoàn thành chấm công (vào và ra ca) trong ngày hôm nay.",
  "AI Service request timed out": "Dịch vụ AI phản hồi quá thời gian chờ. Vui lòng thử lại.",
  "AI Service is unavailable": "Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.",
  "AI Service returned invalid JSON": "Dịch vụ AI phản hồi dữ liệu không hợp lệ.",
  "AI Service returned an invalid response": "Dịch vụ AI phản hồi dữ liệu không hợp lệ.",
  "Liveness session could not be created": "Không thể tạo phiên xác thực thực thể sống.",
  "Failed to save attendance": "Không thể lưu dữ liệu chấm công. Vui lòng thử lại.",
  "Bad request.": "Yêu cầu không hợp lệ.",
  "Your session has expired. Please login again.": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  "You do not have permission to perform this action.": "Bạn không có quyền thực hiện hành động này.",
  "The requested resource was not found.": "Không tìm thấy dữ liệu yêu cầu.",
  "This data already exists.": "Dữ liệu đã tồn tại trong hệ thống.",
  "The submitted data is invalid.": "Dữ liệu gửi lên không hợp lệ.",
  "Internal server error.": "Lỗi máy chủ nội bộ. Vui lòng thử lại sau.",
  "The server is currently unavailable.": "Máy chủ hiện không khả dụng. Vui lòng thử lại sau.",
  "The request timed out. Please try again.": "Yêu cầu đã hết thời gian chờ. Vui lòng thử lại.",
  "Unable to connect to the server. Please make sure the backend is running.":
    "Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền mạng.",
  "An unexpected error occurred.": "Đã xảy ra lỗi không xác định. Vui lòng thử lại.",
};

export function translateErrorMessage(message: string): string {
  if (!message) return message;

  const trimmed = message.trim();
  if (ENGLISH_TO_VIETNAMESE[trimmed]) {
    return ENGLISH_TO_VIETNAMESE[trimmed];
  }

  // Khớp thông báo ngưỡng an toàn: "Face similarity (X%) is below store security threshold (Y%)"
  const thresholdMatch = trimmed.match(
    /Face similarity \(([\d.]+%)\) is below store security threshold \(([\d.]+%)\)/i
  );
  if (thresholdMatch) {
    return `Độ khớp khuôn mặt (${thresholdMatch[1]}) chưa đạt ngưỡng bảo mật của cửa hàng (${thresholdMatch[2]}). Vui lòng nhìn thẳng vào camera và thử lại.`;
  }

  // Khớp thông báo khóa quét trùng / cooldown
  if (trimmed.includes("Please wait at least") && trimmed.includes("Khóa chống quét trùng")) {
    return trimmed.split(" (Please wait")[0].split(" (Vui lòng đợi")[0];
  }
  if (trimmed.includes("Please wait at least") && !trimmed.includes("Khóa chống quét trùng")) {
    return "Bạn vừa chấm công gần đây. Khóa chống quét đúp đang bật, vui lòng đợi ít phút trước khi quẹt lại.";
  }

  return trimmed;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Đã xảy ra lỗi không xác định. Vui lòng thử lại sau."
): string {
  // Không phải Axios error
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error) {
      return translateErrorMessage(error.message);
    }
    return translateErrorMessage(fallback);
  }

  // Backend có response
  if (error.response) {
    const status = error.response.status;
    const detail = error.response.data?.detail;

    // FastAPI thường trả detail
    if (typeof detail === "string") {
      return translateErrorMessage(detail);
    }

    switch (status) {
      case 400:
        return "Yêu cầu không hợp lệ.";

      case 401:
        return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";

      case 403:
        return "Bạn không có quyền thực hiện hành động này.";

      case 404:
        return "Không tìm thấy dữ liệu yêu cầu.";

      case 409:
        return "Dữ liệu đã tồn tại hoặc có xung đột nghiệp vụ.";

      case 422:
        return "Dữ liệu gửi lên không hợp lệ.";

      case 500:
        return "Lỗi máy chủ nội bộ. Vui lòng thử lại sau.";

      case 502:
        return "Máy chủ dịch vụ tạm thời không phản hồi. Vui lòng thử lại sau.";

      case 503:
        return "Máy chủ hiện đang bận hoặc bảo trì. Vui lòng thử lại sau.";

      case 504:
        return "Yêu cầu đã hết thời gian chờ (Gateway Timeout). Vui lòng thử lại.";

      default:
        return `Yêu cầu thất bại với mã lỗi ${status}.`;
    }
  }

  // Request được gửi nhưng không nhận response
  if (error.request) {
    if (error.code === "ECONNABORTED") {
      return "Yêu cầu đã hết thời gian chờ (timeout). Vui lòng thử lại.";
    }

    return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền mạng.";
  }

  return translateErrorMessage(fallback);
}
