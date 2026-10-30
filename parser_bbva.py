import re
from datetime import datetime
from typing import Optional, Dict, Any

# Categorías de Gastos
EXPENSE_KEYWORDS = {
    "Alimentos & Restaurantes": [
        "uber eats", "didi food", "rappi", "starbucks", "mcdonald", "burger king",
        "kfc", "domino", "little caesars", "pizza", "tacos", "taqueria", "restaurante",
        "cafe", "cafeteria", "sushi", "subway", "vips", "toks", "sanborns", "chilis",
        "mariscos", "bar", "cerveceria", "bistro", "panaderia", "pasteleria"
    ],
    "Supermercado & Abarrotes": [
        "walmart", "oxxo", "seven eleven", "7 eleven", "7-eleven", "chedraui",
        "soriana", "costco", "sam's", "sams", "bodega aurrera", "superama",
        "la comer", "city market", "heb", "merza", "abarrotes", "tienda", "tiendita", "circle k"
    ],
    "Transporte & Movilidad": [
        "uber", "didi", "cabify", "gasolinera", "pemex", "bp", "shell", "total",
        "g500", "mobil", "estacionamiento", "parquimetro", "metro", "metrobús",
        "autobus", "peaje", "caseta", "tag", "pase", "aeromexico", "volaris", "vivaaerobus"
    ],
    "Salud & Farmacias": [
        "farmacia", "guadalajara", "benavides", "similares", "san pablo", "del ahorro",
        "medico", "doctor", "hospital", "clinica", "laboratorio", "chopo", "dental",
        "optica", "salud"
    ],
    "Servicios & Suscripciones": [
        "netflix", "spotify", "amazon prime", "prime video", "disney", "apple", "google",
        "youtube", "cfe", "telcel", "att", "at&t", "movistar", "izzi", "totalplay",
        "infinitum", "telmex", "agua", "gas"
    ],
    "Entretenimiento & Ocio": [
        "cinepolis", "cinemex", "steam", "playstation", "xbox", "nintendo",
        "recórcholis", "bowling", "teatro", "concierto", "ticketmaster"
    ],
    "Compras & Ropa": [
        "amazon", "mercado libre", "mercadolibre", "mercadopago", "liverpool", "palacio de hierro",
        "zara", "h&m", "shein", "coppel", "suburbia", "sears", "pull&bear", "bershka",
        "nike", "adidas", "innovasport"
    ],
    "Financiero & Retiros": [
        "retiro", "cajero", "atm", "comision", "interes"
    ]
}

def guess_category(flow_type: str, merchant: str, raw_text: str) -> str:
    """Clasifica en categorías según sea Ingreso o Egreso."""
    text_to_search = f"{merchant} {raw_text}".lower()
    
    if flow_type == "ingreso":
        if any(w in text_to_search for w in ["nomina", "nómina", "sueldo", "salario"]):
            return "Nómina & Sueldo"
        if any(w in text_to_search for w in ["practicaja", "efectivo", "sucursal"]):
            return "Depósito en Efectivo"
        if any(w in text_to_search for w in ["reembolso", "devolucion", "devolución"]):
            return "Reembolsos & Devoluciones"
        return "Transferencia Recibida"

    # Egresos
    for category, keywords in EXPENSE_KEYWORDS.items():
        for kw in keywords:
            if kw in text_to_search:
                return category
                
    if "transferencia" in text_to_search or "traspaso" in text_to_search:
        return "Transferencia Enviada"

    return "Otros Gastos"


def parse_bbva_notification(text: str, title: str = "") -> Optional[Dict[str, Any]]:
    """
    Parsea una notificación o SMS de BBVA para extraer:
    monto, comercio/origen/destino, tipo de flujo (egreso vs ingreso), tarjeta y fecha.
    """
    if not text:
        return None

    cleaned_text = text.replace("\n", " ").strip()
    lower_text = cleaned_text.lower()
    
    # 1. Extraer Monto
    amount = 0.0
    amount_match = re.search(r'\$\s*([\d,]+(?:\.\d{1,2})?)', cleaned_text)
    if amount_match:
        amount_str = amount_match.group(1).replace(",", "")
        try:
            amount = float(amount_str)
        except ValueError:
            amount = 0.0
    else:
        alt_match = re.search(r'por\s+([\d,]+(?:\.\d{1,2})?)', cleaned_text, re.IGNORECASE)
        if alt_match:
            try:
                amount = float(alt_match.group(1).replace(",", ""))
            except ValueError:
                pass

    if amount <= 0:
        return None

    # 2. Determinar Flujo: 'ingreso' vs 'egreso'
    # Palabras clave explícitas de Egreso / Gasto
    expense_triggers = [
        "transferencia enviada", "has enviado una transferencia", "enviaste", 
        "traspaso a terceros", "traspaso enviado", "compra", "cargo", "retiro", 
        "pago en", "pago de servicio"
    ]
    
    # Palabras clave explícitas de Ingreso / Entrada
    income_triggers = [
        "transferencia recibida", "recibiste una transferencia", "recibiste un traspaso",
        "recibiste un depósito", "recibiste un deposito", "depósito recibido",
        "deposito recibido", "abono", "depósito", "deposito", "nómina", "nomina",
        "te transfirió", "te transfirio", "te depositaron", "reembolso", "devolución", "devolucion"
    ]

    is_expense = any(exp in lower_text for exp in expense_triggers)
    is_income = any(inc in lower_text for inc in income_triggers) and not is_expense
    
    flow_type = "ingreso" if is_income else "egreso"

    # 3. Tipo específico de transacción
    trans_type = "Compra"
    if is_income:
        if "nomina" in lower_text or "nómina" in lower_text:
            trans_type = "Nómina"
        elif "depósito" in lower_text or "deposito" in lower_text:
            trans_type = "Depósito"
        else:
            trans_type = "Transferencia Recibida"
    else:
        if "retiro" in lower_text:
            trans_type = "Retiro"
        elif "transferencia" in lower_text or "traspaso" in lower_text or "enviaste" in lower_text:
            trans_type = "Transferencia Enviada"
        elif "cargo" in lower_text:
            trans_type = "Cargo"
        elif "pago" in lower_text:
            trans_type = "Pago"

    # 4. Tipo de Tarjeta / Cuenta y terminación
    card_type = "Débito"
    if "crédito" in lower_text or "credito" in lower_text:
        card_type = "Crédito"
    elif "cuenta" in lower_text:
        card_type = "Cuenta Débito"
    
    card_digits = ""
    digits_match = re.search(r'(?:terminaci[oó]n|tarjeta|cuenta|t\.\s*d[eé]bito|t\.\s*cr[eé]dito)\s*[:#*]?\s*(\d{4})', cleaned_text, re.IGNORECASE)
    if digits_match:
        card_digits = digits_match.group(1)

    # 5. Extraer Comercio / Origen / Destino
    merchant = "Operación Bancaria"
    
    if is_income:
        if "nomina" in lower_text or "nómina" in lower_text:
            merchant = "Pago de Nómina"
        elif "practicaja" in lower_text:
            merchant = "Depósito en Practicaja"
        else:
            # Extraer quién envió el dinero: "de [NOMBRE]"
            sender_match = re.search(r'\bde\s+([^,\.]+?)(?:\s+el\s+\d|\s+con\s+cuenta|\s+en\s+tu|\s*\.|$)', cleaned_text, re.IGNORECASE)
            if sender_match:
                sender = sender_match.group(1).strip()
                sender = re.sub(r'^(una|un)\s+', '', sender, flags=re.IGNORECASE)
                merchant = f"De: {sender.upper()}"
            else:
                merchant = "Depósito / Abono Recibido"
    else:
        # Extraer destino de transferencia enviada: "a [NOMBRE]"
        if trans_type == "Transferencia Enviada":
            dest_match = re.search(r'\ba\s+([^,\.]+?)(?:\s+con\s+cuenta|\s+el\s+\d|\s+por\s+|\s*\.|$)', cleaned_text, re.IGNORECASE)
            if dest_match:
                dest = dest_match.group(1).strip()
                dest = re.sub(r'^(la|el)\s+', '', dest, flags=re.IGNORECASE)
                merchant = f"Para: {dest.upper()}"
            else:
                merchant = "Transferencia a Terceros"
        elif trans_type == "Retiro":
            merchant = "Cajero Automático BBVA"
        else:
            # Compra estándar: "en [COMERCIO] con t." o "en [COMERCIO] el "
            merchant_match = re.search(
                r'\ben\s+([^,\.]+?)(?:\s+con\s+t|\s+el\s+\d|\s+terminaci[oó]n|\s*\.|$)',
                cleaned_text,
                re.IGNORECASE
            )
            if merchant_match:
                cand = merchant_match.group(1).strip()
                cand = re.sub(r'^(un|una|el|la)\s+', '', cand, flags=re.IGNORECASE)
                if len(cand) > 1 and len(cand) < 60:
                    merchant = cand.upper()
            else:
                merchant = "Comercio no identificado"

    # 6. Categoría
    category = guess_category(flow_type, merchant, cleaned_text)

    # 7. Timestamp
    now = datetime.now()
    
    return {
        "amount": round(amount, 2),
        "currency": "MXN",
        "flow_type": flow_type,  # 'ingreso' o 'egreso'
        "merchant": merchant,
        "transaction_type": trans_type,
        "card_type": card_type,
        "card_digits": card_digits,
        "category": category,
        "raw_text": cleaned_text,
        "raw_title": title,
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S")
    }
