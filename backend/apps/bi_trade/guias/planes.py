"""Las guías de los planes: Plan Partners y Plan Recomiéndame Belkin."""
from .estilo import Guia


def _entrar(g: Guia, tarjeta, permisos):
    g.pasos([
        'Entra a Supli con tu cuenta.',
        'En el menú, abre <b>BI Trade Marketing</b>.',
        f'Haz clic en la tarjeta <b>«{tarjeta}»</b>.',
    ])
    g.p(
        'Si no ves la tarjeta, tu usuario todavía no tiene ese plan. Pídele a un administrador '
        'que te lo asigne en Administración, en Usuarios.'
    )
    g.h2('Lo que permite cada permiso')
    g.tabla(['Permiso', 'Qué te deja hacer'], permisos, [1.1, 2.6])


def _compartir_formulario(g: Guia, que_envia):
    g.h2('El formulario para quien no tiene cuenta')
    g.p(
        'Quien tiene el permiso <b>Compartir</b> ve, en la página del formulario, el botón '
        '<b>«Compartir»</b>. Genera un enlace abierto: quien lo recibe diligencia sin cuenta y sin '
        f'contraseña. Solo puede {que_envia}; no ve lo cargado ni los tableros.'
    )
    g.pasos([
        'En la página del formulario, haz clic en <b>«Compartir»</b>.',
        'Escribe para quién es (por ejemplo, «Promotores Zona Norte») y cuándo vence.',
        'Haz clic en <b>«Generar enlace»</b>, cópialo y envíalo.',
    ])
    g.importante(
        'Si el enlace se filtra',
        'Revócalo con el interruptor que aparece junto a él en la misma ventana y comparte uno '
        'nuevo. Desde ese momento el enlace viejo deja de abrir.',
    )


def _lista(g: Guia, nombre, descripcion, campos, avisos=()):
    g.h2(nombre)
    g.p(descripcion)
    g.tabla(['Campo', 'Qué poner'], campos, [1, 2.8])
    for aviso in avisos:
        g.importante(*aviso)


def _como_usar_listas(g: Guia, volver):
    g.p(
        'Las listas se abren con los botones de la parte de arriba de la página del plan. Todas '
        'funcionan igual: buscas, filtras, y con <b>«Nuevo»</b> creas, con el lápiz editas y con '
        f'la papelera borras. El botón «Volver» te lleva a {volver}.'
    )
    g.consejo(
        'Activo o inactivo',
        'En vez de borrar, puedes dejar un registro <b>inactivo</b>: deja de salir en el '
        'formulario, pero lo que ya se registró con él se conserva. Es lo recomendado cuando un '
        'punto cierra o un producto sale del plan.',
    )


# ── Plan Partners ──────────────────────────────────────────────────────────


def guia_partners() -> bytes:
    g = Guia(
        'Plan Partners',
        'Recomendaciones de protectores registradas en el formulario, contra la meta del mes',
        '#0F766E',
    )
    g.indice([
        '¿Qué es el Plan Partners?', 'Cómo entrar y qué puedes hacer',
        'Registrar una recomendación', 'El tablero del plan', 'Cómo se mantiene al día',
        'Rutina recomendada', 'Preguntas frecuentes',
    ])

    g.h1('¿Qué es el Plan Partners?')
    g.p(
        'Es el plan en el que los promotores registran cada <b>protector que recomiendan e '
        'instalan</b> a un cliente en los puntos de venta (CAV). Antes se llenaba en un Microsoft '
        'Forms; ahora se registra aquí, y lo registrado se compara contra la <b>meta del mes</b> '
        'por marca y por punto de venta.'
    )
    g.vinetas([
        '<b>El formulario:</b> donde se registra cada recomendación (con cuenta, o por un enlace '
        'abierto para quien no tiene cuenta).',
        '<b>El tablero:</b> el cumplimiento del mes por marca, regional, punto de venta y '
        'promotor.',
        '<b>Las listas:</b> regionales, puntos de venta y productos que salen en el formulario.',
    ])

    g.h1('Cómo entrar y qué puedes hacer')
    _entrar(g, 'Plan Partners', [
        ['<b>Plan Partners</b> (ver el plan)',
         'Ver el tablero del plan y sus registros, y registrar recomendaciones desde la app.'],
        ['<b>Administrar el plan</b>',
         'Manejar las regionales, los puntos de venta y los productos, y subir las metas del '
         'mes.'],
        ['<b>Compartir</b>',
         'Crear y revocar el enlace del formulario, para que alguien sin cuenta registre.'],
        ['<b>Administrador de BI Trade</b>', 'Todo lo anterior.'],
    ])

    g.h1('Registrar una recomendación')
    g.p(
        'En la página del plan, haz clic en <b>«Formulario»</b>. Verás arriba cuántos registros, '
        'puntos de venta, productos y marcas hay, y dos pestañas: <b>«Registrar»</b> y '
        '<b>«Registros»</b>.'
    )
    g.p('El formulario son tres pasos cortos. Todos los campos son obligatorios y el registro '
        'queda a tu nombre.')
    g.tabla(
        ['Paso', 'Qué llenar'],
        [
            ['<b>1. Dónde se hizo</b>',
             'La <b>regional</b> y luego el <b>punto de venta</b>. Al elegir la regional te '
             'aparecen solo sus puntos.'],
            ['<b>2. Qué se recomendó</b>',
             'La <b>marca del equipo</b> del cliente y el <b>producto recomendado</b> '
             '(el protector '
             'que se instaló).'],
            ['<b>3. Datos de la venta</b>',
             'La <b>fecha de recomendación</b>, el <b>número de serial</b>, el <b>documento del '
             'promotor</b> y la <b>factura</b>. Son los datos que permiten verificar el registro '
             'después.'],
        ],
        [1, 2.8],
    )
    g.pasos([
        'Llena los tres pasos. Cada paso se marca como completo cuando tiene todo.',
        'Haz clic en <b>«Guardar recomendación»</b>. Verás la confirmación y el conteo de '
        'lo que llevas.',
        'Para empezar uno nuevo desde cero, usa el botón de limpiar.',
    ])
    g.h2('Consultar lo registrado')
    g.p(
        'En la pestaña <b>«Registros»</b> ves lo cargado y puedes buscar por serial, documento, '
        'factura o punto de venta. Si encuentras un registro equivocado, avísale a quien '
        'administra el plan.'
    )
    _compartir_formulario(g, 'enviar recomendaciones')

    g.h1('El tablero del plan')
    g.p(
        'Es la página principal del plan. Responde: <b>¿cuánto se ha registrado este mes frente '
        'a la meta?</b>'
    )
    g.h2('Los filtros')
    g.vinetas([
        '<b>Periodo:</b> el mes que quieres ver.',
        '<b>Regional</b> y <b>Punto de venta</b> (al elegir la regional, solo salen sus puntos).',
        '<b>Marca</b> del equipo.',
        '<b>Promotor:</b> escribe su número de documento.',
    ])
    g.h2('Las tarjetas de arriba')
    g.tabla(
        ['Tarjeta', 'Qué te dice'],
        [
            ['<b>Cumplimiento</b>', 'Unidades registradas frente a las unidades de la meta, en %.'],
            ['<b>Unidades registradas</b>',
             'Cuántos protectores se registraron, y cuánto valen en producto (con el precio de '
             'cada producto).'],
            ['<b>Falta para la meta</b>',
             'Las unidades que faltan. Si ya se pasó la meta, dice cuántas van por encima.'],
            ['<b>Promotores activos</b>',
             'Cuántos promotores registraron en el periodo y en cuántos puntos de venta.'],
        ],
        [1, 2.6],
    )
    g.h2('Las secciones')
    g.vinetas([
        '<b>Cumplimiento por marca:</b> lo registrado contra la meta de cada marca.',
        '<b>Registros por día:</b> cómo se repartió el mes, día a día.',
        '<b>Por regional:</b> el cumplimiento de cada zona.',
        '<b>Top puntos de venta:</b> los diez CAV con más registros en el periodo.',
        '<b>Ranking de promotores:</b> quién más registró. Las metas no se reparten por persona, '
        'así que aquí no hay porcentaje de cumplimiento.',
        '<b>Detalle por punto de venta y marca:</b> cada CAV con su marca, lo registrado y lo que '
        'falta.',
    ])
    g.consejo(
        '¿El tablero está vacío?',
        'Sube las metas del mes y registra recomendaciones en el formulario: el tablero se llena '
        'con esas dos cosas.',
    )

    g.h1('Cómo se mantiene al día')
    g.h2('Las metas del mes')
    g.p(
        'Quien tiene el permiso <b>Administrar el plan</b> ve el botón <b>«Subir metas»</b> en la '
        'página del plan. Se sube el Excel de metas tal como lo armas.'
    )
    g.pasos([
        'Arma el Excel con las columnas <b>MES</b>, <b>AÑO</b>, <b>CENTRO DE COSTOS</b>, '
        '<b>META</b>, <b>MARCA</b> y <b>PUNTO DE VENTA</b>: una fila por punto y marca.',
        'En la página del plan, haz clic en <b>«Subir metas»</b> y elige el archivo.',
        'Haz clic en <b>«Subir metas»</b> dentro de la ventana. Si ese mes ya estaba '
        'cargado, las filas lo actualizan.',
    ])
    g.importante(
        'El centro de costos tiene que existir',
        'Cada fila se cruza con el punto de venta por su centro de costos. Si un punto no está en '
        'la lista de puntos de venta, créalo antes de subir las metas.',
    )
    g.h2('Las listas del plan')
    _como_usar_listas(g, 'la página del plan')
    _lista(
        g, 'Regionales', 'Agrupan los puntos de venta en el formulario.',
        [['<b>Nombre</b>', 'Por ejemplo, «Región Centro (Z. Norte)».'],
         ['<b>Activo</b>', 'Si sale en el formulario.']],
        [('Cambiar el nombre', 'Si cambias el nombre de una regional, cambia en todos los '
          'registros de sus puntos.')],
    )
    _lista(
        g, 'Puntos de venta', 'Cada punto (CAV) con su centro de costos y su regional.',
        [['<b>Centro de costos</b>', 'La llave del punto, por ejemplo «C192». Debe ser único.'],
         ['<b>Nombre</b>', 'Por ejemplo, «Cav Cucuta Centro Av Quinta».'],
         ['<b>Regional</b>', 'La zona a la que pertenece.'],
         ['<b>Activo</b>', 'Si sale en el formulario.']],
        [('Cambiar de regional', 'Si cambias un punto de regional, todos sus registros —también '
          'los viejos— pasan a la nueva.')],
    )
    _lista(
        g, 'Productos', 'Los protectores que se pueden recomendar, con su precio.',
        [['<b>Código</b>', 'La llave del producto, por ejemplo «7015490». Debe ser único.'],
         ['<b>Nombre</b>', 'Por ejemplo, «Estandar».'],
         ['<b>Precio</b>', 'Sin puntos ni signo de pesos (21996). Con él se valora lo '
          'recomendado en el tablero.'],
         ['<b>Activo</b>', 'Si sale en el formulario.']],
    )

    g.h1('Rutina recomendada')
    g.tabla(
        ['Cuándo', 'Qué hacer'],
        [
            ['<b>Al empezar el mes</b>',
             '• Revisa que estén los puntos y productos del mes (y deja inactivos los que ya no '
             'van).<br/>• Sube las metas del mes con «Subir metas».'],
            ['<b>Durante el mes</b>',
             '• Los promotores registran cada recomendación en el formulario.<br/>• Revisa el '
             'tablero: marcas y puntos atrasados, y el ranking de promotores.'],
            ['<b>Al cerrar el mes</b>',
             '• Revisa el detalle por punto y marca para ver lo que faltó.'],
        ],
        [1, 3],
    )

    g.h1('Preguntas frecuentes')
    for pregunta, respuesta in [
        ('Un promotor no encuentra su punto en el formulario.',
         'Revisa que el punto esté en la lista de puntos de venta, activo y con su regional. En '
         'el formulario primero hay que elegir la regional.'),
        ('No aparece un producto para recomendar.',
         'Revisa que esté en la lista de productos y activo.'),
        ('El cumplimiento sale en 0 %.',
         'Faltan las metas del mes: súbelas con «Subir metas».'),
        ('Subí las metas dos veces.',
         'No pasa nada: si el mes ya estaba, las filas lo actualizan en vez de duplicarlo.'),
        ('¿Puede registrar alguien sin cuenta?',
         'Sí, con el enlace del formulario (botón «Compartir» en la página del formulario).'),
    ]:
        g.h2(pregunta)
        g.p(respuesta)
    return g.pdf()


# ── Plan Recomiéndame Belkin ───────────────────────────────────────────────


def guia_belkin() -> bytes:
    g = Guia(
        'Plan Recomiéndame Belkin',
        'Recomendaciones del mes contra las ventas de Claro, y el bono de cada promotor',
        '#0E7490',
    )
    g.indice([
        '¿Qué es el plan?', 'Cómo entrar y qué puedes hacer', 'De dónde salen los datos',
        'Registrar una recomendación', 'El tablero del plan', 'Cómo se gana el bono',
        'Cómo se mantiene al día', 'Compartir', 'Rutina recomendada', 'Preguntas frecuentes',
    ])

    g.h1('¿Qué es el plan?')
    g.p(
        'En el Plan Recomiéndame Belkin los asesores y promotores de los puntos de venta '
        'recomiendan productos Belkin (cases, láminas, cables, cargadores…). La app junta esas '
        'recomendaciones, las compara con lo que <b>Claro vendió</b> de los productos del plan en '
        'los mismos puntos, y calcula el <b>bono del mes</b> de cada promotor según la categoría '
        'de su punto.'
    )

    g.h1('Cómo entrar y qué puedes hacer')
    _entrar(g, 'Plan Recomiéndame Belkin', [
        ['<b>Plan Recomiéndame Belkin</b> (ver el plan)',
         'Ver el tablero, los asesores y los registros, y registrar recomendaciones desde la '
         'app.'],
        ['<b>Administrar el plan</b>',
         'Manejar regionales, puntos de venta, asesores, categorías y productos, y corregir o '
         'borrar registros.'],
        ['<b>Compartir</b>',
         'Crear y revocar el enlace del tablero (con contraseña) y el del formulario (abierto).'],
        ['<b>Administrador de BI Trade</b>', 'Todo lo anterior.'],
    ])

    g.h1('De dónde salen los datos')
    g.tabla(
        ['Dato', 'De dónde llega', 'Qué tienes que hacer'],
        [
            ['<b>Recomendaciones de los puntos de Coltrade</b>',
             'Del formulario del plan.', 'Que los asesores registren cada recomendación.'],
            ['<b>Recomendaciones de los puntos fuera de Coltrade</b>',
             'Del informe de ventas del ERP que se importa en BI Claro. Cada unidad vendida de un '
             'producto del plan cuenta como una recomendación.',
             'Nada aparte: llega solo cuando se importa el informe en BI Claro.'],
            ['<b>Ventas Belkin en Claro</b>',
             'De las ventas de BI Claro, de los productos que están en la lista del plan.',
             'Que el informe del ERP esté importado en BI Claro.'],
        ],
        [1.2, 1.6, 1.4],
    )
    g.consejo(
        '¿Cómo sabe la app si un punto es «fuera de Coltrade»?',
        'Porque en la lista de puntos de venta del plan no tiene regional. Esos puntos no salen en '
        'el formulario: lo suyo llega del informe de ventas.',
    )

    g.h1('Registrar una recomendación')
    g.p(
        'En la página del plan, haz clic en <b>«Formulario»</b>. Hay dos pestañas: '
        '<b>«Registrar»</b> y <b>«Registros»</b>. El asesor y la observación son opcionales; lo '
        'demás es obligatorio.'
    )
    g.tabla(
        ['Paso', 'Qué llenar'],
        [
            ['<b>1. Dónde se hizo</b>',
             'La <b>regional</b> y luego el <b>punto de venta</b> (solo salen los de esa '
             'regional).'],
            ['<b>2. Quién y cuándo</b>',
             'La <b>fecha</b> de la recomendación (no puede ser futura) y el <b>asesor Apple</b> '
             'que la hizo (opcional; solo salen los asesores de ese punto).'],
            ['<b>3. Qué se recomendó</b>',
             'La <b>categoría</b> y luego el <b>producto</b> (solo salen los de esa categoría).'],
            ['<b>4. ¿Alguna observación?</b>', 'Opcional.'],
        ],
        [1, 2.8],
    )
    g.pasos([
        'Llena los pasos y haz clic en <b>«Guardar recomendación»</b>.',
        'La app deja puestos el punto, el asesor y la categoría para que registres la siguiente '
        'más rápido.',
    ])
    g.h2('Consultar y corregir lo registrado')
    g.p(
        'En la pestaña <b>«Registros»</b> ves lo cargado y puedes buscarlo. Si un registro quedó '
        'mal, se elimina con la papelera de su fila (la recomendación se borra y no se puede '
        'recuperar) y se registra de nuevo.'
    )
    _compartir_formulario(g, 'enviar recomendaciones')

    g.h1('El tablero del plan')
    g.p('Es la página principal del plan. Filtra por <b>Periodo</b> (mes), <b>Regional</b> y '
        '<b>Punto de venta</b>.')
    g.h2('Las tarjetas de arriba')
    g.tabla(
        ['Tarjeta', 'Qué te dice'],
        [
            ['<b>Recomendaciones</b>',
             'El total del mes, separado en las que llegaron del formulario y las del informe.'],
            ['<b>Bono del mes</b>', 'El total de bonos, y cuántos promotores ganan bono.'],
            ['<b>Ventas Belkin en Claro</b>',
             'Las unidades de productos del plan que Claro vendió, y hasta qué día están '
             'cargadas.'],
            ['<b>Puntos con registros</b>',
             'En cuántos puntos hubo registros, y el último registro.'],
        ],
        [1, 2.6],
    )
    g.h2('Las secciones')
    g.vinetas([
        '<b>Recomendaciones y ventas por día:</b> lo recomendado contra lo que Claro vendió de los '
        'productos del plan en los mismos puntos.',
        '<b>Bono por promotor:</b> lo que registró cada promotor en su punto y el bono que le da, '
        'ordenado por bono.',
        '<b>Qué se recomienda:</b> las recomendaciones del mes por categoría de producto.',
        '<b>Cómo se gana el bono:</b> la tabla de paquetes por categoría (ver la sección '
        'siguiente).',
        '<b>Recomendado contra vendido, por punto:</b> en los puntos de Coltrade, las ventas son '
        'las que Claro reporta; en los de fuera, lo vendido es lo mismo que cuenta para su bono. '
        'Esta tabla se puede descargar en Excel.',
    ])

    g.h1('Cómo se gana el bono')
    g.p(
        'Cada punto de venta tiene una <b>categoría del bono</b> (1, 2 o 3). La categoría dice '
        'cuántas recomendaciones completan cada paquete; la 1 es la que más pide. Sin categoría, '
        'el punto no gana bono.'
    )
    g.tabla(
        ['Paquete', 'Categoría 1', 'Categoría 2', 'Categoría 3'],
        [
            ['<b>$70.000</b>', '36 recomendaciones', '24 recomendaciones', '18 recomendaciones'],
            ['<b>$50.000</b>', '32 recomendaciones', '16 recomendaciones', '14 recomendaciones'],
            ['<b>$40.000</b>', '26 recomendaciones', '14 recomendaciones', '12 recomendaciones'],
            ['<b>$30.000</b>', '20 recomendaciones', '12 recomendaciones', '10 recomendaciones'],
        ],
        [1, 1.2, 1.2, 1.2],
    )
    g.vinetas([
        'Las recomendaciones del mes se reparten en paquetes, <b>del más alto al más bajo</b>: '
        'primero todos los de $70.000 que alcancen, con lo que sobra los de $50.000, luego los de '
        '$40.000 y los de $30.000.',
        'Lo que no completa un paquete no paga.',
        'El bono tiene un <b>tope de $300.000</b> por promotor en el mes.',
    ])
    g.consejo(
        'Ejemplo',
        'Un promotor de un punto de categoría 2 registra 40 recomendaciones en el mes. Con 24 '
        'completa un paquete de $70.000 y le quedan 16. Con esas 16 completa un paquete de '
        '$50.000 y no le queda nada. Su bono es $70.000 + $50.000 = <b>$120.000</b>.',
    )
    g.importante(
        'Si cambias la categoría de un punto',
        'Todos sus registros, también los de meses pasados, se leen con la categoría nueva. '
        'Cámbiala solo si de verdad aplica a todo el histórico.',
    )

    g.h1('Cómo se mantiene al día')
    g.p(
        'Lo que mantiene vivo el plan es: las recomendaciones del formulario, el informe de '
        'ventas importado en BI Claro y las listas del plan al día.'
    )
    _como_usar_listas(g, 'la página del plan')
    _lista(
        g, 'Regionales', 'Agrupan los puntos de venta en el formulario: Zona Norte, Zona Sur…',
        [['<b>Nombre</b>', 'Por ejemplo, «Zona Norte».'], ['<b>Activo</b>', 'Si sale en el '
                                                            'formulario.']],
        [('Cambiar el nombre', 'Si cambias el nombre, cambia en todos los registros de sus '
          'puntos.')],
    )
    _lista(
        g, 'Puntos de venta',
        'Cada punto con su centro de costos, su regional y su categoría del bono.',
        [['<b>Centro de costos</b>', 'La llave del punto. Debe ser único.'],
         ['<b>Nombre</b>', 'Por ejemplo, «Cav Andino».'],
         ['<b>Regional</b>', 'La zona del punto, o <b>«Fuera de Coltrade»</b>: en ese caso no '
          'sale en el formulario y sus registros llegan del informe de ventas de Claro.'],
         ['<b>Categoría del bono</b>', '1, 2 o 3. Fija cuántas recomendaciones pide cada bono.'],
         ['<b>Activo</b>', 'Si sale en el formulario.']],
        [('Cambiar regional o categoría', 'Todos sus registros —también los viejos— se leen con '
          'la nueva.')],
    )
    g.h2('Asesores Apple')
    g.p(
        'Los asesores de cada punto (un punto puede tener varios). En el formulario, cada asesor '
        'sale solo cuando se elige su punto. La lista guarda la <b>historia</b>: quién fue el '
        'asesor de cada punto y desde cuándo, para que cada recomendación quede a nombre de quien '
        'la hizo.'
    )
    g.tabla(
        ['Si…', 'Haz esto'],
        [
            ['El nombre está mal escrito',
             'Corrígelo en la lista de <b>Asesores Apple</b> (lápiz de la fila).'],
            ['El punto cambió de asesor',
             'Abre el detalle del punto y usa <b>«Cambiar asesor»</b>: escribe el nuevo y '
             'desde qué '
             'fecha. El anterior termina el día antes y sus recomendaciones siguen a su nombre.'],
            ['Llegó un asesor adicional (trabaja a la vez que los otros)',
             'En el detalle del punto, usa <b>«Agregar asesor»</b> con su nombre y desde cuándo.'],
        ],
        [1.3, 2.7],
    )
    _lista(
        g, 'Categorías', 'Agrupan los productos: Case Apple, Lámina, Cable, Cargador…',
        [['<b>Nombre</b>', 'Por ejemplo, «Lámina».'], ['<b>Activo</b>', 'Si sale en el '
                                                      'formulario.']],
        [('Cambiar el nombre', 'Si cambias el nombre, cambia en todos los registros de sus '
          'productos.')],
    )
    _lista(
        g, 'Productos', 'Cada producto del plan con su código y su categoría.',
        [['<b>Código</b>', 'La llave del producto (el mismo código del ERP). Debe ser único.'],
         ['<b>Nombre</b>', 'Por ejemplo, «Spigen Iphone 12 / 12 Pro Case Crystal Flex».'],
         ['<b>Categoría</b>', 'A qué categoría pertenece.'],
         ['<b>Activo</b>', 'Si sale en el formulario. Un producto inactivo igual cuenta en las '
          'ventas de Claro.']],
        [('Cambiar de categoría', 'Si cambias un producto de categoría, todos sus registros '
          '—también los viejos— pasan a la nueva.')],
    )
    g.h2('Las ventas de Claro')
    g.p(
        'Las ventas Belkin y las recomendaciones de los puntos fuera de Coltrade llegan cuando se '
        'importa el <b>informe del ERP en BI Claro</b> (botón «Importar» del tablero de Claro). '
        'Las ventas de los productos del plan entran siempre a Claro, tengan meta o no. Si la '
        'tarjeta «Ventas Belkin en Claro» dice que están cargadas hasta hace varios días, falta '
        'importar el informe en BI Claro.'
    )

    g.h1('Compartir')
    g.p(
        'Con el permiso <b>Compartir</b> tienes dos enlaces distintos:'
    )
    g.vinetas([
        '<b>El tablero</b> (botón «Compartir» de la página del plan): de solo lectura y con '
        'contraseña. Quien lo abra ve el tablero sin cuenta, sin el formulario, sin las listas y '
        'sin descargar nada. Eliges para quién es y cuándo vence (no vence, 1, 7 o 30 días).',
        '<b>El formulario</b> (botón «Compartir» de la página del formulario): abierto, sin '
        'contraseña, para que registren sin cuenta.',
    ])
    g.importante(
        'La contraseña del tablero se muestra una sola vez',
        'Cópiala al generar el enlace. Si se pierde, en la misma ventana puedes generar una nueva '
        'contraseña sin cambiar el enlace, o revocarlo con el interruptor.',
    )

    g.h1('Rutina recomendada')
    g.tabla(
        ['Cuándo', 'Qué hacer'],
        [
            ['<b>Al empezar el mes</b>',
             '• Revisa los puntos de venta: regional (o fuera de Coltrade) y categoría del '
             'bono.<br/>• Revisa los asesores de cada punto y registra los cambios con fecha.'
             '<br/>• Revisa que estén los productos del plan.'],
            ['<b>Durante el mes</b>',
             '• Los asesores registran sus recomendaciones en el formulario.<br/>• Asegúrate de '
             'que el informe del ERP se importe en BI Claro (de ahí salen las ventas y los puntos '
             'fuera de Coltrade).<br/>• Revisa el tablero: quién va cerca del siguiente paquete.'],
            ['<b>Al cerrar el mes</b>',
             '• Revisa «Bono por promotor» y descarga «Recomendado contra vendido, por punto».'],
        ],
        [1, 3],
    )

    g.h1('Preguntas frecuentes')
    for pregunta, respuesta in [
        ('Un punto no aparece en el formulario.',
         'Revisa en la lista de puntos que esté activo y que tenga regional. Los puntos «fuera de '
         'Coltrade» no salen en el formulario a propósito.'),
        ('Un asesor no sale al elegir su punto.',
         'Revisa en Asesores Apple que esté activo, asignado a ese punto y vigente en la fecha de '
         'la recomendación.'),
        ('Un promotor tiene recomendaciones pero su bono es $0.',
         'Puede que su punto no tenga categoría del bono, o que aún no complete el paquete más '
         'pequeño de su categoría.'),
        ('Las ventas Belkin en Claro están atrasadas.',
         'Falta importar el informe del ERP en BI Claro. Las ventas del plan llegan de ahí.'),
        ('Registré algo mal.',
         'Elimínalo desde la pestaña «Registros» (si tienes el permiso) y regístralo de nuevo.'),
    ]:
        g.h2(pregunta)
        g.p(respuesta)
    return g.pdf()
