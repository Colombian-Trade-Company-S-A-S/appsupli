# Contexto para continuar: Odoo y Microsoft

**Qué es este documento:** el traspaso completo del trabajo de integración, para retomarlo en otra
sesión sin volver a reconstruir el contexto. Cubre qué está construido, qué decisiones ya se
cerraron, qué falta hacer y qué falta que entreguen otros.

**Fecha:** 2 de octubre de 2026
**Proyecto:** `supli` — backend Django + DRF, frontend React + Vite, desplegado en Render
**Documentos de origen:** `integration/odoo/` e `integration/performance/`

---

## 1. Dónde está parado el proyecto

### 1.1 Lo que ya está construido y probado

| Módulo | Estado |
|---|---|
| **BI Trade Marketing** | En producción. Cuatro canales (Claro, Homecenter, Falabella, Tmk) y el plan Partners |
| **Supli Performance · Objetivos y KPIs** | Construido, con todos los ajustes que cerró People |
| **Supli Performance · Valoración** | Existía antes; se reubicó dentro del contenedor |
| **Supli Challenge** | Construido completo |
| **Administración** | Usuarios, roles, permisos y aplicaciones |

**377 pruebas del backend en verde.** Se corren con `env/Scripts/python.exe -m pytest` desde
`backend/`, sobre SQLite en memoria, así que no tocan ninguna base real.

### 1.2 Lo que se construyó en la última ronda

**Performance**, los ajustes de la sección A del documento de definiciones:

- Semáforo con los cortes de People: verde ≥ 100, naranja 85–99.9, rojo < 85 (`cumplimiento.py`).
- Tipo de medición **cualitativa**: 2 de 2 criterios = 100%, 1 de 2 = 50%, 0 = 0%.
- Cortes de tiempo mes, **Q trimestral**, semestre y año (`periodos.py`).
- **Congelamiento por calendario**: los objetivos se editan hasta el último día del mes anterior;
  al empezar el mes se bloquean solos. People puede reabrir con motivo registrado.
- **Carga de resultados** con evidencia por enlace y validación del jefe.
- **Carga de objetivos por Excel**, con plantilla descargable (`plantilla.py`).
- Pantallas nuevas: «Semáforo del equipo» y «Top Performance».

**Challenge**, la sección B completa: retos con sus 6 categorías, ciclo de vida
Borrador → Abierto → Cerrado → Finalizado, reglas congeladas al abrir, rúbrica de 5 criterios de
1 a 10 que promedian a 0–100, tres evaluadores (dos de Supli y un jurado sorteado), descalificación
con 0, un solo ganador con desempate y bonus de +20, y solicitud de revisión solo con niveles de 7
o menos.

**Transversal, pensando en Odoo:**

- `User.email` admite nulo: los asesores y promotores de punto de venta existen en la plataforma
  aunque no tengan correo corporativo. No pueden iniciar sesión, pero su jefe les registra
  objetivos y entran en los rankings.
- `User.pais`: creado y vacío, a la espera de Odoo.
- Siguen existiendo como texto libre `direccion`, `organizacion`, `regional` y `punto_venta`. Hoy
  se llenan a mano desde Administración; cuando entre Odoo, se llenan solos.

### 1.3 Mapa del código

```
backend/apps/
  accounts/      usuarios, roles, permisos, aplicaciones (el menú sale de aquí)
  core/          TimeStampedModel, paginación y excel.py (plantillas e importación)
  performance/   objetivos y KPIs
    models.py        Periodo, Objetivo, Resultado, Evidencia
    cumplimiento.py  motor de cálculo y semáforo
    periodos.py      congelamiento (A9) y cortes de tiempo (A8)
    plantilla.py     columnas del Excel de objetivos
  challenge/     retos
    models.py        Reto, CriterioReto, Participacion, Valoracion, JuradoReto
    puntajes.py      rúbrica, promedio de evaluadores y desempate
    reglas.py        recálculo, sorteo del jurado y revisión
  bi_trade/      BI Trade Marketing
  valoracion/    valoración cualitativa anual

frontend/src/modules/{performance,challenge,bi-trade,admin,valoracion}/
```

**Endpoints de Performance** (`/api/performance/`): `opciones`, `resumen`, `mis-objetivos`,
`acumulado`, `objetivos/plantilla`, `objetivos/importar`, `periodos/<mes>/resumen`,
`periodos/<mes>/activar`, `periodos/<mes>/edicion`, `objetivos/<id>/resultado`,
`objetivos/<id>/validar`, más el CRUD de `objetivos`.

**Endpoints de Challenge** (`/api/challenge/`): `opciones`, `mis-retos`, `top`,
`retos/<id>/{publicar,cerrar,finalizar,reabrir,participaciones,resultado}`,
`participaciones/<id>/{valorar,revision}`, `revisiones/<id>/atender`, más el CRUD de `retos`.

### 1.4 Advertencia sobre el entorno local

El `.env` de `backend/` **apunta al Postgres de producción en Render**. Cualquier `manage.py` que
se corra en local escribe en producción. Las pruebas no, porque usan SQLite en memoria.

Ya se corrieron en producción `seed_performance_app` y `seed_challenge_app`, que son los que
registran los módulos en el menú. Sin ellos, `migrate` crea las tablas pero nada aparece.

---

## 2. Odoo — lo que falta construir

### 2.1 Decisiones ya cerradas

| Tema | Definición |
|---|---|
| **Fuente de verdad** | Odoo manda en nombre, cargo, área, dirección, organización, regional, país y jefe inmediato |
| **País** | Esta fase va **solo con Colombia**. El campo país se resuelve cuando entre Perú |
| **Asesores y promotores** | Se sincronizan y quedan visibles. Sus objetivos los crea y carga su jefe directo |
| **Frecuencia** | Diaria, de madrugada. Los webhooks quedan para la evolución |
| **Foto** | Se sincroniza desde Odoo; al cambiarla en appsupli se escribe de vuelta. Cuadrada 1:1, 512×512 recomendado (mínimo 256×256), JPG/PNG/WebP, hasta 5 MB |
| **Cuenta de integración** | Lectura en todo, escritura únicamente sobre la foto |
| **Dominio de ingreso** | `@supli.tech`. El `work_email` de Odoo debe coincidir exactamente |
| **Rol** | Líder = quien tiene personas a cargo en Odoo. Colaborador = el resto |
| **Áreas sin dirección** | Es intencional: se muestran sin dirección intermedia |
| **Bajas** | No se borra: se marca inactivo, se conserva el histórico y se revoca el acceso |

### 2.2 Modelos de Odoo que se consumen

- `hr.employee` — `id`, `name`, `active`, `work_email`, `identification_id` (cédula), `job_id`,
  `job_title`, `department_id`, `parent_id` (jefe), `coach_id` (mentor), `company_id`,
  `work_location_id`, `write_date`, `image_1920` (foto).
- `hr.department` — `id`, `name`, `complete_name`, `parent_id`, `manager_id`, `active`.
- `hr.job` — `id`, `name`, `department_id`.

La conexión es XML-RPC estándar (`/xmlrpc/2/common` para autenticar, `/xmlrpc/2/object` para
consultar). No hace falta ningún módulo a medida.

### 2.3 Lo que hay que construir

1. **Modelos `Departamento` y `Empleado`.** El departamento guarda su padre, para reconstruir el
   árbol: dirección es la raíz de la rama, área el segundo nivel y equipo la hoja. No se parte el
   texto de `complete_name`, porque hay nombres que contienen «/».
2. **Comando de sincronización** (`manage.py sync_odoo`), idempotente, con upsert por el id de
   Odoo. Carga inicial completa y luego solo lo que cambió, usando `write_date`.
3. **Emparejamiento con los usuarios actuales**, por correo y por cédula.
4. **Reporte de excepciones**: sin cédula, sin jefe, o que debería tener correo y no lo tiene.
5. **Los dos campos de área en el objetivo**, para la regla del cambio a mitad de mes: el objetivo
   conserva el área del momento en que se asignó.
6. **La foto**, que es la única parte que escribe en Odoo. Se guarda en nuestra base —el disco de
   Render se borra en cada despliegue— y se empuja a Odoo al cambiarla.

### 2.4 Decisión de diseño que conviene revisar primero

El personal de punto de venta no tiene correo, y en la plataforma `User` ya admite correo nulo. La
pregunta es si el empleado de Odoo se guarda **como un `User` más** (lo que hay hoy) o en una tabla
`Empleado` aparte ligada opcionalmente a un `User`.

Lo que se venía proponiendo es la tabla aparte: separa «la persona que existe en la organización»
de «la cuenta que inicia sesión». Pero como `User` ya acepta gente sin correo, la opción simple
—un solo modelo— también funciona y evita duplicar la jerarquía. **Hay que decidirlo antes de
escribir el comando de sincronización**, porque después cuesta cambiarlo.

### 2.5 Dos advertencias

1. **Odoo no da permisos por campo.** Los permisos son por modelo: o la cuenta escribe sobre
   empleados, o no escribe. El «solo la foto» lo garantiza nuestro código, no Odoo. Conviene
   dejarlo explícito en la especificación.
2. **Dónde vive la imagen.** No puede ser un archivo en disco. Se propone guardarla en la base,
   que para 512×512 pesa poco, y evita contratar almacenamiento externo.

### 2.6 Pendientes

| Qué | De quién | Bloquea |
|---|---|---|
| Dirección de la instancia, nombre de la base y credenciales de la cuenta de integración | Julián | **Sí**: sin esto no se arranca |
| Cómo se dispara la tarea diaria: cron de Render (tiene costo) o una acción programada de GitHub | Julián / Laura | No: el comando se puede correr a mano |
| **Confirmar la regla del área a mitad de mes** — Laura la propuso y quedó de validarla con People | People | No, pero define dos campos del modelo |
| Cédulas, correos en `@coltrade.com.co` y el departamento mal escrito, corregidos en producción | People / RRHH | No: afecta la calidad de la carga inicial |

### 2.7 Calidad de datos, última revisión conocida

Del 21 de septiembre, sobre la base de pruebas, 68 empleados activos:

- **24 sin cédula (35%)** — es la llave que une Odoo con appsupli.
- **18 correos en `@coltrade.com.co`** contra el dominio `@supli.tech` definido: esas personas no
  podrían entrar.
- **1 departamento mal escrito**: «Commercial Directorate / SALES / Commercial Directorate / SALES
  /Head of sales».
- Jerarquía en buen estado: solo 1 empleado sin jefe asignado.

La revisión se repite sobre la base definitiva cuando esté disponible.

---

## 3. Microsoft — lo que falta

### 3.1 Decisiones cerradas

- **El ingreso por usuario y contraseña se apaga para todos** cuando Microsoft quede activo. Queda
  una sola cuenta de respaldo de administrador, por si el SSO falla.
- **Dominio de ingreso:** `@supli.tech`. Quien no tenga cuenta ahí, no entra.
- **Punto de venta:** se mantienen fuera del ingreso en esta etapa. Ya están contemplados: existen,
  su jefe les registra objetivos y entran en rankings, pero no inician sesión.
- **Controles anti-préstamo** (sesión única, recordar dispositivo, auditoría): Fase 2. Los dos
  primeros son de appsupli; el acceso condicional depende de Microsoft.

### 3.2 Lo que se aterriza en la reunión con IT

1. **Identificador del directorio** (tenant ID).
2. **Identificador de la aplicación** (client ID), con el registro creado como aplicación de página
   web (SPA).
3. **Autorizar las URL de retorno**: producción (`https://appsupli.onrender.com`) y desarrollo
   (`http://localhost:5173`). Sin ellas, Microsoft rechaza el ingreso.
4. **Secreto: sí o no.** La recomendación es **no usarlo**: el ingreso se hace desde el navegador
   con PKCE y el backend valida contra las llaves públicas de Microsoft. Igual de seguro y sin una
   clave que caduque. Si IT lo prefiere, hace falta el secreto y quién lo rota.
5. **Con qué dato viene identificada la persona en el token** (correo o UPN) y la confirmación de
   que coincide exactamente con el `work_email` de Odoo.
6. **Nivel de MFA y acceso condicional**, según la licencia.

### 3.3 Avisos para esa conversación

- Si IT aplica acceso condicional (dispositivo gestionado, red corporativa, geocerca), hay que
  confirmar que esas políticas **no bloqueen appsupli**, o la gente no entra desde el celular ni
  desde fuera de la oficina.
- Conviene limitar el registro a cuentas de la organización, para que nadie entre con una cuenta
  personal de Microsoft.
- «Apagar el ingreso por contraseña para todos menos una cuenta» no es apagarlo: el mecanismo sigue
  vivo. Esa cuenta de respaldo debería quedar identificada en la plataforma y con su uso registrado
  en la auditoría.

### 3.4 Cómo se implementaría

El frontend obtiene el token de Microsoft con MSAL; el backend valida su firma contra las llaves
públicas de Entra y, a cambio, entrega la sesión de appsupli (los mismos JWT de hoy), amarrando esa
identidad al empleado de Odoo. El login actual no se borra: queda apagado salvo para la cuenta de
respaldo.

Es un endpoint nuevo en `apps/accounts` y un botón en la pantalla de ingreso. **No toca Performance
ni Challenge**, así que puede entrar en cualquier momento sin devolverse a tocar lo construido.

---

## 4. Otros pendientes de la plataforma

1. **Asignar los roles.** Existen creados pero sin asignar: `performance-people`,
   `performance-direccion`, `challenge-people` y `challenge-evaluador`. Mientras tanto solo los
   administradores pueden crear retos o abrir la excepción de un mes.
2. **Dar acceso a los módulos.** Cada colaborador necesita la aplicación asignada desde
   Administración, o con `seed_challenge_app --asignar-a correo@supli.tech`.
3. **Preguntas del prototipo que siguen abiertas:** si el colaborador puede consultar el Top de
   meses anteriores, y hasta dónde llega la visibilidad del ranking.
4. **Tipo «fórmula personalizada» en Performance:** está construido y probado. People debía
   confirmar si se usa en octubre o si se esconde del formulario para simplificar.

---

## 5. Por dónde seguir

1. Recibir de Julián la dirección de Odoo, la base y las credenciales.
2. Decidir el punto 2.4: un solo modelo de persona o `Empleado` aparte.
3. Construir departamentos, empleados y el comando de sincronización, con su reporte de
   excepciones.
4. Agregar los dos campos de área al objetivo, cuando People confirme la regla.
5. La foto, de último, que es lo único que escribe en Odoo.
6. Microsoft entra en paralelo, apenas IT entregue los datos del registro.
