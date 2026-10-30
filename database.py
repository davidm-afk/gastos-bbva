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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        # Presupuesto mensual predeterminado si no existe
        conn.execute("""
            INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_budget', '15000')
        """)
    conn.close()

def insert_transaction(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO transactions (
            amount, currency, merchant, category, transaction_type,
            card_type, card_digits, raw_text, raw_title, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("amount", 0.0),
        data.get("currency", "MXN"),
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
    
    # Obtener el registro completo recién creado
    cursor.execute("SELECT * FROM transactions WHERE id = ?", (new_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

def get_transactions(limit: int = 100, category: Optional[str] = None, month: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM transactions WHERE 1=1"
    params = []
    
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

def update_transaction(tx_id: int, category: Optional[str] = None, merchant: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    with conn:
        cursor = conn.cursor()
        if category and merchant:
            cursor.execute("UPDATE transactions SET category = ?, merchant = ? WHERE id = ?", (category, merchant, tx_id))
        elif category:
            cursor.execute("UPDATE transactions SET category = ? WHERE id = ?", (category, tx_id))
        elif merchant:
            cursor.execute("UPDATE transactions SET merchant = ? WHERE id = ?", (merchant, tx_id))
            
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
    """Calcula KPIs, distribución por categoría y serie temporal."""
    if not month:
        month = datetime.now().strftime("%Y-%m")
        
    today = datetime.now().strftime("%Y-%m-%d")
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Total gastado en el mes
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE strftime('%Y-%m', timestamp) = ?", (month,))
    total_month = cursor.fetchone()['total']
    
    # 2. Total gastado hoy
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE strftime('%Y-%m-%d', timestamp) = ?", (today,))
    total_today = cursor.fetchone()['total']
    
    # 3. Número de transacciones del mes
    cursor.execute("SELECT COUNT(*) as count FROM transactions WHERE strftime('%Y-%m-%d', timestamp) = ?", (today,))
    count_today = cursor.fetchone()['count']
    
    cursor.execute("SELECT COUNT(*) as count FROM transactions WHERE strftime('%Y-%m', timestamp) = ?", (month,))
    count_month = cursor.fetchone()['count']
    
    # 4. Agrupado por Categoría en el mes
    cursor.execute("""
        SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM transactions
        WHERE strftime('%Y-%m', timestamp) = ?
        GROUP BY category
        ORDER BY total DESC
    """, (month,))
    by_category = [dict(r) for r in cursor.fetchall()]
    
    # 5. Agrupado por Día en el mes (para gráfico de tendencia)
    cursor.execute("""
        SELECT strftime('%Y-%m-%d', timestamp) as day, COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE strftime('%Y-%m', timestamp) = ?
        GROUP BY day
        ORDER BY day ASC
    """, (month,))
    by_day = [dict(r) for r in cursor.fetchall()]
    
    budget = get_budget()
    remaining = max(0.0, budget - total_month)
    percent_spent = round((total_month / budget * 100), 1) if budget > 0 else 0.0
    
    conn.close()
    
    return {
        "month": month,
        "total_month": round(total_month, 2),
        "total_today": round(total_today, 2),
        "count_today": count_today,
        "count_month": count_month,
        "budget": budget,
        "remaining_budget": round(remaining, 2),
        "percent_spent": percent_spent,
        "by_category": by_category,
        "by_day": by_day
    }

