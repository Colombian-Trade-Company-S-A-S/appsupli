# Integración Planner ↔ appSupli: novedades y pendientes

**Referencia:** INT-TEC-PLN-001 · Integración Planner appSupli V01, guía paso a paso (opción A, Microsoft Graph) y prototipo «vista weekly y daily»
**Fecha:** 5 de noviembre de 2026
**Para:** Laura (Tech), People, IT / Microsoft 365

---

## En resumen

- **La conexión con Planner ya funciona.** appSupli se conecta con la app `appsupli-planner-sync` y lee planes, depósitos, tareas, etiquetas y checklist. Los cinco endpoints de la guía respondieron bien con el plan «Laura Ayala-2026».
- **Lo que falta para el arranque del lunes 9 de noviembre depende sobre todo de decisiones**, no de la conexión. La línea base de la WEEK 46 se toma el **lunes 9 a las 18:00**. Si ese día no se captura, no se puede recuperar después.
- Abajo está la tabla con cada pendiente. **Por favor, escriban su respuesta en la columna «Comentario»** y devuélvanme el archivo.

## Lo que ya está

- **La app está registrada en Entra ID**, con consentimiento de administrador para `Tasks.Read.All` y `Group.Read.All`. Solo lectura. El secreto vence el **3 de noviembre de 2028**.
- **Estructura de grupos (decisión 5 del Anexo A).** El plan de Laura vive en un grupo compartido con otros planes («Tech», «Estrategia TECH Q1»). Un grupo no es igual a una persona, así que cada plan se relaciona con su persona por el ID del plan.
- **El plan de prueba ya cumple el estándar:** depósitos `WEEK 40` a `WEEK 45`, etiquetas `WEEKLY`, `DAILY` e `HITO` escritas igual, y ninguna tarea de esas semanas sin etiqueta.
- **El conteo de la checklist que entrega Planner coincide** con el detalle de cada tarea. Se comprobó en 5 tareas.
- **Festivos de noviembre:** el lunes 2 y el lunes 16 son festivos, así que la línea base pasa al martes 3 y al martes 17.
- **Medición de la WEEK 47:** se mide normal hasta el domingo 22. Su Hito se valida del 23 al 25, dentro de la semana de salida.

---

## Pendientes

| # | Tipo | Tema | Novedad | Propuesta o qué se necesita | Responsable | Para cuándo | Comentario |
|---|---|---|---|---|---|---|---|
| 1 | Decisión | Hora de la línea base y del cierre (decisión 1) | La regla está en la guía y en el prototipo, pero no consta que People la haya aprobado. | Confirmar: línea base el lunes a las 18:00 COT (martes si el lunes es festivo) y cierre el domingo a las 23:59 COT. | Líder de People | Vie 6 nov | |
| 2 | Decisión | Tareas agregadas o movidas a mitad de semana (decisión 2) | El Word propone que las agregadas no entren al denominador, pero la fórmula de la guía y el prototipo no lo reflejan. Si cuentan como completadas, el % Weekly puede pasar de 100 y tapar un Daily bajo. Ejemplo: Weekly 160%, Daily 20% y Hito cumplido dan 92 en vez de 68. | Que las tareas agregadas después de la línea base no cuenten ni arriba ni abajo de la fórmula. Las que se mueven a otro depósito siguen contando en la semana de su línea base. | Líder de People | Vie 6 nov | |
| 3 | Decisión | «Sin validar» en el índice (decisión 3) | Hoy suma 100, igual que «Cumplido», y no se ve aparte. Si el líder no valida, nadie pierde el Hito. El propio Word lo marca como riesgo. | Mostrar «Sin validar» por separado en el dashboard y revisar la regla al cierre del piloto. | Líder de People | Vie 6 nov | |
| 4 | Decisión | Alcance del ranking (decisión 4) | Sigue pendiente. | Definir quién ve el ranking: solo líderes de dirección, toda la dirección o nadie durante el piloto. | Líder de People y CEO | Vie 6 nov | |
| 5 | Decisión | Población que se mide | El Word habla de «miembros del equipo», con meta de 100% de planes relacionados. Si incluye a asesores y promotores de Odoo, que en general no usan Planner, la meta no se puede cumplir. | Definir quiénes entran: por ejemplo, solo el personal administrativo y comercial con plan en Planner. | Líder de People | Vie 6 nov | |
| 6 | Decisión | Hito del CEO | El CEO no tiene jefe, así que nadie valida su Hito. | Definir si se autovalida, si lo valida People o si no aplica. | Líder de People | Vie 6 nov | |
| 7 | Decisión | Cortes del semáforo | El Word pide los mismos cortes de Supli Performance, que son verde desde 100 y naranja desde 85. Pero la meta del índice es ≥ 80 y el prototipo usa 80 y 60. Como el índice llega como máximo a 100, con los cortes de Performance casi nadie saldría en verde. | Usar cortes propios para Planner: verde desde 80 y ámbar desde 60, que People puede ajustar. | Líder de People | Vie 6 nov | |
| 8 | Decisión | Qué ve el líder | El prototipo le muestra al líder toda su área. En Objetivos y KPIs, el líder ve solo a sus personas a cargo directo. | Aplicar la misma regla de Performance: el líder ve a sus directos, y People ve toda la compañía. | Líder de People | Vie 6 nov | |
| 9 | Decisión | Vistas del Director y del CEO | El Word define que el Director consulta su dirección y el CEO toda la organización, pero el prototipo solo tiene colaborador, líder y People. | Confirmar si estas dos vistas entran en el MVP o quedan para después del piloto. | Líder de People | Vie 6 nov | |
| 10 | Definición | «Sin registrar» frente a «Sin validar» | En el prototipo, «Sin registrar» («el líder no lo registró») suma 0, mientras que «Sin validar» suma 100. No queda clara la diferencia. | Proponemos: «Sin registrar» significa que la persona no tiene tarea HITO esa semana y suma 0; «Sin validar» significa que el líder no la revisó a tiempo. | Líder de People | Vie 6 nov | |
| 11 | Definición | Semana sin tareas WEEKLY o sin checklist DAILY | El panel de calidad dice que una DAILY sin checklist «no cuenta», pero el prototipo la calcula como 0 en el índice. Pasa, por ejemplo, en vacaciones o incapacidad. | Decidir entre contarla como 0 o sacar ese componente y repartir su peso entre los otros, dejando una alerta. Proponemos lo segundo. | Líder de People | Vie 6 nov | |
| 12 | Definición | Más de un Hito en la semana | El Word divide entre «Hitos de la semana», mientras que el prototipo asume uno solo. | Confirmar si es un solo Hito por semana. Si puede haber más, cada uno se valida por separado y se promedian. | Líder de People | Vie 6 nov | |
| 13 | Definición | Ventana de validación en semana con festivo | El Hito de la WEEK 46 se valida del lunes 16 al miércoles 18, pero el lunes 16 es festivo. | Correr la ventana un día cuando el lunes es festivo: en este caso, del martes 17 al jueves 19. | Líder de People | Vie 6 nov | |
| 14 | Calidad del dato | Tareas WEEKLY en depósitos de meses | En el plan de Laura hay 108 tareas WEEKLY en depósitos como «MAYO 2026» o «SEPTIEMBRE 2026», de antes de que existieran los `WEEK NN`. Con la regla «Fuera de WEEK» del prototipo, todas saldrían como incidencia. | Que el panel de calidad revise solo las semanas activas, desde la WEEK 45. | Tech | Lun 9 nov | |
| 15 | Calidad del dato | Cambio de año y WEEK 53 | Los depósitos `WEEK NN` no llevan año y los planes se llaman «Nombre-2026». En enero habrá planes nuevos. Además, 2026 tiene una WEEK 53 (28 de diciembre al 3 de enero) que queda entre dos años y dos planes. | Relacionar los planes 2027 antes del 4 de enero, y tomar la WEEK 53 del plan 2026. | People y Tech | 18 dic | |
| 16 | Alcance | Histórico de octubre | Las WEEK 40 a 44 ya se pueden leer, aunque de forma aproximada porque no tienen línea base. El Word dice «histórico desde noviembre». | Definir si se cargan como referencia, marcadas como aproximadas, o se arranca desde la WEEK 45. | Líder de People | Lun 9 nov | |
| 17 | Infraestructura | Tarea programada en Render | La sincronización necesita correr a horas fijas: 02:00, lunes 18:00 y domingo 23:59. El backend está en el plan gratuito de Render, que se apaga cuando no hay uso y no ejecuta tareas programadas. El Word dice que la opción A no tiene costo adicional. | Aprobar el cron de Render, que tiene costo mensual. Las acciones programadas de GitHub no garantizan la hora exacta, así que no sirven para la línea base. | Laura (Tech) | Vie 6 nov | |
| 18 | Datos | Inventario de planes y relación plan–persona (paso 3) | **Ya está el inventario:** archivo `Inventario_planes_Planner.xlsx`. Tiene 141 planes en 145 grupos, 30 de ellos con uso desde octubre. De las 30 personas activas, sin contar asesores y promotores, 28 tienen plan sugerido y 2 no: Gloria Corredor (aprendiz SENA) y Natalia Pardo. 8 personas tienen dos planes, casi siempre uno de 2025 y otro de 2026. | People valida la persona y el plan de cada fila en las columnas amarillas del Excel, y marca si entra al piloto. | People | Lun 9 nov, antes de las 12:00 | |
| 19 | Desarrollo | Orden de construcción del módulo | El módulo en appSupli todavía no está construido. | Construir primero la captura de las fotos semanales, porque una línea base no tomada no se recupera. El cálculo, la validación de Hitos y el dashboard pueden llegar después: el primer cierre es el domingo 15. | Tech | Lun 9 nov, 18:00 | |
| 20 | Legal | Tratamiento de datos (Ley 1581 de 2012) | El Word pide comunicar el propósito al equipo y validarlo con jurídico. No hay evidencia de que se haya hecho. | Validar con jurídico y comunicar al equipo antes de empezar a medir. | Líder de People | Lun 9 nov | |
| 21 | Calidad del dato | Formato de los depósitos por semana | Solo 7 planes cumplen el estándar completo (`WEEK 45` y las tres etiquetas). Otros 18 sí tienen depósitos por semana, pero con otro nombre: `W45`, `W 45`, `Week 45` o solo `45`. Hay 2 planes sin la etiqueta HITO o DAILY y 1 activo sin depósitos por semana. | Que appSupli acepte las variantes `W45`, `W 45`, `Week 45` y `45`, y las muestre como alerta en el panel de calidad, en vez de pedirle a 18 personas que renombren antes del lunes. | Líder de People y Tech | Vie 6 nov | |

---

Gracias por sus respuestas. Con las decisiones 1 a 13 cerradas se pueden dejar listas las reglas de cálculo antes del arranque.
