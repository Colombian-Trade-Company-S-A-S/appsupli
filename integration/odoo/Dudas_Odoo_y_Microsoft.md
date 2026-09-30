# Odoo y Microsoft — dudas y pendientes

**Referencia:** INT-TEC-ET-002 (integración Odoo ↔ appsupli) y su documento de respuestas
**Fecha:** 30 de septiembre de 2026
**Para:** Laura (Tech), IT / Microsoft, People / RRHH

---

## En resumen

- **El desarrollo no está detenido.** Supli Performance quedó con los ajustes que cerró People
  (semáforo, metas cualitativas, cortes trimestral/semestral/anual, congelamiento del mes y carga
  de resultados con evidencia) y Supli Challenge quedó construido completo. También se puede
  cargar los objetivos de una persona con un archivo de Excel.
- **Lo que falta no es desarrollo, son decisiones.** Son dos frentes: las reglas con las que se
  leen los datos maestros de empleados (Odoo) y el ingreso con cuenta corporativa (Microsoft).

---

## 1. Odoo

### 1.1 Una contradicción que apareció con la respuesta de la foto

Se definió que la foto se sincroniza desde Odoo y que, cuando alguien la cambie en appsupli, la
nueva imagen **se actualice también en Odoo**. Eso obliga a que la cuenta de integración pueda
**escribir** sobre los empleados, y el documento técnico pedía que fuera de **solo lectura**.

Se propone una salida intermedia: permiso de escritura únicamente sobre el campo de la foto, y de
solo lectura para todo lo demás. Falta confirmarlo.

### 1.2 Calidad de datos

Estas cifras son de la revisión del **21 de septiembre**, sobre 68 empleados activos:

| Hallazgo | Por qué importa |
|---|---|
| **24 sin cédula (35%)** | Es la llave que une a cada persona en Odoo con su usuario en appsupli |
| **18 correos en `@coltrade.com.co`** | El dominio de ingreso quedó definido como `@supli.tech`: con el correo en otro dominio, esas personas no van a poder entrar |
| **Un departamento mal escrito** | «SALES / Head of sales» quedó duplicado dentro del nombre y ensucia la estructura de áreas |

Se necesita saber si ya se corrigieron. La revisión se repite sobre los datos definitivos.

### 1.3 Preguntas abiertas

1. **País y Perú.** La fase incluye Colombia y Perú, pero la respuesta dice que toda la información
   está en la base de Colombia, donde la única compañía es Colombian Trade Company. No hay forma de
   saber quién es de Perú. **¿De qué campo de Odoo sale el país?** Sin eso no se puede segmentar ni
   filtrar por país, que es algo que Challenge ya usa.
2. **Cambio de área a mitad de mes.** Quedó como «requiere confirmación»: los objetivos ya
   asignados, ¿conservan el área que tenían o pasan a la nueva?
3. **Asesores y promotores.** Está confirmado que se sincronizan y aparecen en appsupli. Falta
   confirmar si en esta fase **se les cargan objetivos** en Performance.
4. **Frecuencia de actualización.** Quedó en diaria de madrugada, con webhooks como evolución.
   ¿Se van a habilitar las reglas de automatización en Odoo, o se trabaja con la actualización
   diaria por ahora?
5. **Foto de perfil.** ¿Qué tamaño y formato se acepta, y quién autoriza la escritura en Odoo?

---

## 2. Microsoft

### 2.1 Lo que bloquea el inicio

El 21 de septiembre quedó comprometido el registro de appsupli en Microsoft Entra ID «esta
semana». Esa semana ya pasó y todavía no se ha recibido nada. Para poder siquiera probar el
ingreso hacen falta cuatro datos:

1. El identificador del directorio de la organización (tenant).
2. El identificador de la aplicación (cliente).
3. La dirección de retorno autorizada, que Tech entrega.
4. Si el ingreso se hace con una clave de aplicación o sin ella.

Mientras no lleguen, el ingreso con Microsoft no se puede construir ni probar.

### 2.2 Decisiones pendientes

1. **Qué pasa con el ingreso actual.** Hoy se entra con correo y contraseña. Cuando Microsoft
   quede activo, ¿ese ingreso se apaga por completo, o se conserva como respaldo para los
   administradores?
2. **Cobertura del dominio.** ¿Todo el personal administrativo y comercial tiene ya cuenta en
   `@supli.tech`? Quien no la tenga, no entra.
3. **Verificación en dos pasos y acceso condicional.** Qué nivel se va a exigir. Depende del tipo
   de licencia de Microsoft que tenga la compañía.
4. **Asesores y promotores de punto de venta.** No tienen cuenta corporativa. Quedó fuera del
   alcance de esta etapa, pero sigue sin definirse si van a tener ingreso y con qué método.
   *Nota:* ya están contemplados en la plataforma — existen, su jefe les registra objetivos y
   entran en los rankings—, simplemente no pueden iniciar sesión.
5. **Controles contra el préstamo de cuentas.** Sesión única, recordar el dispositivo y auditoría
   de accesos quedaron para la segunda fase. Falta confirmar el alcance y si alguno depende de la
   configuración de Microsoft.
6. **Administración del registro.** Quién queda a cargo del registro de la aplicación y de renovar
   su clave cuando venza.

---

## 3. Lo que avanza sin esperar a nadie

- Supli Performance con todos los ajustes cerrados por People.
- Supli Challenge completo: retos, rúbrica, evaluadores, ganador y ranking.
- Carga de objetivos por Excel, con plantilla descargable.
- Personal sin correo corporativo ya contemplado en la plataforma.

Mientras Odoo no esté conectado, la estructura organizacional —jefe inmediato, área, dirección,
cargo— se mantiene a mano desde Administración. Cuando la integración entre, esos campos se llenan
solos y nada de lo construido se rehace.

---

## 4. Qué se necesita, de quién

| Qué | De quién | Urgencia |
|---|---|---|
| Los cuatro datos del registro en Microsoft Entra | IT / Laura | Bloquea el ingreso corporativo |
| Confirmar cédulas y correos corregidos en Odoo | People / RRHH | Bloquea la carga inicial |
| De qué campo sale el país (Colombia / Perú) | People | Bloquea la segmentación por país |
| Permiso de escritura de la foto en Odoo | Laura / Tech | Se puede postergar |
| Las decisiones del punto 2.2 | Laura · IT · People | Se pueden cerrar en paralelo |

Se agradecen sus respuestas para poder cerrar estos dos frentes.
