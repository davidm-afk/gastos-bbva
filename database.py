import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "finanzas.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    conn = get_connection()
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'MXN',
                flow_type TEXT DEFAULT 'egreso',
                merchant TEXT NOT NULL,
                category TEXT NOT NULL,
                transaction_type TEXT DEFAULT 'Compra',
                card_type TEXT DEFAULT 'Débito',
                card_digits TEXT,
                raw_text TEXT,
                raw_title TEXT,
                timestamp TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Asegurar columna flow_type si la tabla ya existía
        try:
            conn.execute("ALTER TABLE transactions ADD COLUMN flow_type TEXT DEFAULT 'egreso'")
        except sqlite3.OperationalError:
            pass  # Ya existe

        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        conn.execute("""
            INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_budget', '15000')
        """)
    conn.close()

def insert_transaction(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO transactions (
            amount, currency, flow_type, merchant, category, transaction_type,
            card_type, card_digits, raw_text, raw_title, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("amount", 0.0),
        data.get("currency", "MXN"),
        data.get("flow_type", "egreso"),
        data.get("merchant", "Desconocido"),
        data.get("category", "Otros Gastos"),
        data.get("transaction_type", "Compra"),
        data.get("card_type", "Débito"),
        data.get("card_digits", ""),
        data.get("raw_text", ""),
        data.get("raw_title", ""),
        data.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    ))
    new_id = cursor.lastrowid
    conn.commit()
    
    cursor.execute("SELECT * FROM transactions WHERE id = ?", (new_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

def get_transactions(limit: int = 150, category: Optional[str] = None, flow_type: Optional[str] = None, month: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM transactions WHERE 1=1"
    params = []
    
    if flow_type and flow_type != "all":
        query += " AND flow_type = ?"
        params.append(flow_type)

    if category and category != "all":
        query += " AND category = ?"
        params.append(category)
        
    if month:
        query += " AND strftime('%Y-%m', timestamp) = ?"
        params.append(month)
        
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_transaction(tx_id: int) -> bool:
    conn = get_connection()
    with conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
        deleted = cursor.rowcount > 0
    conn.close()
    return deleted

def update_transaction(tx_id: int, category: Optional[str] = None, merchant: Optional[str] = None, flow_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    with conn:
        cursor = conn.cursor()
        updates = []
        params = []
        if category:
            updates.append("category = ?")
            params.append(category)
        if merchant:
            updates.append("merchant = ?")
            params.append(merchant)
        if flow_type:
            updates.append("flow_type = ?")
            params.append(flow_type)
        
        if updates:
            params.append(tx_id)
            cursor.execute(f"UPDATE transactions SET {', '.join(updates)} WHERE id = ?", params)
            
        cursor.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,))
        row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_budget() -> float:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = 'monthly_budget'")
    row = cursor.fetchone()
    conn.close()
    try:
        return float(row['value']) if row else 15000.0
    except (ValueError, TypeError):
        return 15000.0

def set_budget(new_budget: float):
    conn = get_connection()
    with conn:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('monthly_budget', ?)", (str(new_budget),))
    conn.close()

def get_analytics(month: Optional[str] = None) -> Dict[str, Any]:
    """Calcula KPIs de ingresos, gastos, balance neto y gráficos."""
    if not month:
        month = datetime.now().strftime("%Y-%m")
        
    today = datetime.now().strftime("%Y-%m-%d")
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Gastos (Egresos) en el mes
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count 
        FROM transactions 
        WHERE strftime('%Y-%m', timestamp) = ? AND (flow_type = 'egreso' OR flow_type IS NULL)
    """, (month,))
    r_exp = cursor.fetchone()
    total_expenses = r_exp['total']
    count_expenses = r_exp['count']

    # 2. Ingresos en el mes
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count 
        FROM transactions 
        WHERE strftime('%Y-%m', timestamp) = ? AND flow_type = 'ingreso'
    """, (month,))
    r_inc = cursor.fetchone()
    total_income = r_inc['total']
    count_income = r_inc['count']

    # 3. Gastos de hoy
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM transactions 
        WHERE strftime('%Y-%m-%d', timestamp) = ? AND (flow_type = 'egreso' OR flow_type IS NULL)
    """, (today,))
    total_today_expenses = cursor.fetchone()['total']

    # 4. Ingresos de hoy
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM transactions 
        WHERE strftime('%Y-%m-%d', timestamp) = ? AND flow_type = 'ingreso'
    """, (today,))
    total_today_income = cursor.fetchone()['total']
    
    # 5. Agrupado por Categoría de Gastos
    cursor.execute("""
        SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM transactions
        WHERE strftime('%Y-%m', timestamp) = ? AND (flow_type = 'egreso' OR flow_type IS NULL)
        GROUP BY category
        ORDER BY total DESC
    """, (month,))
    by_category_expenses = [dict(r) for r in cursor.fetchall()]

    # 6. Agrupado por Día (Gastos)
    cursor.execute("""
        SELECT strftime('%Y-%m-%d', timestamp) as day, COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE strftime('%Y-%m', timestamp) = ? AND (flow_type = 'egreso' OR flow_type IS NULL)
        GROUP BY day
        ORDER BY day ASC
    """, (month,))
    by_day_expenses = [dict(r) for r in cursor.fetchall()]
    
    budget = get_budget()
    remaining = max(0.0, budget - total_expenses)
    percent_spent = round((total_expenses / budget * 100), 1) if budget > 0 else 0.0
    net_balance = round(total_income - total_expenses, 2)
    
    conn.close()
    
    return {
        "month": month,
        "total_month": round(total_expenses, 2),  # Gastos totales del mes
        "total_income_month": round(total_income, 2), # Ingresos totales del mes
        "net_balance": net_balance, # Saldo neto (Ingresos - Gastos)
        "total_today": round(total_today_expenses, 2),
        "total_income_today": round(total_today_income, 2),
        "count_expenses": count_expenses,
        "count_income": count_income,
        "count_month": count_expenses + count_income,
        "budget": budget,
        "remaining_budget": round(remaining, 2),
        "percent_spent": percent_spent,
        "by_category": by_category_expenses,
        "by_day": by_day_expenses
    }
