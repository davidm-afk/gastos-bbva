import re
from datetime import datetime
from typing import Optional, Dict, Any

# Categorías y palabras clave para auto-clasificación de comercios
CATEGORY_KEYWORDS = {
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
        "cinepolis", "cinemex", "steam", "playstation", "xbox", "nintendo", "spotify",
        "recórcholis", "bowling", "teatro", "concierto", "ticketmaster"
    ],
    "Compras & Ropa": [
        "amazon", "mercado libre", "mercadolibre", "mercadopago", "liverpool", "palacio de hierro",
        "zara", "h&m", "shein", "coppel", "suburbia", "sears", "pull&bear", "bershka",
        "nike", "adidas", "innovasport"
    ],
    "Financiero & Retiros": [
        "retiro", "cajero", "atm", "comision", "interes", "traspaso"
    ]
}

def guess_category(merchant: str, raw_text: str) -> str:
    """Clasifica el gasto basándose en palabras clave del comercio o texto."""
    text_to_search = f"{merchant} {raw_text}".lower()
    
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text_to_search:
                return category
                
    return "Otros Gastos"


def parse_bbva_notification(text: str, title: str = "") -> Optional[Dict[str, Any]]:
    """
    Parsea una notificación o SMS de BBVA México / BBVA para extraer:
    monto, comercio, tipo de operación, tarjeta y fecha.
    
    Ejemplos soportados:
    - "Compra por $158.50 en FARMACIAS GUADALAJARA con t. débito terminación 4321 el 28/10/2026 14:30:15."
    - "Compra por $1,250.00 en WALMART con t. débito terminación 1234"
    - "Cargo por $45.00 en OXXO con tu tarjeta de debito"
    - "Retiro de efectivo por $1,000.00 en CAJERO..."
    - "Transferencia enviada por $250.00 a MARIO PEREZ..."
    - "Pago por $540.00 en CFE..."
    """
    if not text:
        return None

    cleaned_text = text.replace("\n", " ").strip()
    
    # 1. Extraer Monto
    # Busca patrones como: $150, $150.00, $1,250.50, 150.00 MXN
    amount = 0.0
    amount_match = re.search(r'\$\s*([\d,]+(?:\.\d{1,2})?)', cleaned_text)
    if amount_match:
        amount_str = amount_match.group(1).replace(",", "")
        try:
            amount = float(amount_str)
        except ValueError:
            amount = 0.0
    else:
        # Intento sin símbolo de peso pero con "por X.XX"
        alt_match = re.search(r'por\s+([\d,]+(?:\.\d{1,2})?)', cleaned_text, re.IGNORECASE)
        if alt_match:
            try:
                amount = float(alt_match.group(1).replace(",", ""))
            except ValueError:
                pass

    if amount <= 0:
        return None  # Si no hay monto válido, no es una notificación de gasto

    # 2. Tipo de Transacción
    trans_type = "Compra"
    lower_text = cleaned_text.lower()
    if "retiro" in lower_text:
        trans_type = "Retiro"
    elif "transferencia" in lower_text:
        trans_type = "Transferencia"
    elif "cargo" in lower_text:
        trans_type = "Cargo"
    elif "pago" in lower_text:
        trans_type = "Pago"

    # 3. Tipo de Tarjeta y terminación
    card_type = "Débito"
    if "crédito" in lower_text or "credito" in lower_text:
        card_type = "Crédito"
    
    card_digits = ""
    digits_match = re.search(r'(?:terminaci[oó]n|tarjeta|t\.\s*d[eé]bito|t\.\s*cr[eé]dito)\s*[:#*]?\s*(\d{4})', cleaned_text, re.IGNORECASE)
    if digits_match:
        card_digits = digits_match.group(1)

    # 4. Extraer Comercio o Beneficiario
    merchant = "Comercio no identificado"
    
    # Patrón común: "en [COMERCIO] con t." o "en [COMERCIO] el " o "en [COMERCIO]."
    merchant_match = re.search(
        r'\ben\s+([^,\.]+?)(?:\s+con\s+t|\s+el\s+\d|\s+terminaci[oó]n|\s*\.|$)',
        cleaned_text,
        re.IGNORECASE
    )
    if merchant_match:
        cand = merchant_match.group(1).strip()
        # Limpiar palabras residuales comunes
        cand = re.sub(r'^(un|una|el|la)\s+', '', cand, flags=re.IGNORECASE)
        if len(cand) > 1 and len(cand) < 60:
            merchant = cand.upper()
    elif trans_type == "Transferencia":
        dest_match = re.search(r'\ba\s+([^,\.]+?)(?:\s+el|\s+por|\s*\.|$)', cleaned_text, re.IGNORECASE)
        if dest_match:
            merchant = f"Transferencia a {dest_match.group(1).strip().upper()}"
        else:
            merchant = "Transferencia enviada"
    elif trans_type == "Retiro":
        merchant = "Cajero Automático BBVA"

    # 5. Categoría sugerida
    category = guess_category(merchant, cleaned_text)

    # 6. Timestamp
    now = datetime.now()
    
    return {
        "amount": round(amount, 2),
        "currency": "MXN",
        "merchant": merchant,
        "transaction_type": trans_type,
        "card_type": card_type,
        "card_digits": card_digits,
        "category": category,
        "raw_text": cleaned_text,
        "raw_title": title,
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S")
    }

