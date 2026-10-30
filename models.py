from pydantic import BaseModel, Field
from typing import Optional

class WebhookPayload(BaseModel):
    text: str = Field(..., description="Texto de la notificación o SMS de BBVA")
    title: Optional[str] = Field("", description="Título de la notificación (ej. BBVA México)")
    app: Optional[str] = Field("", description="Nombre de la app emisora")
    package: Optional[str] = Field("", description="Nombre del paquete (ej. com.bbva.bbvacontigo)")
    timestamp: Optional[str] = Field(None, description="Fecha/hora del dispositivo")

class ManualTransaction(BaseModel):
    amount: float = Field(..., gt=0, description="Monto del gasto")
    merchant: str = Field(..., description="Nombre del comercio")
    category: str = Field(..., description="Categoría del gasto")
    transaction_type: Optional[str] = Field("Compra", description="Compra, Retiro, etc.")
    card_type: Optional[str] = Field("Débito", description="Débito o Crédito")
    card_digits: Optional[str] = Field("", description="Últimos dígitos de la tarjeta")
    timestamp: Optional[str] = Field(None, description="Fecha de la transacción")

class UpdateTransaction(BaseModel):
    category: Optional[str] = None
    merchant: Optional[str] = None

class UpdateBudget(BaseModel):
    budget: float = Field(..., gt=0, description="Nuevo presupuesto mensual en MXN")

