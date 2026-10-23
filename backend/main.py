
import os
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import (
    create_engine, String, Float, Integer, JSON, DateTime, select, delete
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


PROJECT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{PROJECT_DIR / 'nuestras_cuentas.db'}",
)

engine_options = {}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_by: Mapped[str] = mapped_column(String(20), nullable=False)
    date: Mapped[str] = mapped_column(String(10), nullable=False)


class MonthArchive(Base):
    __tablename__ = "month_archives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    closed_date: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    expenses: Mapped[list] = mapped_column(JSON, nullable=False)


Base.metadata.create_all(bind=engine)


class ExpenseInput(BaseModel):
    description: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0, le=1_000_000_000)
    paid_by: str
    date: date


class MonthCloseInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)


app = FastAPI(title="Nuestras cuentas API")


def validate_input(data: ExpenseInput):
    if data.paid_by not in ("you", "partner"):
        raise HTTPException(
            status_code=422,
            detail="El pagador debe ser you o partner",
        )
    return data


def expense_to_dict(expense: Expense):
    return {
        "id": expense.id,
        "description": expense.description,
        "amount": expense.amount,
        "paid_by": expense.paid_by,
        "date": expense.date,
    }


def archive_to_dict(archive: MonthArchive):
    return {
        "id": archive.id,
        "name": archive.name,
        "closed_date": archive.closed_date,
        "created_at": archive.created_at.isoformat(),
        "expenses": archive.expenses,
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Nuestras cuentas"}


@app.get("/api/expenses")
def get_expenses():
    with SessionLocal() as db:
        expenses = db.scalars(
            select(Expense).order_by(Expense.date.desc(), Expense.id.desc())
        ).all()
        return [expense_to_dict(e) for e in expenses]


@app.post("/api/expenses", status_code=201)
def create_expense(data: ExpenseInput):
    validate_input(data)

    with SessionLocal() as db:
        expense = Expense(
            description=data.description.strip(),
            amount=round(data.amount, 2),
            paid_by=data.paid_by,
            date=data.date.isoformat(),
        )
        db.add(expense)
        db.commit()
        db.refresh(expense)
        return expense_to_dict(expense)


@app.put("/api/expenses/{expense_id}")
def update_expense(expense_id: int, data: ExpenseInput):
    validate_input(data)

    with SessionLocal() as db:
        expense = db.get(Expense, expense_id)
        if expense is None:
            raise HTTPException(status_code=404, detail="Gasto no encontrado")

        expense.description = data.description.strip()
        expense.amount = round(data.amount, 2)
        expense.paid_by = data.paid_by
        expense.date = data.date.isoformat()

        db.commit()
        db.refresh(expense)
        return expense_to_dict(expense)


@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: int):
    with SessionLocal() as db:
        expense = db.get(Expense, expense_id)
        if expense is None:
            raise HTTPException(status_code=404, detail="Gasto no encontrado")

        db.delete(expense)
        db.commit()
        return Response(status_code=204)


@app.get("/api/months")
def get_month_archives():
    with SessionLocal() as db:
        archives = db.scalars(
            select(MonthArchive).order_by(MonthArchive.id.desc())
        ).all()
        return [archive_to_dict(a) for a in archives]


@app.delete("/api/months/{archive_id}", status_code=204)
def delete_month_archive(archive_id: int):
    with SessionLocal() as db:
        archive = db.get(MonthArchive, archive_id)
        if archive is None:
            raise HTTPException(status_code=404, detail="Mes guardado no encontrado")

        db.delete(archive)
        db.commit()
        return Response(status_code=204)


@app.post("/api/months/close", status_code=201)
def close_month(data: MonthCloseInput):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="El nombre es obligatorio")

    with SessionLocal() as db:
        try:
            current_expenses = db.scalars(
                select(Expense).order_by(Expense.id)
            ).all()

            snapshot = [expense_to_dict(e) for e in current_expenses]

            archive = MonthArchive(
                name=name,
                closed_date=date.today().isoformat(),
                expenses=snapshot,
            )
            db.add(archive)

            # Los gastos activos pasan al historial del mes cerrado.
            for expense in current_expenses:
                db.delete(expense)

            db.commit()
            db.refresh(archive)
            return archive_to_dict(archive)
        except Exception:
            db.rollback()
            raise


app.mount(
    "/",
    StaticFiles(directory=str(FRONTEND_DIR), html=True),
    name="frontend",
)
