# 📱 Guía de Vinculación: Samsung Galaxy A56 con BBVA LiveTracker

Esta guía te explica paso a paso cómo conectar tu celular Samsung Galaxy A56 con tu computadora para que **cada compra que realices con tu tarjeta de débito BBVA aparezca automáticamente en el Dashboard de tu PC en tiempo real**, estés donde estés (incluso con datos móviles 4G/5G en la calle).

---

## 🚀 PASO 1: Iniciar el Sistema en tu PC

En tu computadora, ve a la carpeta del proyecto y ejecuta:

* **Para usar en casa (red Wi-Fi):** Haz doble clic en `iniciar_servidor.bat`. Se abrirá tu navegador en `http://localhost:8000`.
* **Para recibir gastos desde la calle (cualquier lugar 4G/5G):** Haz doble clic en `iniciar_todo.bat`.
  * Esto abrirá el servidor y también un **Túnel Seguro de Cloudflare**.
  * En la ventana del túnel verás una URL pública similar a:
    ```text
    https://random-words-here.trycloudflare.com
    ```
  * Tu endpoint para el celular será:
    ```text
    https://random-words-here.trycloudflare.com/api/webhook/bbva
    ```

---

## 📲 PASO 2: Instalar y Configurar MacroDroid en tu Samsung A56

**MacroDroid** es la aplicación líder para Android para automatización de notificaciones. Es ligera, gratuita y 100% confiable en Samsung One UI.

1. Abre **Google Play Store** en tu Samsung A56 y busca: **MacroDroid - Automatización**.
2. Instálala y ábrela. Dale los permisos iniciales (Acceso a notificaciones).
3. **Importante en Samsung:** Ve a `Ajustes del Teléfono -> Aplicaciones -> MacroDroid -> Batería` y selecciona **«Sin restricciones»** (para que Samsung nunca la suspenda en segundo plano).

---

## ⚙️ PASO 3: Crear la Macro en tu Celular (Toma 2 minutos)

1. En MacroDroid, pulsa en el botón grande azul **«Añadir Macro»**.
2. Dale un nombre en la parte superior: `BBVA Gastos a PC`.

### A. DISPARADOR (¿Cuándo se ejecuta?):
* Toca el botón rojo **(+)** de Disparadores.
* Selecciona: **Eventos del dispositivo** $\rightarrow$ **Notificación** $\rightarrow$ **Notificación recibida**.
* Selecciona **«Seleccionar Aplicación(es)»** y pulsa Aceptar.
* En la lista de apps, busca y marca:
  * **BBVA México** (app oficial de tu banco).
  * *(Opcional)* Si recibes alertas por SMS bancarios en lugar de la app, marca también **Mensajes**.
* En el campo "Contenido del texto" deja la opción **Cualquiera** seleccionada y pulsa Aceptar.

### B. ACCIÓN (¿Qué debe hacer?):
* Toca el botón azul **(+)** de Acciones.
* Selecciona: **Conectividad** $\rightarrow$ **Solicitud HTTP (HTTP Request)**.
* Configura los campos exactamente así:
  * **Método:** `POST`
  * **URL:** Tu URL del túnel o IP local:
    ```text
    https://tu-url-de-cloudflare.trycloudflare.com/api/webhook/bbva
    ```
  * **Tipo de Contenido (Content Type):** `application/json`
  * **Cuerpo de la solicitud (Body):**
    ```json
    {"text": "[not_text]", "title": "[not_title]"}
    ```
    *(Nota: en MacroDroid puedes escribir `[not_text]` o tocar los tres puntos `...` para seleccionar la variable de notificación "Texto de la notificación")*.
* Pulsa la palomita verde de Guardar.

### C. GUARDAR Y ACTIVAR:
* Toca el icono de Guardar (abajo a la derecha).
* ¡Listo! La macro ya está activa y vigilando en segundo plano.

---

## 🧪 PASO 4: Prueba Inmediata

1. En tu PC, abre el Dashboard en el navegador (`http://localhost:8000`).
2. Haz clic en el botón superior **«Simulador»** para probar que los gráficos, sonidos y métricas funcionen al 100%.
3. En tu celular, puedes usar el botón de probar acción en MacroDroid o esperar tu próxima compra con la tarjeta de débito BBVA.
4. En cuanto BBVA emita la notificación de compra, escucharás un sutil **«ding»** en tu computadora y verás la fila deslizarse en la tabla con el comercio, monto y categoría clasificada automáticamente.

---

## 🔒 Privacidad y Seguridad
* Tus datos financieros se guardan **únicamente en tu computadora** en una base de datos local SQLite (`finanzas.db`).
* No se envían a ningún servidor de terceros, nubes privadas ni intermediarios.
* El túnel de Cloudflare viaja encriptado de punto a punto (HTTPS TLS 1.3) directo a tu PC.

