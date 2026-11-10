from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.attendance import Attendance, AttendanceStatus
from app.models.attendance_request import (
    AttendanceRequest,
    AttendanceRequestStatus,
    AttendanceRequestType,
)
from app.models.employee import Employee
from app.models.schedule_assignment import ScheduleAssignment
from app.models.schedule_rule import ScheduleRule
from app.models.shift import Shift
from app.models.user import User, UserRole
from app.models.work_schedule import WorkSchedule
from app.schemas.auth import LoginRequest, LoginResponse, UserResponse
from app.api.dependencies.auth import get_current_user


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)


@router.post(
    "/login",
    response_model=LoginResponse,
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.username == payload.username)
        .first()
    )

    if user is None or not verify_password(
        payload.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role.value,
        }
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            username=user.username,
            role=user.role.value,
        ),
    )

@router.post("/logout")
def logout(
    current_user: User = Depends(get_current_user),
):
    return {
        "message": "Logout successful",
    }


@router.post("/demo-seed")
def seed_demo_data(
    db: Session = Depends(get_db),
):
    """Idempotently initialize demo accounts, employees, shifts, schedules, and attendance logs."""
    Base.metadata.create_all(bind=db.get_bind(), checkfirst=True)

    # 1. Admin demo account (preserve pre-existing admin password if customized)
    demo_admin_username = "admin"
    admin_user = db.query(User).filter(User.username == "admin").first()
    if admin_user is None:
        admin_user = User(
            username="admin",
            password_hash=hash_password("admin123"),
            role=UserRole.ADMIN,
        )
        db.add(admin_user)
        db.flush()
    elif not verify_password("admin123", admin_user.password_hash):
        demo_admin_username = "demo_admin"
        demo_admin = db.query(User).filter(User.username == "demo_admin").first()
        if demo_admin is None:
            demo_admin = User(
                username="demo_admin",
                password_hash=hash_password("admin123"),
                role=UserRole.ADMIN,
            )
            db.add(demo_admin)
            db.flush()
        admin_user = demo_admin

    # 2. Shifts (F&B Store Operations + Standard Shifts)
    shift_specs = [
        ("Ca Sáng F&B (Opening)", "FNB-MORNING", time(6, 0), time(14, 0), False, "Ca mở cửa chuẩn bị quầy Barista & Bếp (06:00 - 14:00)"),
        ("Ca Chiều F&B (Afternoon)", "FNB-AFTERNOON", time(14, 0), time(22, 0), False, "Ca phục vụ chiều & cao điểm tối (14:00 - 22:00)"),
        ("Ca Đêm F&B (Overnight)", "FNB-NIGHT", time(22, 0), time(6, 0), True, "Ca đêm 24/7 & vệ sinh đóng quầy qua ngày (22:00 - 06:00)"),
        ("Ca Gãy Cao Điểm (Peak Split)", "FNB-PEAK", time(10, 0), time(14, 0), False, "Ca Part-time tăng cường giờ cao điểm trưa (10:00 - 14:00)"),
        ("Day Office", "DAY-OFFICE", time(8, 0), time(17, 0), False, "Standard 08:00 - 17:00 office shift"),
        ("Morning Shift", "MORNING-SHIFT", time(7, 30), time(16, 30), False, "Early operations shift"),
        ("Night Shift", "NIGHT-SHIFT", time(22, 0), time(6, 0), True, "Overnight security & operations shift"),
    ]
    shifts_by_code: dict[str, Shift] = {}
    for s_name, s_code, s_start, s_end, s_overnight, s_desc in shift_specs:
        shift = db.query(Shift).filter(Shift.code == s_code).first()
        if shift is None:
            shift = Shift(
                name=s_name,
                code=s_code,
                start_time=s_start,
                end_time=s_end,
                late_tolerance_minutes=15,
                early_checkin_minutes=30,
                checkin_close_minutes=90,
                is_overnight=s_overnight,
                is_active=True,
                description=s_desc,
            )
            db.add(shift)
            db.flush()
        shifts_by_code[s_code] = shift

    day_shift = shifts_by_code["FNB-MORNING"]
    afternoon_shift = shifts_by_code["FNB-AFTERNOON"]

    # 3. Weekly Schedules (F&B Rotating Shift & Standard Week)
    std_schedule = db.query(WorkSchedule).filter(WorkSchedule.code == "FNB-ROTATING").first()
    if std_schedule is None:
        std_schedule = WorkSchedule(
            name="Lịch Ca Xoay Cửa Hàng F&B (6 Ngày/Tuần)",
            code="FNB-ROTATING",
            description="T2-T4 Ca Sáng (06:00-14:00), T5-T7 Ca Chiều (14:00-22:00), CN Nghỉ",
            is_active=True,
        )
        std_schedule.rules = [
            ScheduleRule(
                day_of_week=day_num,
                shift_id=day_shift.id if day_num <= 3 else (afternoon_shift.id if day_num <= 6 else None),
            )
            for day_num in range(1, 8)
        ]
        db.add(std_schedule)
        db.flush()

    # 4. Demo Employees & User Accounts (F&B Store Staff)
    demo_staff = [
        ("demo_khoa", "EMP-D001", "Trần Đăng Khoa", "demo.khoa@averis.vn", "Quầy Pha Chế - Barista"),
        ("demo_linh", "EMP-D002", "Nguyễn Phương Linh", "demo.linh@averis.vn", "Sảnh Phục Vụ - Service"),
        ("demo_minh", "EMP-D003", "Lê Hoàng Minh", "demo.minh@averis.vn", "Khu Vực Bếp - Kitchen"),
        ("demo_anh", "EMP-D004", "Phạm Ngọc Ánh", "demo.anh@averis.vn", "Quầy Thu Ngân - POS"),
        ("demo_huy", "EMP-D005", "Võ Quốc Huy", "demo.huy@averis.vn", "Quản Lý Cửa Hàng - Store Ops"),
    ]

    today = date.today()
    effective_start = today - timedelta(days=60)
    demo_employees: list[Employee] = []

    for username, emp_code, full_name, email, dept in demo_staff:
        u = db.query(User).filter(User.username == username).first()
        if u is None:
            u = User(
                username=username,
                password_hash=hash_password("emp123"),
                role=UserRole.EMPLOYEE,
            )
            db.add(u)
            db.flush()

        emp = (
            db.query(Employee)
            .filter(
                (Employee.user_id == u.id)
                | (Employee.employee_code == emp_code)
                | (Employee.email == email)
            )
            .first()
        )
        if emp is None:
            emp = Employee(
                user_id=u.id,
                employee_code=emp_code,
                full_name=full_name,
                email=email,
                department=dept,
            )
            db.add(emp)
            db.flush()
        else:
            emp.employee_code = emp_code
            emp.full_name = full_name
            emp.email = email
            emp.department = dept
            db.flush()

        demo_employees.append(emp)

        # Ensure active schedule assignment
        active_assign = (
            db.query(ScheduleAssignment)
            .filter(
                ScheduleAssignment.employee_id == emp.id,
                ScheduleAssignment.is_active.is_(True),
            )
            .first()
        )
        if active_assign is None:
            db.add(
                ScheduleAssignment(
                    employee_id=emp.id,
                    schedule_id=std_schedule.id,
                    effective_from=effective_start,
                    effective_to=None,
                    is_active=True,
                )
            )
            db.flush()

    # 5. Past 14 Days of Realistic Attendance Logs (Weekdays + Today)
    records_created = 0
    for day_offset in range(13, -1, -1):
        d = today - timedelta(days=day_offset)
        if d.isoweekday() > 5 and day_offset != 0:
            continue
        for idx, emp in enumerate(demo_employees):
            # Leave 1 employee un-checked-in today so Absent/Check-in demo is realistic
            if day_offset == 0 and idx == len(demo_employees) - 1:
                continue
            existing_att = (
                db.query(Attendance)
                .filter(Attendance.employee_id == emp.id, Attendance.date == d)
                .first()
            )
            if existing_att is not None:
                continue

            is_late = (day_offset + idx) % 4 == 0
            late_mins = 18 + (idx * 4) if is_late else 0
            check_in_minute = (22 + idx * 3) if is_late else (52 + (idx % 7))
            check_in_hour = 8 if is_late else 7
            check_in_dt = datetime(
                d.year, d.month, d.day, check_in_hour, min(check_in_minute, 58), 0, tzinfo=timezone.utc
            )
            overtime_mins = 30 if (day_offset + idx) % 3 == 0 else 0
            check_out_dt = datetime(
                d.year, d.month, d.day, 17, min(10 + overtime_mins, 55), 0, tzinfo=timezone.utc
            )
            working_mins = 480 - late_mins + overtime_mins

            db.add(
                Attendance(
                    employee_id=emp.id,
                    shift_id=day_shift.id,
                    date=d,
                    check_in=check_in_dt,
                    check_out=check_out_dt if day_offset > 0 or idx < 2 else None,
                    timestamp=check_out_dt if (day_offset > 0 or idx < 2) else check_in_dt,
                    status=AttendanceStatus.LATE if is_late else AttendanceStatus.PRESENT,
                    late_minutes=late_mins,
                    early_leave_minutes=0,
                    working_minutes=working_mins if (day_offset > 0 or idx < 2) else 240,
                    overtime_minutes=overtime_mins if (day_offset > 0 or idx < 2) else 0,
                    face_similarity=round(0.84 + ((idx + day_offset) % 12) * 0.01, 3),
                    liveness_score=round(0.92 + ((idx + day_offset) % 7) * 0.01, 3),
                    verification_status="VERIFIED",
                )
            )
            records_created += 1

    # 6. Sample F&B Attendance Explanation / Leave Requests
    if demo_employees and db.query(AttendanceRequest).count() == 0:
        db.add_all(
            [
                AttendanceRequest(
                    employee_id=demo_employees[0].id,
                    date=today - timedelta(days=1),
                    request_type=AttendanceRequestType.FORGOT_CHECKIN,
                    reason="[F&B Rush Hour] Đông khách đột biến đầu ca sáng tại Quầy Pha Chế - Barista nên quên quét mặt check-in Kiosk.",
                    status=AttendanceRequestStatus.PENDING,
                ),
                AttendanceRequest(
                    employee_id=demo_employees[1].id,
                    date=today - timedelta(days=3),
                    request_type=AttendanceRequestType.LATE_EXPLANATION,
                    reason="[Part-time Shift Swap] Xin đổi ca Chiều sang ca Sáng hỗ trợ Sảnh Phục Vụ, đến trễ 15p do lịch thi tại trường.",
                    status=AttendanceRequestStatus.APPROVED,
                    admin_note="Cửa hàng trưởng đã xác nhận lịch đổi ca. Duyệt đủ công ca sáng.",
                    reviewed_by=admin_user.id,
                    reviewed_at=datetime.now(timezone.utc),
                ),
            ]
        )

    db.commit()
    return {
        "seeded": True,
        "admin_credentials": {"username": demo_admin_username, "password": "admin123"},
        "employee_credentials": {"username": "demo_khoa", "password": "emp123"},
        "employees_total": len(demo_employees),
        "attendance_records_created": records_created,
    }