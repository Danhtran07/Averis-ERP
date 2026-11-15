from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user
from app.core.database import engine, get_db
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.employee import Employee
from app.models.schedule_assignment import ScheduleAssignment
from app.models.schedule_rule import ScheduleRule
from app.models.shift import Shift
from app.models.store_profile import StoreProfile
from app.models.user import User, UserRole
from app.models.user_profile import UserProfile
from app.models.work_schedule import WorkSchedule
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    StoreProfileResponse,
    StoreProfileUpdate,
    StoreRegisterRequest,
    StoreRegisterResponse,
    UserResponse,
)


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)


_STORE_SCHEMA_READY = True


def _ensure_store_profile_columns(db: Session) -> None:
    global _STORE_SCHEMA_READY
    if _STORE_SCHEMA_READY:
        return
    StoreProfile.__table__.create(bind=engine, checkfirst=True)
    _STORE_SCHEMA_READY = True


def get_or_create_store_profile(
    db: Session,
    current_user: User | None = None,
) -> StoreProfile:
    _ensure_store_profile_columns(db)

    if current_user is not None:
        if current_user.store_id is not None:
            by_store = (
                db.query(StoreProfile)
                .filter(StoreProfile.id == current_user.store_id)
                .first()
            )
            if by_store is not None:
                return by_store
        by_owner = (
            db.query(StoreProfile)
            .filter(StoreProfile.owner_user_id == current_user.id)
            .order_by(StoreProfile.id.desc())
            .first()
        )
        if by_owner is not None:
            if current_user.store_id != by_owner.id:
                current_user.store_id = by_owner.id
                if current_user.employee is not None:
                    current_user.employee.store_id = by_owner.id
                db.commit()
            return by_owner

    profile = db.query(StoreProfile).order_by(StoreProfile.id.asc()).first()
    if profile is None:
        admin_user = (
            db.query(User)
            .filter(User.role == UserRole.ADMIN)
            .order_by(User.id.asc())
            .first()
        )
        profile = StoreProfile(
            store_name="Averis F&B",
            company_name="Công ty TNHH Dịch vụ Ẩm thực Averis",
            tax_code="0402189650",
            business_type="Quán Cà phê / Trà sữa",
            employee_scale="1 - 15 nhân sự",
            branch_count=1,
            service_plan="PROFESSIONAL",
            business_email="contact@averisfnb.vn",
            representative_name="Trần Danh",
            representative_title="Chủ cơ sở / Giám đốc",
            address="Đà Nẵng, Việt Nam",
            phone="0905000111",
            default_hourly_rate=35000,
            late_tolerance_minutes=15,
            min_face_similarity=0.65,
            owner_user_id=admin_user.id if admin_user else None,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _ensure_fnb_shifts_and_schedule(
    db: Session,
    late_tolerance: int = 15,
) -> WorkSchedule:
    standard_shifts = [
        (
            "MORNING-OPEN",
            "Ca Sáng - Mở quầy",
            time(6, 30),
            time(14, 30),
            False,
            "Ca mở quầy, chuẩn bị nguyên liệu và phục vụ sáng - trưa",
        ),
        (
            "EVENING-CLOSE",
            "Ca Chiều - Đóng quầy",
            time(14, 30),
            time(22, 30),
            False,
            "Ca phục vụ chiều tối, kết toán và vệ sinh đóng quầy",
        ),
        (
            "PEAK-PARTTIME",
            "Ca Gãy Part-time",
            time(11, 0),
            time(15, 0),
            False,
            "Ca tăng cường khung giờ cao điểm trưa (Part-time 4h)",
        ),
        (
            "NIGHT-SHIFT",
            "Ca Đêm",
            time(18, 0),
            time(23, 0),
            False,
            "Ca phục vụ tối và dọn dẹp đóng cửa",
        ),
    ]

    shift_by_code: dict[str, Shift] = {}
    for code, name, st, et, overnight, desc in standard_shifts:
        s = db.query(Shift).filter(Shift.code == code).first()
        if s is None:
            s = Shift(
                code=code,
                name=name,
                start_time=st,
                end_time=et,
                is_overnight=overnight,
                late_tolerance_minutes=late_tolerance,
                early_checkin_minutes=30,
                checkin_close_minutes=90,
                description=desc,
                is_active=True,
            )
            db.add(s)
            db.flush()
        else:
            s.is_active = True
            s.late_tolerance_minutes = late_tolerance
        shift_by_code[code] = s

    sched = db.query(WorkSchedule).filter(WorkSchedule.code == "FNB-7DAY").first()
    if sched is None:
        sched = WorkSchedule(
            code="FNB-7DAY",
            name="Lịch vận hành F&B 7 ngày",
            description="T2–T5 Ca Sáng mở quầy, T6–CN Ca Chiều đóng quầy",
            is_active=True,
        )
        db.add(sched)
        db.flush()

    morning_id = shift_by_code["MORNING-OPEN"].id
    evening_id = shift_by_code["EVENING-CLOSE"].id
    for dow in range(1, 8):
        rule = (
            db.query(ScheduleRule)
            .filter(
                ScheduleRule.schedule_id == sched.id,
                ScheduleRule.day_of_week == dow,
            )
            .first()
        )
        target_shift_id = morning_id if dow <= 4 else evening_id
        if rule is None:
            db.add(
                ScheduleRule(
                    schedule_id=sched.id,
                    day_of_week=dow,
                    shift_id=target_shift_id,
                )
            )
        elif rule.shift_id is None:
            rule.shift_id = target_shift_id

    return sched


def _resolve_optional_user(request: Request, db: Session) -> User | None:
    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if sub is None:
            return None
        return db.query(User).filter(User.id == int(sub)).first()
    except Exception:
        return None


@router.get(
    "/store-profile",
    response_model=StoreProfileResponse,
)
def get_store_profile(
    request: Request,
    db: Session = Depends(get_db),
):
    current_user = _resolve_optional_user(request, db)
    return get_or_create_store_profile(db, current_user)


@router.put(
    "/store-profile",
    response_model=StoreProfileResponse,
)
def update_store_profile(
    payload: StoreProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên cửa hàng mới có quyền cập nhật cấu hình dịch vụ",
        )

    profile = get_or_create_store_profile(db, current_user)
    profile.store_name = payload.store_name.strip()
    profile.company_name = payload.company_name.strip() if payload.company_name else None
    profile.tax_code = payload.tax_code.strip() if payload.tax_code else None
    profile.business_type = payload.business_type.strip()
    profile.employee_scale = payload.employee_scale.strip()
    profile.branch_count = payload.branch_count
    profile.service_plan = payload.service_plan.strip()
    profile.business_email = payload.business_email.strip() if payload.business_email else None
    profile.representative_name = (
        payload.representative_name.strip() if payload.representative_name else None
    )
    profile.representative_title = (
        payload.representative_title.strip() if payload.representative_title else None
    )
    profile.address = payload.address.strip() if payload.address else None
    profile.phone = payload.phone.strip() if payload.phone else None
    profile.default_hourly_rate = payload.default_hourly_rate
    profile.late_tolerance_minutes = payload.late_tolerance_minutes
    profile.min_face_similarity = round(float(payload.min_face_similarity), 2)

    for shift in db.query(Shift).filter(Shift.is_active.is_(True)).all():
        shift.late_tolerance_minutes = payload.late_tolerance_minutes

    db.commit()
    db.refresh(profile)
    return profile


@router.post(
    "/register-store",
    response_model=StoreRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_store(
    payload: StoreRegisterRequest,
    db: Session = Depends(get_db),
):
    _ensure_store_profile_columns(db)
    username = payload.admin_username.strip()
    email = payload.admin_email.strip().lower()
    full_name = payload.admin_full_name.strip()

    if db.query(User).filter(User.username == username).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tên đăng nhập '{username}' đã được sử dụng",
        )

    if db.query(Employee).filter(Employee.email == email).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Email '{email}' đã được đăng ký trong hệ thống",
        )

    user = User(
        username=username,
        password_hash=hash_password(payload.admin_password.strip()),
        role=UserRole.ADMIN,
    )
    db.add(user)
    db.flush()

    db.add(
        UserProfile(
            user_id=user.id,
            full_name=full_name,
            email=email,
            phone=payload.phone.strip() if payload.phone else None,
            bio=f"Chủ cửa hàng / Quản lý {payload.store_name.strip()}",
        )
    )

    emp_code = f"MGR-{user.id:03d}"
    while db.query(Employee).filter(Employee.employee_code == emp_code).first() is not None:
        emp_code = f"MGR-{user.id:03d}A"

    employee = Employee(
        user_id=user.id,
        employee_code=emp_code,
        full_name=full_name,
        email=email,
        department="Quản lý ca (Shift Manager)",
    )
    db.add(employee)
    db.flush()

    sched = _ensure_fnb_shifts_and_schedule(
        db,
        late_tolerance=payload.late_tolerance_minutes,
    )
    db.add(
        ScheduleAssignment(
            employee_id=employee.id,
            schedule_id=sched.id,
            effective_from=date.today(),
            is_active=True,
        )
    )

    profile = StoreProfile(
        store_name=payload.store_name.strip(),
        company_name=payload.company_name.strip(),
        tax_code=payload.tax_code.strip(),
        business_type=payload.business_type.strip(),
        employee_scale=payload.employee_scale.strip(),
        branch_count=payload.branch_count,
        service_plan=payload.service_plan.strip(),
        business_email=(payload.business_email or email).strip(),
        representative_name=full_name,
        representative_title=(payload.representative_title or "Chủ cơ sở / Giám đốc").strip(),
        address=payload.address.strip(),
        phone=payload.phone.strip(),
        default_hourly_rate=payload.default_hourly_rate,
        late_tolerance_minutes=payload.late_tolerance_minutes,
        min_face_similarity=round(float(payload.min_face_similarity), 2),
        owner_user_id=user.id,
    )
    db.add(profile)
    db.flush()

    user.store_id = profile.id
    employee.store_id = profile.id

    db.commit()
    db.refresh(profile)

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role.value,
        }
    )

    return StoreRegisterResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            username=user.username,
            role=user.role.value,
        ),
        store=StoreProfileResponse.model_validate(profile),
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
    del current_user
    return {
        "message": "Logout successful",
    }


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không chính xác",
        )

    new_password = payload.new_password.strip()
    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải có ít nhất 6 ký tự",
        )

    if payload.current_password == new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới không được trùng với mật khẩu hiện tại",
        )

    current_user.password_hash = hash_password(new_password)
    db.commit()
    return {"message": "Đổi mật khẩu thành công"}
