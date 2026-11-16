from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.schedule_assignment import ScheduleAssignment
from app.models.schedule_rule import ScheduleRule
from app.models.shift import Shift
from app.models.shift_registration import ShiftRegistration, ShiftRegistrationStatus


def resolve_shift(
    db: Session,
    employee_id: int,
    target_date: date,
) -> Shift | None:
    # 1. Check if there is an approved shift registration for this employee and date
    registration = (
        db.query(ShiftRegistration)
        .filter(
            ShiftRegistration.employee_id == employee_id,
            ShiftRegistration.date == target_date,
            ShiftRegistration.status == ShiftRegistrationStatus.APPROVED,
        )
        .first()
    )
    if registration is not None:
        if registration.shift_id is None:
            # Explicitly approved as day off
            return None
        if registration.shift is not None and registration.shift.is_active:
            return registration.shift
        return None

    # 2. Fall back to recurring schedule assignment and rules
    assignment = (
        db.query(ScheduleAssignment)
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
        return None

    rule = (
        db.query(ScheduleRule)
        .filter(
            ScheduleRule.schedule_id == assignment.schedule_id,
            ScheduleRule.day_of_week == target_date.isoweekday(),
        )
        .first()
    )
    if rule is None or rule.shift is None or not rule.shift.is_active:
        return None

    return rule.shift


def resolve_shift_for_punch(
    db: Session,
    employee_id: int,
    local_now: datetime,
) -> tuple[Shift | None, date, bool]:
    """Return the shift that is actually in progress, including overnight spillover."""
    local_date = local_now.date()
    local_time = local_now.timetz().replace(tzinfo=None) if local_now.tzinfo else local_now.time()
    previous_date = local_date - timedelta(days=1)
    previous = resolve_shift(db, employee_id, previous_date)
    if previous is not None and previous.is_overnight and local_time < previous.end_time:
        return previous, previous_date, True
    return resolve_shift(db, employee_id, local_date), local_date, False
