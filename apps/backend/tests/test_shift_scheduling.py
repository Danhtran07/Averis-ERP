from datetime import date, datetime, time, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.attendance import AttendanceStatus
from app.models.employee import Employee
from app.models.schedule_assignment import ScheduleAssignment
from app.models.schedule_rule import ScheduleRule
from app.models.shift import Shift
from app.models.user import User, UserRole
from app.models.work_schedule import WorkSchedule
from app.schemas.ai import AIRecognitionResult
from app.services.attendance_policy import (
    calculate_attendance_metrics,
    calculate_attendance_status,
)
from app.services.attendance_recognition import record_recognition_attendance
from app.services.shift_resolver import resolve_shift


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def employee(db_session: Session):
    user = User(
        username="shift_test_employee",
        password_hash="hashed-password",
        role=UserRole.EMPLOYEE,
    )
    db_session.add(user)
    db_session.flush()
    employee = Employee(
        user_id=user.id,
        employee_code="EMP-SHIFT-001",
        full_name="Shift Test Employee",
        email="shift-test@example.com",
    )
    db_session.add(employee)
    db_session.commit()
    db_session.refresh(employee)
    return employee


@pytest.fixture
def shifts(db_session: Session):
    morning = Shift(
        name="Morning Shift",
        code="MORNING-TEST",
        start_time=time(8, 0),
        end_time=time(17, 0),
        late_tolerance_minutes=15,
        early_checkin_minutes=30,
        is_overnight=False,
        is_active=True,
    )
    afternoon = Shift(
        name="Afternoon Shift",
        code="AFTERNOON-TEST",
        start_time=time(13, 0),
        end_time=time(22, 0),
        late_tolerance_minutes=15,
        early_checkin_minutes=30,
        is_overnight=False,
        is_active=True,
    )
    night = Shift(
        name="Night Shift",
        code="NIGHT-TEST",
        start_time=time(22, 0),
        end_time=time(6, 0),
        late_tolerance_minutes=15,
        early_checkin_minutes=30,
        is_overnight=True,
        is_active=True,
    )
    db_session.add_all([morning, afternoon, night])
    db_session.commit()
    return morning, afternoon, night


@pytest.fixture
def weekly_schedule(db_session: Session, employee, shifts):
    morning, afternoon, night = shifts
    schedule = WorkSchedule(
        name="Weekly Test Schedule",
        code="WEEKLY-TEST",
        is_active=True,
    )
    db_session.add(schedule)
    db_session.flush()
    db_session.add_all(
        [
            ScheduleRule(schedule_id=schedule.id, day_of_week=1, shift_id=morning.id),
            ScheduleRule(schedule_id=schedule.id, day_of_week=4, shift_id=afternoon.id),
            ScheduleRule(schedule_id=schedule.id, day_of_week=5, shift_id=night.id),
        ]
    )
    db_session.add(
        ScheduleAssignment(
            employee_id=employee.id,
            schedule_id=schedule.id,
            effective_from=date(2026, 9, 1),
            is_active=True,
        )
    )
    db_session.commit()
    return schedule


def utc(year: int, month: int, day: int, hour: int, minute: int = 0):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def test_classifies_office_day_and_night_hours():
    from app.services.shift_hours import ShiftKind, classify_shift_kind

    assert classify_shift_kind(time(8, 0), time(17, 0)) is ShiftKind.DAY
    assert classify_shift_kind(time(16, 0), time(23, 0)) is ShiftKind.NIGHT
    assert classify_shift_kind(time(22, 0), time(6, 0), overnight=True) is ShiftKind.NIGHT


def test_creates_morning_afternoon_and_night_shifts(db_session, shifts):
    morning, afternoon, night = shifts

    assert (morning.start_time, morning.end_time) == (time(8, 0), time(17, 0))
    assert (afternoon.start_time, afternoon.end_time) == (time(13, 0), time(22, 0))
    assert (night.start_time, night.end_time) == (time(22, 0), time(6, 0))
    assert night.is_overnight is True
    assert db_session.query(Shift).count() == 3


def test_resolves_weekly_schedule_and_off_day(db_session, employee, weekly_schedule, shifts):
    morning, afternoon, night = shifts

    assert resolve_shift(db_session, employee.id, date(2026, 9, 7)).id == morning.id
    assert resolve_shift(db_session, employee.id, date(2026, 9, 10)).id == afternoon.id
    assert resolve_shift(db_session, employee.id, date(2026, 9, 13)) is None


def test_effective_date_switches_employee_schedule(db_session, employee, shifts, weekly_schedule):
    _, _, night = shifts
    replacement = WorkSchedule(
        name="Replacement Schedule",
        code="REPLACEMENT-TEST",
        is_active=True,
    )
    db_session.add(replacement)
    db_session.flush()
    db_session.add(
        ScheduleRule(schedule_id=replacement.id, day_of_week=1, shift_id=night.id)
    )
    db_session.add(
        ScheduleAssignment(
            employee_id=employee.id,
            schedule_id=replacement.id,
            effective_from=date(2026, 9, 15),
            is_active=True,
        )
    )
    db_session.commit()

    assert resolve_shift(db_session, employee.id, date(2026, 9, 14)).name == "Morning Shift"
    assert resolve_shift(db_session, employee.id, date(2026, 9, 21)).name == "Night Shift"


@pytest.mark.parametrize(
    ("check_in", "shift_index", "expected"),
    [
        (utc(2026, 9, 7, 1, 0), 0, AttendanceStatus.PRESENT),
        (utc(2026, 9, 7, 1, 16), 0, AttendanceStatus.LATE),
        (utc(2026, 9, 10, 6, 0), 1, AttendanceStatus.PRESENT),
        (utc(2026, 9, 10, 6, 16), 1, AttendanceStatus.LATE),
        (utc(2026, 9, 11, 15, 0), 2, AttendanceStatus.PRESENT),
        (utc(2026, 9, 11, 15, 16), 2, AttendanceStatus.LATE),
    ],
)
def test_policy_handles_all_shift_windows(
    db_session,
    employee,
    weekly_schedule,
    shifts,
    check_in,
    shift_index,
    expected,
):
    shift = shifts[shift_index]
    assert calculate_attendance_status(check_in, shift) == expected


def test_night_shift_check_out_calculates_working_minutes(db_session, shifts):
    night = shifts[2]
    check_in = utc(2026, 9, 11, 15, 0)
    check_out = utc(2026, 9, 11, 23, 0)

    metrics = calculate_attendance_metrics(check_in, check_out, night)

    assert metrics.late_minutes == 0
    assert metrics.early_leave_minutes == 0
    assert metrics.working_minutes == 480
    assert metrics.overtime_minutes == 0


def test_attendance_snapshots_shift_and_check_out_metrics(
    db_session,
    employee,
    weekly_schedule,
    shifts,
):
    recognition = AIRecognitionResult(
        matched=True,
        employee_id=employee.id,
        confidence=0.98,
        liveness=True,
    )
    check_in = utc(2026, 9, 7, 1, 16)
    check_out = utc(2026, 9, 7, 10, 0)

    attendance = record_recognition_attendance(db_session, recognition, check_in)
    record_recognition_attendance(db_session, recognition, check_out)
    db_session.refresh(attendance)

    assert attendance.shift_id == shifts[0].id
    assert attendance.status == AttendanceStatus.LATE
    assert attendance.late_minutes == 1
    assert attendance.working_minutes == 524


def test_employee_without_schedule_does_not_crash(db_session, employee):
    recognition = AIRecognitionResult(
        matched=True,
        employee_id=employee.id,
        confidence=0.98,
        liveness=True,
    )

    attendance = record_recognition_attendance(
        db_session,
        recognition,
        utc(2026, 9, 7, 1, 0),
    )

    assert attendance.shift_id is None
    assert attendance.status == AttendanceStatus.PRESENT


def test_approved_shift_registration_overrides_schedule(db_session, employee, shifts):
    from app.models.shift_registration import ShiftRegistration, ShiftRegistrationStatus
    target_day = date(2026, 9, 7)  # Monday

    # 1. Without registration, resolve_shift uses default schedule assignment (shifts[0])
    # employee has schedule assigned in another test fixture, but here employee has no schedule yet:
    assert resolve_shift(db_session, employee.id, target_day) is None

    # 2. Add a registration with PENDING status -> resolve_shift still returns None
    reg = ShiftRegistration(
        employee_id=employee.id,
        shift_id=shifts[1].id,  # Evening shift
        date=target_day,
        status=ShiftRegistrationStatus.PENDING,
        note="Đăng ký ca chiều",
    )
    db_session.add(reg)
    db_session.commit()
    assert resolve_shift(db_session, employee.id, target_day) is None

    # 3. Approve registration -> resolve_shift now returns evening shift (shifts[1])
    reg.status = ShiftRegistrationStatus.APPROVED
    db_session.commit()
    resolved = resolve_shift(db_session, employee.id, target_day)
    assert resolved is not None
    assert resolved.id == shifts[1].id

    # 4. Approved day off (shift_id = None) -> resolve_shift returns None
    reg.shift_id = None
    db_session.commit()
    assert resolve_shift(db_session, employee.id, target_day) is None


def test_shift_registration_api_workflow(db_session, employee, shifts):
    from fastapi.testclient import TestClient
    from app.api.dependencies.auth import get_current_user
    from app.core.database import get_db
    from app.main import app
    from app.models.user import User, UserRole

    client = TestClient(app)

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    admin_user = User(
        username="admin_schedule_tester",
        password_hash="pwd",
        role=UserRole.ADMIN,
    )
    db_session.add(admin_user)
    db_session.commit()

    # Authenticate as employee
    app.dependency_overrides[get_current_user] = lambda: employee.user

    # 1. Employee submits registration for 2 days
    resp = client.post(
        "/api/schedules/registrations",
        json={
            "items": [
                {"date": "2026-09-07", "shift_id": shifts[0].id, "note": "Ca sáng"},
                {"date": "2026-09-08", "shift_id": None, "note": "Bận việc"},
            ]
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 2
    assert data[0]["status"] == "PENDING"
    assert data[0]["shift_id"] == shifts[0].id
    assert data[1]["shift_id"] is None
    reg_id1 = data[0]["id"]
    reg_id2 = data[1]["id"]

    # 2. Employee checks their registrations
    resp_me = client.get("/api/schedules/registrations/me?start_date=2026-09-07&end_date=2026-09-08")
    assert resp_me.status_code == 200
    assert len(resp_me.json()) == 2

    # 3. Admin views all registrations
    app.dependency_overrides[get_current_user] = lambda: admin_user
    resp_admin = client.get("/api/schedules/registrations?status=PENDING")
    assert resp_admin.status_code == 200
    assert any(r["id"] == reg_id1 for r in resp_admin.json())

    # 4. Admin reviews (approves) registrations
    resp_review = client.post(
        "/api/schedules/registrations/review",
        json={
            "registration_ids": [reg_id1, reg_id2],
            "status": "APPROVED",
            "admin_note": "Đã duyệt lịch tuần",
        },
    )
    assert resp_review.status_code == 200
    reviewed = resp_review.json()
    assert all(r["status"] == "APPROVED" for r in reviewed)

    app.dependency_overrides.clear()


def test_get_department_coworkers_strictly_filters_by_department(db_session, shifts):
    from fastapi.testclient import TestClient
    from app.api.dependencies.auth import get_current_user
    from app.core.database import get_db
    from app.main import app
    from app.models.employee import Employee
    from app.models.shift_registration import ShiftRegistration, ShiftRegistrationStatus
    from app.models.user import User, UserRole

    client = TestClient(app)

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Create 3 employees:
    # 1. emp_kitchen1: Dept = Bếp (Kitchen) -> works shifts[0]
    # 2. emp_kitchen2: Dept = Phụ bếp (Kitchen Helper) -> works shifts[1]
    # 3. emp_barista: Dept = Pha chế (Barista) -> works shifts[0]
    u1 = User(username="cook_huy", password_hash="pwd", role=UserRole.EMPLOYEE)
    u2 = User(username="cook_linh", password_hash="pwd", role=UserRole.EMPLOYEE)
    u3 = User(username="barista_khoa", password_hash="pwd", role=UserRole.EMPLOYEE)
    db_session.add_all([u1, u2, u3])
    db_session.flush()

    e1 = Employee(user_id=u1.id, employee_code="CK1", full_name="Cook 1", email="c1@averis.vn", department="Bếp (Kitchen)")
    e2 = Employee(user_id=u2.id, employee_code="CK2", full_name="Cook 2", email="c2@averis.vn", department="Phụ bếp (Kitchen Helper)")
    e3 = Employee(user_id=u3.id, employee_code="BAR1", full_name="Barista 1", email="b1@averis.vn", department="Pha chế (Barista)")
    db_session.add_all([e1, e2, e3])
    db_session.flush()

    test_date = date(2026, 9, 7)

    # Approve shifts for all 3
    db_session.add_all([
        ShiftRegistration(employee_id=e1.id, shift_id=shifts[0].id, date=test_date, status=ShiftRegistrationStatus.APPROVED),
        ShiftRegistration(employee_id=e2.id, shift_id=shifts[1].id, date=test_date, status=ShiftRegistrationStatus.APPROVED),
        ShiftRegistration(employee_id=e3.id, shift_id=shifts[0].id, date=test_date, status=ShiftRegistrationStatus.APPROVED),
    ])
    db_session.commit()

    # Authenticate as Cook 1
    app.dependency_overrides[get_current_user] = lambda: u1

    resp = client.get(f"/api/schedules/coworkers?target_date={test_date.isoformat()}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["target_date"] == test_date.isoformat()
    assert data["department"] == "Bếp (Kitchen)"

    coworker_codes = [c["employee_code"] for c in data["coworkers"]]
    # Should see Cook 2 (CK2, same Kitchen department)
    assert "CK2" in coworker_codes
    # Should NOT see Barista 1 (BAR1, different department)
    assert "BAR1" not in coworker_codes
    # Should NOT see Self (CK1)
    assert "CK1" not in coworker_codes

    app.dependency_overrides.clear()