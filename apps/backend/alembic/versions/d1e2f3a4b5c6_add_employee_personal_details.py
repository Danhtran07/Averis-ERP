"""add employee personal details

Revision ID: d1e2f3a4b5c6
Revises: c2d3e4f5a6b7
Create Date: 2026-11-17 02:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("cccd", sa.String(length=20), nullable=True))
    op.add_column("employees", sa.Column("phone", sa.String(length=20), nullable=True))
    op.add_column("employees", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("employees", sa.Column("gender", sa.String(length=20), nullable=True))
    op.add_column("employees", sa.Column("permanent_address", sa.String(length=255), nullable=True))
    op.add_column("employees", sa.Column("current_address", sa.String(length=255), nullable=True))
    op.add_column("employees", sa.Column("emergency_contact", sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "emergency_contact")
    op.drop_column("employees", "current_address")
    op.drop_column("employees", "permanent_address")
    op.drop_column("employees", "gender")
    op.drop_column("employees", "date_of_birth")
    op.drop_column("employees", "phone")
    op.drop_column("employees", "cccd")
