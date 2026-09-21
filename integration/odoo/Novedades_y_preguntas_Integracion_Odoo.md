# Integración Odoo ↔ appsupli — Novedades y preguntas

**Referencia:** INT-TEC-ET-002 · Integración Odoo ↔ appsupli (datos maestros de empleados)
**Fecha:** 21 de septiembre de 2026
**Para:** Laura (Tech), People / RRHH, IT / Microsoft

---

## En resumen

- **La conexión con Odoo ya funciona.** appsupli se conecta a Odoo y lee los empleados, las áreas y los cargos sin problema.
- **Lo que falta para el 28/09 depende sobre todo de decisiones y de datos**, más que de desarrollo. Abajo están los puntos que se necesita cerrar esta semana.

---

## 1. Lo que se encontró en Odoo

Se revisó la base **de pruebas** de Odoo (`test2-smp`): 68 empleados activos, todos de Colombian Trade Company.

| Hallazgo | Por qué importa | Quién lo resuelve |
|---|---|---|
| **24 de 68 activos (35%) no tienen cédula** | La cédula es la llave que une a cada persona en Odoo con su usuario en appsupli. Sin ella no se puede vincular. | RRHH / People |
| **33 de 68 no tienen correo laboral** | Es normal para asesores y promotores de PDV. Sí es un problema si a alguno administrativo o comercial le falta, porque sin correo no puede entrar. | RRHH / People |
| **Hay dos dominios de correo:** `@coltrade.com.co` y `@supli.tech` | El correo de Odoo tiene que ser el mismo con el que la persona entra a Microsoft (Outlook/Teams). Si no coincide, no podrá ingresar. | IT |
| **Un departamento tiene un nombre mal escrito:** "Commercial Directorate / SALES / Commercial Directorate / SALES /Head of sales" | Parece un error de captura y ensucia la estructura de áreas. | RRHH / People |
| **Varias áreas cuelgan directo de la raíz, sin dirección arriba** (TECH, PEOPLE, PRESIDENCIA, BUSINESS INTELLIGENCE, PROJECTS…) | Hay que definir cómo se muestran: ¿son direcciones en sí mismas? | People |
| **Jefe inmediato:** solo 1 empleado no tiene jefe asignado | Está muy bien: la jerarquía jefe → colaborador que usa Performance está casi completa. | — |

> Estos datos son de la base **de pruebas**. Se necesita confirmar si la de producción está igual o mejor.

---

## 2. Preguntas por resolver

### Urgentes (para llegar al 28/09)

1. **Acceso con Microsoft (SSO).** ¿IT puede registrar appsupli en Microsoft Entra ID esta semana y compartir los datos de la aplicación (tenant y client ID)?
   *Si no llega a tiempo, se propone salir el 28/09 con el ingreso actual (usuario y contraseña) y activar Microsoft apenas esté listo.*
2. **Dominio de correo.** ¿Con qué correo entra cada persona a Microsoft: `@coltrade.com.co`, `@supli.tech` o ambos?
3. **Asesores y promotores de PDV.** Ellos no tienen correo corporativo. ¿Van a tener objetivos en Performance en esta fase?
   *Si la respuesta es sí, deben aparecer en appsupli aunque no puedan ingresar, y su jefe les asignaría los objetivos.*
4. **Cédulas faltantes.** ¿RRHH puede completar las cédulas en Odoo antes del 28/09? Se compartirá el listado de quiénes faltan.
5. **Usuario de Odoo para la integración.** Hoy la conexión usa un usuario personal. ¿Se puede crear un usuario técnico **solo de lectura** sobre Empleados para appsupli?
6. **Odoo de producción.** Lo revisado hasta ahora es la base de pruebas. Se necesita confirmar el acceso a la base real.

### Para definir con People (pueden cerrarse después del 28/09)

7. **Rol.** ¿Se toma como **líder** a quien tiene personas a cargo en Odoo y como **colaborador** al resto? ¿Hace falta distinguir niveles (Director, Gerente…)?
8. **Áreas sin dirección.** ¿Cómo se muestra a quien depende directo de una dirección, sin un área en medio?
9. **Cambio de área a mitad de mes.** Los objetivos ya asignados, ¿se quedan con el área que tenían o pasan a la nueva?
10. **Regionales.** ¿Solo Colombia en esta fase, o también US, MX y PE?
11. **Foto de perfil.** ¿La foto vive solo en appsupli o también debe quedar en Odoo?
12. **Frecuencia de actualización.** ¿Basta con actualizar una vez al día (en la madrugada), o hay casos que deban verse al instante (por ejemplo, un retiro)?

---

Se agradecen sus respuestas para concretar la conexión.
