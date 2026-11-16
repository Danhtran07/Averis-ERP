<div align="center">

# Averis ERP
### AI-Powered Biometrics Attendance & Workforce Management System
Hệ thống Quản trị Nhân sự & Chấm công Sinh trắc học Doanh nghiệp

---

[![React 18](https://img.shields.io/badge/Frontend-React_18_%7C_TypeScript-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_%7C_Python_3.12-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![InsightFace](https://img.shields.io/badge/AI_Engine-InsightFace_ArcFace-FF6B35?style=flat-square)](https://github.com/deepinsight/insightface)
[![MediaPipe](https://img.shields.io/badge/Vision-MediaPipe_3D_Mesh-00C7B7?style=flat-square&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_15-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/DevOps-Docker_Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

<p align="center">
  <a href="#tong-quan-he-thong">Tổng quan</a> •
  <a href="#kien-truc-he-thong">Kiến trúc</a> •
  <a href="#cac-phan-he-nghiep-vu">Phân hệ nghiệp vụ</a> •
  <a href="#huong-dan-khoi-dong">Cài đặt & Khởi động</a> •
  <a href="#tai-lieu-api--cong-truy-cap">Cổng dịch vụ</a> •
  <a href="#kiem-thu-tu-dong">Kiểm thử</a>
</p>

</div>

---

## Tổng quan Hệ thống

**Averis ERP** là giải pháp chấm công sinh trắc học và quản trị lịch ca vận hành, kết hợp mô hình nhận diện khuôn mặt ArcFace 512 chiều và cơ chế chống giả mạo thụ động (**Passive Anti-Spoofing**). Hệ thống được thiết kế hướng tới các chuỗi bán lẻ, F&B và văn phòng có mật độ ra vào cao.

### Đặc tính Kỹ thuật & Nghiệp vụ

| Tiêu chí | Cơ chế xử lý | Mô tả chi tiết |
| :--- | :--- | :--- |
| **Tốc độ xử lý Kiosk** | InsightFace ArcFace + MediaPipe | Thời gian khóa nhận diện ổn định ~2.5s, độ trễ suy luận AI < 500ms. |
| **Chống gian lận (Liveness)** | 2D FFT Moiré + 3D Landmark Depth | Phát hiện khuôn mặt từ màn hình điện thoại, máy tính bảng và ảnh in giấy không cần bắt người dùng nháy mắt hay quay đầu. |
| **Chống quét đúp** | Debounce Cooldown Lock | Tự động khóa 2 phút sau khi vào ca để tránh ghi đè nhầm lượt ra ca. |
| **Quản lý ca làm việc** | Shift Resolver (Timezone UTC+7) | Hỗ trợ ca xoay, ca gãy và ca đêm qua ngày (Overnight Shift). |
| **Tính toán công & OT** | Real-time Attendance Policy | Tự động đo thời gian làm thực tế, số phút trễ, về sớm và làm thêm giờ (OT). |
| **Bảng lương theo giờ** | F&B Payroll Engine | Áp dụng hệ số tăng ca 1.5x (150%) theo Luật Lao Động, xuất báo cáo CSV chuẩn Excel UTF-8 BOM. |
| **Quản lý đơn từ** | Request Workflow State Machine | Quy trình số hóa đơn xin nghỉ, giải trình đi trễ, về sớm và quên chấm công. |

---

## Kiến trúc Hệ thống

Hệ thống triển khai theo mô hình kiến trúc phân tầng (Multi-tier Architecture):

```mermaid
flowchart TD
    subgraph Client ["Client Tier (Kiosk & Web UI)"]
        UI["React 18 SPA (Vite + Tailwind CSS)"]
        MP["MediaPipe FaceMesh (Khung Oval & Đo ổn định)"]
        WA["Web Audio API (Âm thanh phản hồi Chime & Beep)"]
        UI --- MP
        UI --- WA
    end

    subgraph BackendTier ["Application Tier (Core Backend & Logic ERP)"]
        BE["FastAPI Core Backend (Python 3.12)"]
        SR["Shift Resolver (Timezone UTC+7 / Ca đêm qua 0h)"]
        AP["Attendance Policy (Tính trễ, về sớm & OT)"]
        PE["Payroll Engine (Lương giờ & Hệ số OT 1.5x)"]
        BE --> SR
        BE --> AP
        BE --> PE
    end

    subgraph AITier ["Intelligence Tier (AI Biometrics Service)"]
        AI["FastAPI AI Service (Python 3.11)"]
        AF["InsightFace ArcFace (Model buffalo_l - 512-dim)"]
        PAS["Passive Anti-Spoofing (2D FFT Moiré / Specular Glare / Depth)"]
        AI --> AF
        AI --> PAS
    end

    subgraph DataTier ["Persistence Tier (Database)"]
        DB[("PostgreSQL 15 (DB: averis)\nLưu trữ Nhân sự, Ca làm việc,\nLịch tuần & Vector Embeddings")]
    end

    UI -->|"HTTP / WebSocket Proxy (Port 5173)"| BE
    BE -->|"HTTP POST (Port 8000 -> 8002)"| AI
    BE -->|"SQLAlchemy ORM + Alembic (Port 5433)"| DB

    style Client fill:#f8fafc,stroke:#64748b,stroke-width:1.5px
    style BackendTier fill:#f8fafc,stroke:#0d9488,stroke-width:1.5px
    style AITier fill:#f8fafc,stroke:#c2410c,stroke-width:1.5px
    style DataTier fill:#f8fafc,stroke:#4338ca,stroke-width:1.5px
```

---

## Các Phân hệ Nghiệp vụ

### 1. Kiosk Chấm công Sinh trắc học
* **Nhận diện tự động:** Hệ thống tự động xác định nhân sự, đối chiếu ca làm việc đang áp dụng để điền vào `check_in` hoặc `check_out`.
* **Passive Anti-Spoofing:**
  * *Phân tích tần số 2D FFT:* Phát hiện sọc vân Moiré sinh ra từ màn hình LCD/OLED của thiết bị di động.
  * *Độ biến thiên độ sâu 3D (Landmark Depth Variance):* Phân tích tọa độ không gian 468 điểm mốc khuôn mặt để loại bỏ hình ảnh 2D in trên giấy.
  * *Vi chuyển động 2 khung hình (2-frame Micro-motion):* Chụp liên tiếp 2 khung hình cách nhau 220ms để nhận biết chuyển động cơ học tự nhiên của người thật.
* **Khóa chống quét trùng 2 phút (Double-tap Cooldown):** Ngăn chặn việc camera tiếp tục quét khuôn mặt ngay sau khi vừa xác nhận vào ca, loại bỏ lỗi ghi nhận nhầm ra ca tức thì.

### 2. Quản lý Ca & Phân ca Tuần
* **Danh mục Ca (`/shifts`):**
  * Hỗ trợ ca thường, ca gãy và ca đêm qua ngày (Overnight Shift - chạy xuyên qua 00:00).
  * Cấu hình dung sai đi trễ (`late_tolerance_minutes`), khoảng mở nhận diện sớm (`early_checkin_minutes`) và mốc đóng nhận diện (`checkin_close_minutes`).
* **Lịch phân ca tuần (`/schedules`):**
  * Lập ma trận ca làm việc 7 ngày (Thứ Hai đến Chủ Nhật).
  * Gán ca linh hoạt theo nhân sự kèm hiệu lực thời gian (`effective_from`, `effective_to`).

### 3. Tự động Tính Công & Tăng Ca (Overtime - OT)
* **Xác định thời gian thực:**
  * Giờ vào thực tế, giờ ra thực tế, thời gian làm việc thực tế (`working_minutes`).
  * Trạng thái công: Đúng giờ (`PRESENT`), Đi trễ (`LATE`), Vắng mặt (`ABSENT`).
  * Tính số phút đi trễ (`late_minutes`) và về sớm (`early_leave_minutes`).
* **Tính toán OT:**
  * Khi nhân sự ra ca sau mốc kết thúc ca làm việc:
    $$\text{overtime\_minutes} = \max(0, \text{Giờ Check-out} - \text{Giờ kết thúc ca})$$
  * Thời gian tăng ca được ghi nhận vào bản ghi chấm công và cộng dồn theo kỳ lương.

### 4. Bảng công Tháng & Ước tính Lương
* **Báo cáo tổng hợp (`/timesheet`):** Thống kê số ngày đúng giờ, trễ, vắng, tổng số phút làm việc và tổng số phút OT của từng nhân viên trong tháng.
* **Công thức tính lương F&B / theo giờ:**
  $$\text{Lương ước tính} = \left(\text{Giờ làm chuẩn} + \text{Giờ OT} \times 1.5\right) \times \text{Đơn giá giờ (VNĐ/h)}$$
* **Xuất dữ liệu CSV:** Định dạng UTF-8 BOM chuẩn, mở trực tiếp trên Microsoft Excel không bị lỗi font tiếng Việt.

### 5. Quy trình Quản lý Đơn từ & Phê duyệt (`/requests`)
* **Loại đơn hỗ trợ:**
  * `FORGOT_CHECKIN`: Quên chấm công vào hoặc ra ca.
  * `LATE_EXPLANATION`: Giải trình lý do đi trễ.
  * `EARLY_LEAVE`: Giải trình lý do về sớm.
  * `LEAVE`: Xin nghỉ phép có phép.
* **Quy trình xử lý:** Nhân sự tạo đơn trên hệ thống; Quản trị viên theo dõi danh sách chờ duyệt (`PENDING`), phê duyệt (`APPROVED`) hoặc từ chối (`REJECTED`) kèm phản hồi.

---

## Hướng dẫn Khởi động

Hệ thống được đóng gói hoàn chỉnh bằng Docker Compose:

### 1. Chuẩn bị biến môi trường

```bash
# Windows (PowerShell / CMD):
copy .env.example .env

# Linux / macOS:
cp .env.example .env
```

### 2. Khởi chạy hệ thống bằng Docker Compose

```bash
docker compose up -d --build
```

Lệnh trên sẽ khởi chạy 4 containers: Database PostgreSQL, Backend API, AI Recognition Service và Frontend Web App. Quá trình tạo schema và chạy migration Alembic được thực thi tự động.

---

## Tài liệu API & Cổng Truy cập

| Dịch vụ | Địa chỉ truy cập | Chức năng |
| :--- | :--- | :--- |
| **Cổng Web & Kiosk** | [http://localhost:5173](http://localhost:5173) | Kiosk Chấm công khuôn mặt & Giao diện Quản trị |
| **Backend API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Tài liệu OpenAPI / Swagger Backend |
| **AI Biometrics Docs** | [http://localhost:8002/docs](http://localhost:8002/docs) | Tài liệu OpenAPI AI Service (ArcFace & Liveness) |
| **PostgreSQL Database** | `localhost:5433` (DB: `averis`) | Cổng kết nối CSDL (User: `postgres` / Pass: `postgres`) |

---

## Cấu hình Biến Môi trường (`.env`)

```ini
# Database PostgreSQL
POSTGRES_DB=averis
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST_PORT=5433

# Backend Core (FastAPI)
BACKEND_PORT=8000
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/averis
JWT_SECRET_KEY=development-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=43200

# AI Biometrics Service (InsightFace)
AI_SERVICE_URL=http://ai-service:8000
AI_SERVICE_HOST_PORT=8002
FACE_MATCH_THRESHOLD=0.50
MIN_FACE_SIMILARITY_THRESHOLD=0.65
```

---

## Kiểm thử Tự động

Dự án duy trì bộ kiểm thử tự động với **155+ test cases** trên toàn bộ hệ thống:

```bash
# 1. Kiểm thử Backend (66 tests - xác thực, phân ca, tính công, tính lương):
docker compose exec backend pytest

# 2. Kiểm thử AI Service (73 tests - ArcFace, embedding, liveness):
docker compose exec ai-service pytest

# 3. Kiểm thử Frontend (16 tests - Vitest, chuyển ngữ lỗi, xử lý camera):
docker compose exec frontend npm test
```

---

## Phân quyền Người dùng (RBAC)

* **Quản trị viên (`ADMIN`):** Quản lý hồ sơ nhân sự, danh mục ca, phân ca tuần, phê duyệt đơn từ, tra cứu bảng công và xuất báo cáo lương tháng, quản trị tài khoản hệ thống.
* **Nhân viên (`EMPLOYEE`):** Thực hiện chấm công tại Kiosk, xem lịch ca cá nhân (`/my-schedule`), theo dõi bảng công cá nhân (`/attendance`), gửi đơn giải trình và xin nghỉ phép (`/requests`).

---

<div align="center">
<sub>Averis ERP • Enterprise Biometrics & Workforce Management</sub>
</div>
