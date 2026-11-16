import random
from datetime import date, datetime, time, timedelta, timezone
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.employee import Employee
from app.models.shift import Shift
from app.models.work_schedule import WorkSchedule
from app.models.schedule_assignment import ScheduleAssignment
from app.models.attendance import Attendance, AttendanceStatus
from app.models.attendance_request import (
    AttendanceRequest,
    AttendanceRequestType,
    AttendanceRequestStatus,
)
from app.models.store_profile import StoreProfile

def run_seed():
    db = SessionLocal()
    try:
        print("=== BẮT ĐẦU TẠO MOCK DATA AVERIS ERP ===")
        
        # 1. Đồng bộ Store Profile
        store = db.query(StoreProfile).filter(StoreProfile.id == 2).first()
        if not store:
            store = StoreProfile(id=2, store_name="Averis Coffee & Lounge", owner_user_id=29)
            db.add(store)
            db.commit()
            db.refresh(store)
        else:
            store.store_name = "Averis Coffee & Lounge"
            db.commit()

        # Cập nhật store_id = 2 cho tất cả admin và nhân viên hiện có
        db.query(User).filter(User.id.in_([1, 4, 6, 8, 9, 29])).update({"store_id": 2}, synchronize_session=False)
        db.query(Employee).filter(Employee.id.in_([1, 4, 6, 8, 29])).update({"store_id": 2}, synchronize_session=False)
        db.commit()
        print("Đã đồng bộ Store ID = 2 cho toàn bộ nhân sự hiện hữu.")

        # Cập nhật chính sách lương theo ngạch bậc nhân sự Averis
        policies = {
            "MGR-029": {"salary_type": SalaryType.MONTHLY, "base_salary": 12000000.0, "hourly_rate": 0.0, "allowance": 1000000.0},
            "EMP001": {"salary_type": SalaryType.MONTHLY, "base_salary": 9500000.0, "hourly_rate": 0.0, "allowance": 500000.0},
            "EMP-0006": {"salary_type": SalaryType.MONTHLY, "base_salary": 10500000.0, "hourly_rate": 0.0, "allowance": 800000.0},
            "EMP-0004": {"salary_type": SalaryType.HOURLY, "base_salary": 0.0, "hourly_rate": 42000.0, "allowance": 300000.0},
            "EMP-0008": {"salary_type": SalaryType.HOURLY, "base_salary": 0.0, "hourly_rate": 32000.0, "allowance": 200000.0},
            "BAR-0011": {"salary_type": SalaryType.HOURLY, "base_salary": 0.0, "hourly_rate": 30000.0, "allowance": 0.0},
            "SRV-0010": {"salary_type": SalaryType.HOURLY, "base_salary": 0.0, "hourly_rate": 28000.0, "allowance": 0.0},
            "KIT-0012": {"salary_type": SalaryType.HOURLY, "base_salary": 0.0, "hourly_rate": 28000.0, "allowance": 0.0},
        }
        for code, pol in policies.items():
            emp = db.query(Employee).filter(Employee.employee_code == code).first()
            if emp:
                emp.salary_type = pol["salary_type"]
                emp.base_salary = pol["base_salary"]
                emp.hourly_rate = pol["hourly_rate"]
                emp.allowance = pol["allowance"]
        db.commit()

        # 2. Thêm 3 nhân viên mới để quy mô quầy đủ 8 nhân sự đa dạng vị trí
        new_staff = [
            ("thutrang", "SRV-0010", "Hoàng Thu Trang", "thutrang@averis.vn", "Phục vụ (Server)", SalaryType.HOURLY, 0.0, 28000.0, 0.0),
            ("minhquan", "BAR-0011", "Đặng Minh Quân", "minhquan@averis.vn", "Pha chế Part-time (Barista)", SalaryType.HOURLY, 0.0, 30000.0, 0.0),
            ("khanhlinh", "KIT-0012", "Bùi Khánh Linh", "khanhlinh@averis.vn", "Phụ bếp (Kitchen Helper)", SalaryType.HOURLY, 0.0, 28000.0, 0.0),
        ]

        pwd_hash = hash_password("123456")
        for username, emp_code, full_name, email, dept, stype, bsal, hrate, allow in new_staff:
            user = db.query(User).filter(User.username == username).first()
            if not user:
                user = User(
                    username=username,
                    password_hash=pwd_hash,
                    role=UserRole.EMPLOYEE,
                    store_id=2,
                )
                db.add(user)
                db.commit()
                db.refresh(user)

            emp = db.query(Employee).filter(Employee.employee_code == emp_code).first()
            if not emp:
                emp = Employee(
                    user_id=user.id,
                    employee_code=emp_code,
                    full_name=full_name,
                    email=email,
                    department=dept,
                    store_id=2,
                    salary_type=stype,
                    base_salary=bsal,
                    hourly_rate=hrate,
                    allowance=allow,
                )
                db.add(emp)
                db.commit()
                db.refresh(emp)

        employees = db.query(Employee).filter(Employee.store_id == 2).order_by(Employee.id).all()
        print(f"Tổng số nhân sự tại cửa hàng: {len(employees)} nhân viên.")

        # 3. Đảm bảo tất cả nhân sự đều có phân ca ScheduleAssignment (Lịch 7 ngày)
        schedule = db.query(WorkSchedule).filter(WorkSchedule.id == 1).first()
        if schedule:
            for emp in employees:
                assign = db.query(ScheduleAssignment).filter(
                    ScheduleAssignment.employee_id == emp.id,
                    ScheduleAssignment.schedule_id == schedule.id,
                ).first()
                if not assign:
                    assign = ScheduleAssignment(
                        employee_id=emp.id,
                        schedule_id=schedule.id,
                        effective_from=date(2026, 1, 1),
                        effective_to=None,
                        is_active=True,
                    )
                    db.add(assign)
            db.commit()
            print("Đã gán Lịch phân ca tuần cho toàn bộ nhân sự.")

        shifts = {s.id: s for s in db.query(Shift).all()}
        # ca sáng: id 1 (06:30 - 14:30), ca chiều: id 2 (14:30 - 22:30), ca gãy: id 3 (11:00 - 15:00)

        # 4. Tạo dữ liệu chấm công từ 01/11/2026 đến 16/11/2026
        # Giờ UTC = Giờ VN - 7 tiếng
        random.seed(42) # Đảm bảo số liệu đồng đều, có lặp lại chuẩn xác
        
        start_date = date(2026, 11, 1)
        end_date = date(2026, 11, 16)
        total_created = 0

        # Phân vai trò ca làm việc phù hợp cho từng nhân sự
        for emp in employees:
            curr = start_date
            while curr <= end_date:
                # Nếu hôm nay là 2026-11-16 và là nhân viên 29 (Trần Tiến Danh) -> giữ nguyên lượt thực tế vừa test
                if curr == end_date and emp.id == 29:
                    curr += timedelta(days=1)
                    continue

                # Kiểm tra bản ghi đã tồn tại chưa
                existing = db.query(Attendance).filter(
                    Attendance.employee_id == emp.id,
                    Attendance.date == curr,
                ).first()
                if existing:
                    # Nếu có bản ghi cũ từ trước không phải ngày 16 thì xóa để nạp bộ chuẩn
                    if curr != end_date:
                        db.delete(existing)
                        db.commit()
                    else:
                        curr += timedelta(days=1)
                        continue

                weekday = curr.isoweekday() # 1=Mon .. 7=Sun

                # Quy tắc nghỉ tuần: mỗi nhân viên nghỉ 1 ngày trong tuần (xoay vòng)
                off_day = (emp.id % 7) + 1
                if weekday == off_day:
                    # Ngày nghỉ ca (không có lượt chấm công)
                    curr += timedelta(days=1)
                    continue

                # Chọn ca làm việc phù hợp vị trí
                if "Quản lý" in (emp.department or ""):
                    shift_id = 1 if weekday <= 4 else 2
                elif "Barista" in (emp.department or "") or "Pha chế" in (emp.department or ""):
                    shift_id = 1 if weekday % 2 == 1 else 2
                elif "Bếp" in (emp.department or ""):
                    shift_id = 1 if weekday <= 5 else 3
                elif "Thu ngân" in (emp.department or ""):
                    shift_id = 2 if weekday <= 4 else 1
                else: # Phục vụ
                    shift_id = 3 if weekday <= 5 else 2

                target_shift = shifts.get(shift_id, shifts.get(1))

                # Kịch bản ngẫu nhiên thực tế:
                # 75% Đúng giờ (trong đó 25% có Tăng ca OT từ 30 - 120 phút)
                # 15% Đi trễ (10 - 35 phút)
                # 5% Về sớm (30 - 60 phút)
                # 5% Vắng mặt (hoặc nghỉ phép)
                rand_val = random.random()

                if rand_val < 0.05:
                    # Vắng mặt (ABSENT)
                    att = Attendance(
                        employee_id=emp.id,
                        shift_id=target_shift.id,
                        date=curr,
                        check_in=None,
                        check_out=None,
                        status=AttendanceStatus.ABSENT,
                        late_minutes=0,
                        early_leave_minutes=0,
                        working_minutes=0,
                        overtime_minutes=0,
                        face_similarity=None,
                        liveness_score=None,
                        verification_status="UNVERIFIED",
                    )
                else:
                    # Có đi làm
                    shift_start = datetime.combine(curr, target_shift.start_time)
                    shift_end = datetime.combine(curr, target_shift.end_time)

                    is_late = (0.05 <= rand_val < 0.20)
                    is_early = (0.20 <= rand_val < 0.25)
                    has_ot = (rand_val >= 0.70)

                    # Tính giờ Check-in
                    if is_late:
                        late_mins = random.randint(10, 35)
                        in_dt_vn = shift_start + timedelta(minutes=late_mins)
                        att_status = AttendanceStatus.LATE
                    else:
                        late_mins = 0
                        early_in = random.randint(3, 15)
                        in_dt_vn = shift_start - timedelta(minutes=early_in)
                        att_status = AttendanceStatus.PRESENT

                    # Tính giờ Check-out
                    if is_early:
                        early_mins = random.randint(20, 60)
                        out_dt_vn = shift_end - timedelta(minutes=early_mins)
                        ot_mins = 0
                        att_status = AttendanceStatus.LATE
                    elif has_ot:
                        early_mins = 0
                        ot_mins = random.choice([30, 45, 60, 90, 120])
                        out_dt_vn = shift_end + timedelta(minutes=ot_mins)
                    else:
                        early_mins = 0
                        ot_mins = random.randint(0, 10)
                        out_dt_vn = shift_end + timedelta(minutes=ot_mins)

                    # Đổi sang UTC (giờ VN - 7 tiếng)
                    in_dt_utc = in_dt_vn.replace(tzinfo=timezone.utc) - timedelta(hours=7)
                    out_dt_utc = out_dt_vn.replace(tzinfo=timezone.utc) - timedelta(hours=7)

                    work_mins = int((out_dt_vn - in_dt_vn).total_seconds() // 60)

                    sim = round(random.uniform(0.88, 0.98), 4)
                    live = round(random.uniform(0.93, 0.99), 4)

                    att = Attendance(
                        employee_id=emp.id,
                        shift_id=target_shift.id,
                        date=curr,
                        check_in=in_dt_utc,
                        check_out=out_dt_utc,
                        status=att_status,
                        late_minutes=late_mins,
                        early_leave_minutes=early_mins,
                        working_minutes=work_mins,
                        overtime_minutes=ot_mins,
                        timestamp=out_dt_utc,
                        face_similarity=sim,
                        liveness_score=live,
                        verification_status="VERIFIED",
                        session_id=f"kiosk_sim_{emp.id}_{curr.strftime('%Y%m%d')}",
                    )

                db.add(att)
                total_created += 1
                curr += timedelta(days=1)

        db.commit()
        print(f"Đã tạo thành công {total_created} lượt chấm công từ 01/11/2026 đến 16/11/2026!")

        # 5. Tạo dữ liệu mẫu Đơn từ (Attendance Requests) để test màn hình Duyệt đơn từ (/requests)
        db.query(AttendanceRequest).delete() # Reset để tạo bộ đơn chuẩn chỉnh
        db.commit()

        requests_mock = [
            (
                4, # Lê Phạm Anh Khoa
                date(2026, 11, 5),
                AttendanceRequestType.FORGOT_CHECKIN,
                "Em bị quên chấm công ra do vội hỗ trợ bàn khách lớn và dọn quầy lúc đóng cửa.",
                datetime(2026, 11, 5, 22, 35).replace(tzinfo=timezone.utc) - timedelta(hours=7),
                None,
                AttendanceRequestStatus.APPROVED,
                "Quản lý đã đối chiếu camera lúc 22:35, duyệt bổ sung giờ ra ca.",
            ),
            (
                8, # Nguyễn Trọng Tin
                date(2026, 11, 9),
                AttendanceRequestType.LATE_EXPLANATION,
                "Xe bị thủng xăm trên cầu Sài Gòn, em phải dắt bộ tìm tiệm sửa xe nên đến muộn 25 phút.",
                None,
                None,
                AttendanceRequestStatus.APPROVED,
                "Chấp thuận giải trình, nhắc nhở bảo dưỡng xe định kỳ.",
            ),
            (
                6, # Phạm Quốc Huy
                date(2026, 11, 12),
                AttendanceRequestType.EARLY_LEAVE,
                "Gia đình em có người nhà đi viện cấp cứu, em xin phép Bếp phó bàn giao ca về sớm 45 phút.",
                None,
                None,
                AttendanceRequestStatus.PENDING,
                None,
            ),
            (
                emp.id, # Hoàng Thu Trang
                date(2026, 11, 18),
                AttendanceRequestType.LEAVE,
                "Em xin phép nghỉ phép 1 ngày để về quê giải quyết thủ tục giấy tờ hành chính.",
                None,
                None,
                AttendanceRequestStatus.PENDING,
                None,
            ),
            (
                employees[-2].id, # Đặng Minh Quân
                date(2026, 11, 14),
                AttendanceRequestType.LATE_EXPLANATION,
                "Em ngủ quên do hôm trước thức khuya ôn thi.",
                None,
                None,
                AttendanceRequestStatus.REJECTED,
                "Lý do cá nhân không chính đáng, trừ điểm chuyên cần theo quy chế.",
            ),
            (
                employees[-1].id, # Bùi Khánh Linh
                date(2026, 11, 15),
                AttendanceRequestType.FORGOT_CHECKIN,
                "Kiosk lúc vào ca quá đông người, em vào bếp chuẩn bị sơ chế đồ gấp nên quên quẹt mặt vào.",
                datetime(2026, 11, 15, 6, 30).replace(tzinfo=timezone.utc) - timedelta(hours=7),
                None,
                AttendanceRequestStatus.PENDING,
                None,
            ),
        ]

        for emp_id, req_date, req_type, reason, req_in, req_out, req_status, admin_note in requests_mock:
            request_obj = AttendanceRequest(
                employee_id=emp_id,
                date=req_date,
                request_type=req_type,
                reason=reason,
                requested_check_in=req_in,
                requested_check_out=req_out,
                status=req_status,
                admin_note=admin_note,
            )
            db.add(request_obj)

        db.commit()
        print(f"Đã tạo thành công {len(requests_mock)} đơn từ mẫu (Đang chờ, Đã duyệt, Đã từ chối).")
        print("=== HOÀN TẤT NẠP MOCK DATA THÀNH CÔNG 100% ===")

    except Exception as e:
        db.rollback()
        print(f"Lỗi khi seed data: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
