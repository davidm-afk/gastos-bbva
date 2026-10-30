import os
import json
import asyncio
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from database import (
    init_db, insert_transaction, get_transactions,
    delete_transaction, update_transaction, get_analytics,
    get_budget, set_budget
)
from models import WebhookPayload, ManualTransaction, UpdateTransaction, UpdateBudget
from parser_bbva import parse_bbva_notification

app = FastAPI(title="Control de Gastos BBVA - Tiempo Real")

# Permitir CORS para acceso desde cualquier origen (móvil, túneles, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gestor de conexiones WebSocket para actualización en vivo
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# Inicializar Base de Datos al arrancar
@app.on_event("startup")
def startup_event():
    init_db()

# WebSocket para el Dashboard en la PC
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Enviar estado inicial inmediato al conectar
        analytics = get_analytics()
        await websocket.send_text(json.dumps({
            "event": "INITIAL_STATE",
            "analytics": analytics
        }))
        while True:
            # Mantener conexión viva
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# -------------------------------------------------------------
# WEBHOOK PARA CAPTURA DESDE EL CELULAR (SAMSUNG A56)
# -------------------------------------------------------------
@app.post("/api/webhook/bbva")
async def webhook_bbva(request: Request):
    """
    Punto de entrada para el celular (MacroDroid o App).
    Acepta tanto JSON estructurado como Form Data o texto plano.
    """
    body_text = ""
    title = "BBVA"
    timestamp = None

    content_type = request.headers.get("content-type", "")
    
    try:
        if "application/json" in content_type:
            data = await request.json()
            body_text = data.get("text") or data.get("message") or data.get("notification_text") or ""
            title = data.get("title") or data.get("notification_title") or "BBVA"
            timestamp = data.get("timestamp")
        else:
            # Intento por form-data o texto plano
            raw_bytes = await request.body()
            body_text = raw_bytes.decode("utf-8", errors="ignore")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo payload: {str(e)}")

    if not body_text:
        return JSONResponse(status_code=400, content={"status": "error", "message": "No se recibió texto de notificación"})

    # Parsear notificación con el motor BBVA
    parsed = parse_bbva_notification(body_text, title)
    
    if not parsed:
        # Notificación informativa o publicidad (ej. 'Contrata un seguro')
        return {
            "status": "ignored",
            "message": "Notificación recibida pero no contiene una compra o débito bancario",
            "raw_text": body_text
        }

    if timestamp:
        parsed["timestamp"] = timestamp

    # Guardar en base de datos SQLite
    saved_tx = insert_transaction(parsed)

    # Notificar inmediatamente al Dashboard en la PC vía WebSocket
    analytics = get_analytics()
    await manager.broadcast({
        "event": "NEW_TRANSACTION",
        "transaction": saved_tx,
        "analytics": analytics
    })

    return {
        "status": "success",
        "message": "Gasto registrado y transmitido a la PC en tiempo real",
        "transaction": saved_tx
    }

# -------------------------------------------------------------
# SIMULADOR (Para probar desde la PC con 1 click)
# -------------------------------------------------------------
@app.post("/api/simulate")
async def simulate_transaction(payload: dict):
    preset = payload.get("preset", "oxxo")
    custom_text = payload.get("text")

    samples = {
        "oxxo": "BBVA México: Compra por $48.50 en OXXO TERMINAL 42 con t. débito terminación 8921 el 30/10/2026.",
        "uber": "BBVA México: Compra por $142.30 en UBER RIDES con t. débito terminación 8921.",
        "walmart": "BBVA México: Compra por $890.00 en WALMART SUPERCENTER con t. débito terminación 8921.",
        "farmacia": "BBVA México: Compra por $215.00 en FARMACIAS GUADALAJARA con t. débito terminación 8921.",
        "starbucks": "BBVA México: Compra por $115.00 en STARBUCKS PLAZA con t. débito terminación 8921.",
        "gasolina": "BBVA México: Compra por $500.00 en GASOLINERA PEMEX con t. débito terminación 8921."
    }

    text_to_process = custom_text if custom_text else samples.get(preset, samples["oxxo"])
    
    parsed = parse_bbva_notification(text_to_process, "BBVA México")
    if not parsed:
        raise HTTPException(status_code=400, detail="El texto simulado no pudo ser parseado como gasto")

    saved_tx = insert_transaction(parsed)
    analytics = get_analytics()
    
    await manager.broadcast({
        "event": "NEW_TRANSACTION",
        "transaction": saved_tx,
        "analytics": analytics
    })

    return {"status": "success", "transaction": saved_tx}

# -------------------------------------------------------------
# APIS PARA EL DASHBOARD (CRUD & METRICAS)
# -------------------------------------------------------------
@app.get("/api/transactions")
def api_get_transactions(limit: int = 100, category: Optional[str] = None, month: Optional[str] = None):
    return get_transactions(limit=limit, category=category, month=month)

@app.post("/api/transactions")
async def api_add_transaction(tx: ManualTransaction):
    data = tx.dict()
    if not data.get("timestamp"):
        data["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    saved = insert_transaction(data)
    
    analytics = get_analytics()
    await manager.broadcast({
        "event": "NEW_TRANSACTION",
        "transaction": saved,
        "analytics": analytics
    })
    return saved

@app.put("/api/transactions/{tx_id}")
async def api_update_transaction(tx_id: int, update_data: UpdateTransaction):
    updated = update_transaction(tx_id, category=update_data.category, merchant=update_data.merchant)
    if not updated:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    
    analytics = get_analytics()
    await manager.broadcast({
        "event": "UPDATE_TRANSACTION",
        "transaction": updated,
        "analytics": analytics
    })
    return updated

@app.delete("/api/transactions/{tx_id}")
async def api_delete_transaction(tx_id: int):
    success = delete_transaction(tx_id)
    if not success:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    
    analytics = get_analytics()
    await manager.broadcast({
        "event": "DELETE_TRANSACTION",
        "tx_id": tx_id,
        "analytics": analytics
    })
    return {"status": "deleted"}

@app.get("/api/analytics")
def api_get_analytics(month: Optional[str] = None):
    return get_analytics(month=month)

@app.post("/api/budget")
async def api_set_budget(budget_data: UpdateBudget):
    set_budget(budget_data.budget)
    analytics = get_analytics()
    await manager.broadcast({
        "event": "BUDGET_UPDATED",
        "analytics": analytics
    })
    return {"status": "ok", "budget": budget_data.budget}

# Montar archivos estáticos para el frontend
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

