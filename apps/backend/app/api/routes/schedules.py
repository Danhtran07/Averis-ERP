from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.models.employee import Employee
from app.models.schedule_assignment import ScheduleAssignment
from app.models.schedule_rule import ScheduleRule
from app.models.shift import Shift
from app.models.shift_registration import ShiftRegistration, ShiftRegistrationStatus
from app.models.user import User, UserRole
from app.models.work_schedule import WorkSchedule
from app.schemas.schedule import (
    CoworkerScheduleItem,
    DepartmentCoworkersResponse,
    DepartmentRosterDayShift,
    DepartmentRosterMember,
    DepartmentWeekRosterResponse,
    EmployeeScheduleResponse,
    EmployeeWeekScheduleResponse,
    ScheduleAssignmentBatchCreate,
    ScheduleAssignmentCreate,
    ScheduleAssignmentResponse,
    ScheduleCreate,
    ScheduleResponse,
    ScheduleUpdate,
    ShiftCreate,
    ShiftRegistrationBatchSubmit,
    ShiftRegistrationItem,
    ShiftRegistrationResponse,
    ShiftRegistrationReviewRequest,
    ShiftResponse,
    ShiftUpdate,
    WeekDayScheduleResponse,
    overnight_from_hours,
)
from app.services.shift_resolver import resolve_shift


router = APIRouter(tags=["Schedules"])


def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage schedules",
        )


def _shift_query(db: Session):
    return db.query(Shift)


def _schedule_query(db: Session):
    return db.query(WorkSchedule).options(
        joinedload(WorkSchedule.rules).joinedload(ScheduleRule.shift)
    )


def _get_shift_or_404(db: Session, shift_id: int) -> Shift:
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if shift is None:
        raise HTTPException(status_code=404, detail="Shift not found")
    return shift


def _get_schedule_or_404(db: Session, schedule_id: int) -> WorkSchedule:
    schedule = (
        _schedule_query(db)
        .filter(WorkSchedule.id == schedule_id)
        .first()
    )
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


def _ensure_unique_shift_code(db: Session, code: str, shift_id: int | None = None) -> None:
    query = db.query(Shift).filter(Shift.code == code)
    if shift_id is not None:
        query = query.filter(Shift.id != shift_id)
    if query.first() is not None:
        raise HTTPException(status_code=409, detail="Shift code already exists")


def _ensure_unique_schedule_code(
    db: Session,
    code: str,
    schedule_id: int | None = None,
) -> None:
    query = db.query(WorkSchedule).filter(WorkSchedule.code == code)
    if schedule_id is not None:
        query = query.filter(WorkSchedule.id != schedule_id)
    if query.first() is not None:
        raise HTTPException(status_code=409, detail="Schedule code already exists")


def _replace_rules(db: Session, schedule: WorkSchedule, rules) -> None:
    db.query(ScheduleRule).filter(ScheduleRule.schedule_id == schedule.id).delete()
    for rule in rules:
        if rule.shift_id is not None:
            _get_shift_or_404(db, rule.shift_id)
        db.add(
            ScheduleRule(
                schedule_id=schedule.id,
                day_of_week=rule.day_of_week,
                shift_id=rule.shift_id,
            )
        )


def _apply_shift_hours(shift: Shift, start_time, end_time) -> None:
    shift.start_time = start_time
    shift.end_time = end_time
    shift.is_overnight = overnight_from_hours(start_time, end_time)


@router.get("/api/shifts", response_model=list[ShiftResponse])
def get_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _shift_query(db)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Shift.is_active.is_(True))
    return query.order_by(Shift.start_time, Shift.name).all()


@router.post("/api/shifts", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    _ensure_unique_shift_code(db, payload.code)
    shift = Shift(
        name=payload.name,
        code=payload.code,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        break_start_time=payload.break_start_time,
        break_end_time=payload.break_end_time,
        late_tolerance_minutes=payload.late_tolerance_minutes,
        early_checkin_minutes=payload.early_checkin_minutes,
        checkin_close_minutes=payload.checkin_close_minutes,
        is_overnight=overnight_from_hours(payload.start_time, payload.end_time),
        is_active=payload.is_active,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.put("/api/shifts/{shift_id}", response_model=ShiftResponse)
def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    shift = _get_shift_or_404(db, shift_id)
    data = payload.model_dump(exclude_unset=True)
    if "code" in data:
        _ensure_unique_shift_code(db, data["code"], shift.id)
    start_time = data.pop("start_time", shift.start_time)
    end_time = data.pop("end_time", shift.end_time)
    for key, value in data.items():
        setattr(shift, key, value)
    _apply_shift_hours(shift, start_time, end_time)
    db.commit()
    db.refresh(shift)
    return shift


@router.delete("/api/shifts/{shift_id}", response_model=ShiftResponse)
def deactivate_shift(
    shift_id: int,
    permanent: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    shift = _get_shift_or_404(db, shift_id)
    if permanent:
        snapshot = ShiftResponse.model_validate(shift)
        db.delete(shift)
        db.commit()
        return snapshot
    shift.is_active = False
    db.commit()
    db.refresh(shift)
    return shift


@router.get("/api/schedules", response_model=list[ScheduleResponse])
def get_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    return _schedule_query(db).order_by(WorkSchedule.name).all()


@router.post(
    "/api/schedules",
    response_model=ScheduleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_schedule(
    payload: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    _ensure_unique_schedule_code(db, payload.code)
    schedule = WorkSchedule(
        name=payload.name.strip(),
        code=payload.code,
        description=payload.description,
        is_active=payload.is_active,
    )
    db.add(schedule)
    db.flush()
    _replace_rules(db, schedule, payload.rules)
    db.commit()
    return _get_schedule_or_404(db, schedule.id)


@router.put("/api/schedules/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(
    schedule_id: int,
    payload: ScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    schedule = _get_schedule_or_404(db, schedule_id)
    data = payload.model_dump(exclude_unset=True)
    rules = data.pop("rules", None)
    if "code" in data and data["code"] is not None:
        _ensure_unique_schedule_code(db, data["code"], schedule.id)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for key, value in data.items():
        setattr(schedule, key, value)
    if rules is not None:
        _replace_rules(db, schedule, payload.rules or [])
    db.commit()
    return _get_schedule_or_404(db, schedule.id)


@router.delete("/api/schedules/{schedule_id}", response_model=ScheduleResponse)
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    schedule = _get_schedule_or_404(db, schedule_id)
    snapshot = ScheduleResponse.model_validate(schedule)
    db.delete(schedule)
    db.commit()
    return snapshot


def _get_employee_schedule(
    db: Session,
    employee_id: int,
    target_date: date,
) -> EmployeeScheduleResponse:
    assignment = (
        db.query(ScheduleAssignment)
        .options(
            joinedload(ScheduleAssignment.schedule)
            .joinedload(WorkSchedule.rules)
            .joinedload(ScheduleRule.shift)
        )
        .filter(
            ScheduleAssignment.employee_id == employee_id,
            ScheduleAssignment.is_active.is_(True),
            ScheduleAssignment.effective_from <= target_date,
            (
                ScheduleAssignment.effective_to.is_(None)
                | (ScheduleAssignment.effective_to >= target_date)
            ),
        )
        .order_by(ScheduleAssignment.effective_from.desc())
        .first()
    )
    if assignment is None or not assignment.schedule.is_active:
        return EmployeeScheduleResponse(
            employee_id=employee_id,
            target_date=target_date,
        )

    return EmployeeScheduleResponse(
        employee_id=employee_id,
        target_date=target_date,
        assignment_id=assignment.id,
        schedule=assignment.schedule,
        shift=resolve_shift(db, employee_id, target_date),
    )


@router.get(
    "/api/employees/{employee_id}/schedule",
    response_model=EmployeeScheduleResponse,
)
def get_employee_schedule(
    employee_id: int,
    target_date: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if db.query(Employee).filter(Employee.id == employee_id).first() is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _get_employee_schedule(db, employee_id, target_date)


@router.get(
    "/api/schedules/me",
    response_model=EmployeeScheduleResponse,
)
def get_my_schedule(
    target_date: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return _get_employee_schedule(db, employee.id, target_date)


@router.get(
    "/api/schedules/me/week",
    response_model=EmployeeWeekScheduleResponse,
)
def get_my_week_schedule(
    start_date: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    days = []
    for offset in range(7):
        current = start_date + timedelta(days=offset)
        shift = resolve_shift(db, employee.id, current)
        days.append(
            WeekDayScheduleResponse(
                date=current,
                day_of_week=current.isoweekday(),
                shift=shift,
                is_off=shift is None,
            )
        )
    return EmployeeWeekScheduleResponse(
        employee_id=employee.id,
        start_date=start_date,
        days=days,
    )


def _departments_match(dept1: str | None, dept2: str | None) -> bool:
    if not dept1 or not dept2:
        return False
    d1 = dept1.strip().lower()
    d2 = dept2.strip().lower()
    if d1 == d2:
        return True

    categories = [
        ["bếp", "kitchen"],
        ["pha chế", "barista"],
        ["phục vụ", "server", "waiter"],
        ["thu ngân", "cashier"],
        ["quản lý", "manager", "shift manager"],
    ]
    for keywords in categories:
        m1 = any(kw in d1 for kw in keywords)
        m2 = any(kw in d2 for kw in keywords)
        if m1 and m2:
            return True

    return False


@router.get(
    "/api/schedules/coworkers",
    response_model=DepartmentCoworkersResponse,
)
def get_department_coworkers(
    target_date: date = Query(default_factory=date.today),
    employee_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.ADMIN and employee_id is not None:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
    else:
        employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    dept = employee.department
    if not dept:
        return DepartmentCoworkersResponse(
            target_date=target_date,
            department=None,
            coworkers=[],
        )

    query = db.query(Employee).filter(Employee.id != employee.id)
    if employee.store_id is not None:
        query = query.filter(Employee.store_id == employee.store_id)

    candidates = query.all()
    same_dept_candidates = [
        c for c in candidates if _departments_match(c.department, dept)
    ]

    working_coworkers: list[CoworkerScheduleItem] = []
    for candidate in same_dept_candidates:
        c_shift = resolve_shift(db, candidate.id, target_date)
        if c_shift is not None:
            working_coworkers.append(
                CoworkerScheduleItem(
                    id=candidate.id,
                    employee_code=candidate.employee_code,
                    full_name=candidate.full_name,
                    department=candidate.department,
                    shift=ShiftResponse.model_validate(c_shift),
                )
            )

    working_coworkers.sort(key=lambda x: (x.shift.start_time, x.full_name))

    return DepartmentCoworkersResponse(
        target_date=target_date,
        department=dept,
        coworkers=working_coworkers,
    )


@router.get(
    "/api/schedules/department-week-roster",
    response_model=DepartmentWeekRosterResponse,
)
def get_department_week_roster(
    week_start: date = Query(default_factory=date.today),
    employee_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    monday = week_start - timedelta(days=week_start.weekday())
    sunday = monday + timedelta(days=6)
    days = [monday + timedelta(days=i) for i in range(7)]

    if current_user.role == UserRole.ADMIN and employee_id is not None:
        target_employee = db.query(Employee).filter(Employee.id == employee_id).first()
    else:
        target_employee = (
            db.query(Employee).filter(Employee.user_id == current_user.id).first()
        )

    if target_employee is None:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    dept = target_employee.department
    if not dept:
        return DepartmentWeekRosterResponse(
            week_start=monday,
            week_end=sunday,
            department=None,
            days=days,
            members=[],
        )

    query = db.query(Employee)
    if target_employee.store_id is not None:
        query = query.filter(Employee.store_id == target_employee.store_id)

    candidates = query.all()
    dept_members = [
        c for c in candidates if _departments_match(c.department, dept)
    ]
    dept_members.sort(
        key=lambda m: (0 if m.id == target_employee.id else 1, m.full_name)
    )

    members_output: list[DepartmentRosterMember] = []
    for member in dept_members:
        is_self = member.id == target_employee.id
        member_schedule: list[DepartmentRosterDayShift] = []

        for d in days:
            reg = (
                db.query(ShiftRegistration)
                .options(joinedload(ShiftRegistration.shift))
                .filter(
                    ShiftRegistration.employee_id == member.id,
                    ShiftRegistration.date == d,
                )
                .first()
            )

            resolved = resolve_shift(db, member.id, d)
            if resolved is not None:
                member_schedule.append(
                    DepartmentRosterDayShift(
                        date=d,
                        shift=ShiftResponse.model_validate(resolved),
                        is_off=False,
                        registration_status=reg.status if reg else None,
                        note=reg.note if reg else None,
                    )
                )
            elif reg is not None and reg.shift_id is not None and reg.shift is not None:
                member_schedule.append(
                    DepartmentRosterDayShift(
                        date=d,
                        shift=ShiftResponse.model_validate(reg.shift),
                        is_off=False,
                        registration_status=reg.status,
                        note=reg.note,
                    )
                )
            else:
                member_schedule.append(
                    DepartmentRosterDayShift(
                        date=d,
                        shift=None,
                        is_off=True,
                        registration_status=reg.status if reg else None,
                        note=reg.note if reg else None,
                    )
                )

        salary_type_str = (
            member.salary_type.value
            if hasattr(member.salary_type, "value")
            else str(member.salary_type)
        )
        members_output.append(
            DepartmentRosterMember(
                id=member.id,
                employee_code=member.employee_code,
                full_name=member.full_name,
                department=member.department,
                salary_type=salary_type_str,
                is_self=is_self,
                schedule=member_schedule,
            )
        )

    return DepartmentWeekRosterResponse(
        week_start=monday,
        week_end=sunday,
        department=dept,
        days=days,
        members=members_output,
    )


def _assign_single_employee(
    db: Session,
    employee_id: int,
    schedule: WorkSchedule,
    effective_from: date,
    effective_to: date | None,
) -> ScheduleAssignment:
    previous = (
        db.query(ScheduleAssignment)
        .filter(
            ScheduleAssignment.employee_id == employee_id,
            ScheduleAssignment.is_active.is_(True),
            ScheduleAssignment.effective_from <= effective_from,
            (
                ScheduleAssignment.effective_to.is_(None)
                | (ScheduleAssignment.effective_to >= effective_from)
            ),
        )
        .all()
    )
    for assignment in previous:
        assignment.effective_to = effective_from - timedelta(days=1)
        if assignment.effective_to < assignment.effective_from:
            assignment.is_active = False

    created = ScheduleAssignment(
        employee_id=employee_id,
        schedule_id=schedule.id,
        effective_from=effective_from,
        effective_to=effective_to,
        is_active=True,
    )
    db.add(created)
    return created


@router.get(
    "/api/schedule-assignments",
    response_model=list[ScheduleAssignmentResponse],
)
def get_schedule_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    return (
        db.query(ScheduleAssignment)
        .options(
            joinedload(ScheduleAssignment.schedule)
            .joinedload(WorkSchedule.rules)
            .joinedload(ScheduleRule.shift)
        )
        .filter(ScheduleAssignment.is_active.is_(True))
        .order_by(ScheduleAssignment.effective_from.desc(), ScheduleAssignment.id.desc())
        .all()
    )


@router.post(
    "/api/schedule-assignments",
    response_model=ScheduleAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_schedule(
    payload: ScheduleAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    schedule = _get_schedule_or_404(db, payload.schedule_id)
    if not schedule.is_active:
        raise HTTPException(status_code=422, detail="Cannot assign an inactive schedule")

    created = _assign_single_employee(
        db=db,
        employee_id=payload.employee_id,
        schedule=schedule,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
    )
    db.commit()
    db.refresh(created)
    created.schedule = schedule
    return created


@router.post(
    "/api/schedule-assignments/batch",
    response_model=list[ScheduleAssignmentResponse],
    status_code=status.HTTP_201_CREATED,
)
def assign_schedule_batch(
    payload: ScheduleAssignmentBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    schedule = _get_schedule_or_404(db, payload.schedule_id)
    if not schedule.is_active:
        raise HTTPException(status_code=422, detail="Cannot assign an inactive schedule")

    unique_ids = list(dict.fromkeys(payload.employee_ids))
    employees = db.query(Employee).filter(Employee.id.in_(unique_ids)).all()
    found_ids = {emp.id for emp in employees}
    missing = [emp_id for emp_id in unique_ids if emp_id not in found_ids]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Employees not found: {missing}",
        )

    created_list: list[ScheduleAssignment] = []
    for emp_id in unique_ids:
        created = _assign_single_employee(
            db=db,
            employee_id=emp_id,
            schedule=schedule,
            effective_from=payload.effective_from,
            effective_to=payload.effective_to,
        )
        created_list.append(created)

    db.commit()
    for item in created_list:
        db.refresh(item)
        item.schedule = schedule
    return created_list


# ---------------------------------------------------------------------------
# Shift Registrations (Employee registers next week availability & Manager reviews)
# ---------------------------------------------------------------------------


@router.post(
    "/api/schedules/registrations",
    response_model=list[ShiftRegistrationResponse],
    status_code=status.HTTP_201_CREATED,
)
def submit_shift_registrations(
    payload: ShiftRegistrationBatchSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    shift_ids = {item.shift_id for item in payload.items if item.shift_id is not None}
    if shift_ids:
        found_shifts = (
            db.query(Shift)
            .filter(Shift.id.in_(shift_ids), Shift.is_active.is_(True))
            .all()
        )
        found_shift_ids = {s.id for s in found_shifts}
        missing_ids = shift_ids - found_shift_ids
        if missing_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid or inactive shift IDs: {list(missing_ids)}",
            )

    results: list[ShiftRegistration] = []
    for item in payload.items:
        existing = (
            db.query(ShiftRegistration)
            .filter(
                ShiftRegistration.employee_id == employee.id,
                ShiftRegistration.date == item.date,
            )
            .first()
        )
        if existing:
            existing.shift_id = item.shift_id
            existing.note = item.note
            existing.status = ShiftRegistrationStatus.PENDING
            existing.admin_note = None
            results.append(existing)
        else:
            created = ShiftRegistration(
                employee_id=employee.id,
                shift_id=item.shift_id,
                date=item.date,
                status=ShiftRegistrationStatus.PENDING,
                note=item.note,
            )
            db.add(created)
            results.append(created)

    db.commit()
    for reg in results:
        db.refresh(reg)
    return results


@router.get(
    "/api/schedules/registrations/me",
    response_model=list[ShiftRegistrationResponse],
)
def get_my_shift_registrations(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    query = (
        db.query(ShiftRegistration)
        .options(
            joinedload(ShiftRegistration.shift),
            joinedload(ShiftRegistration.employee),
        )
        .filter(ShiftRegistration.employee_id == employee.id)
    )
    if start_date is not None:
        query = query.filter(ShiftRegistration.date >= start_date)
    if end_date is not None:
        query = query.filter(ShiftRegistration.date <= end_date)

    return query.order_by(ShiftRegistration.date.asc()).all()


@router.get(
    "/api/schedules/registrations",
    response_model=list[ShiftRegistrationResponse],
)
def get_shift_registrations(
    start_date: date | None = None,
    end_date: date | None = None,
    employee_id: int | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    query = (
        db.query(ShiftRegistration)
        .options(
            joinedload(ShiftRegistration.shift),
            joinedload(ShiftRegistration.employee),
        )
    )
    if employee_id is not None:
        query = query.filter(ShiftRegistration.employee_id == employee_id)
    if start_date is not None:
        query = query.filter(ShiftRegistration.date >= start_date)
    if end_date is not None:
        query = query.filter(ShiftRegistration.date <= end_date)
    if status_filter is not None:
        query = query.filter(ShiftRegistration.status == status_filter)

    return query.order_by(ShiftRegistration.date.asc(), ShiftRegistration.employee_id.asc()).all()


@router.post(
    "/api/schedules/registrations/review",
    response_model=list[ShiftRegistrationResponse],
)
def review_shift_registrations(
    payload: ShiftRegistrationReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    registrations = (
        db.query(ShiftRegistration)
        .options(
            joinedload(ShiftRegistration.shift),
            joinedload(ShiftRegistration.employee),
        )
        .filter(ShiftRegistration.id.in_(payload.registration_ids))
        .all()
    )
    if not registrations:
        raise HTTPException(status_code=404, detail="No matching registrations found")

    new_status = ShiftRegistrationStatus(payload.status)
    for reg in registrations:
        reg.status = new_status
        if payload.admin_note is not None:
            reg.admin_note = payload.admin_note

    db.commit()
    for reg in registrations:
        db.refresh(reg)
    return registrations


@router.delete(
    "/api/schedules/registrations/{registration_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_shift_registration(
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reg = db.query(ShiftRegistration).filter(ShiftRegistration.id == registration_id).first()
    if reg is None:
        raise HTTPException(status_code=404, detail="Shift registration not found")

    if current_user.role != UserRole.ADMIN:
        employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
        if employee is None or reg.employee_id != employee.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if reg.status != ShiftRegistrationStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete an already reviewed registration",
            )

    db.delete(reg)
    db.commit()
    return None

