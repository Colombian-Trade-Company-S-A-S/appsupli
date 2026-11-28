"""Las guías de los cuatro canales: Claro, Homecenter, Falabella y Tmk Ecommerce Claro."""
from .estilo import Guia

# ── Cada canal: lo que cambia entre una guía y otra ─────────────────────────

CLARO = {
    'clave': 'claro',
    'titulo': 'BI Claro punto de venta',
    'subtitulo': 'Ventas, metas, inventario y concurso de los puntos de venta Claro',
    'acento': '#C8102E',
    'canal': 'Claro',
    'tarjeta': 'BI Claro punto de venta',
    'meta_por_punto': False,
    'con_puntos': True,
    'con_concurso': True,
    'detalle_regional': True,
    'codigo_punto': 'el código del centro en el ERP (por ejemplo, C123)',
    'codigo_producto': 'el código del material en el ERP (por ejemplo, 7023988)',
}

HC = {
    'clave': 'hc',
    'titulo': 'Informe de Ventas HC',
    'subtitulo': 'Ventas, metas e inventario del canal Homecenter',
    'acento': '#D9480F',
    'canal': 'Homecenter',
    'tarjeta': 'Informe de Ventas HC',
    'meta_por_punto': True,
    'con_puntos': False,
    'con_concurso': False,
    'detalle_regional': True,
    'codigo_punto': 'el EAN de la tienda que trae el portal de Homecenter',
    'codigo_producto': 'el Código SKU de Homecenter',
}

FALABELLA = {
    'clave': 'falabella',
    'titulo': 'Informe de Ventas Falabella',
    'subtitulo': 'Ventas, metas e inventario del canal Falabella',
    'acento': '#4D7C0F',
    'canal': 'Falabella',
    'tarjeta': 'Informe de Ventas Falabella',
    'meta_por_punto': False,
    'con_puntos': False,
    'con_concurso': False,
    'detalle_regional': True,
    'codigo_punto': 'el «ID Local» que trae el portal de Falabella',
    'codigo_producto': 'el SKU de Falabella',
}

TMK = {
    'clave': 'tmk',
    'titulo': 'Informe Tmk Ecommerce Claro',
    'subtitulo': 'Ventas, metas e inventario del canal Tmk Ecommerce Claro',
    'acento': '#6D28D9',
    'canal': 'Tmk Ecommerce Claro',
    'tarjeta': 'Informe Tmk Ecommerce Claro',
    'meta_por_punto': False,
    'con_puntos': False,
    'con_concurso': False,
    'detalle_regional': False,
    'codigo_punto': 'el código del centro en el ERP',
    'codigo_producto': 'el código del material en el ERP (por ejemplo, 7023988)',
}


# ── Secciones comunes ───────────────────────────────────────────────────────


def que_es(g: Guia, c):
    g.h1('¿Qué es este informe?')
    textos = {
        'claro': (
            'Es el tablero de los <b>puntos de venta Claro</b>. Te muestra, mes a mes, cuánto se '
            'ha vendido contra la meta, cómo va cada regional y cada punto, qué productos van '
            'flojos, cuánto stock queda y quién va ganando el <b>concurso de tickets</b>.'
        ),
        'hc': (
            'Es el tablero del canal <b>Homecenter</b>. Te muestra cuánto ha vendido cada tienda '
            'en el mes frente a su meta, cómo va cada regional, y qué stock tiene cada tienda. '
            'Aquí la meta es <b>de la tienda y en pesos</b>: no se reparte por producto.'
        ),
        'falabella': (
            'Es el tablero del canal <b>Falabella</b>. Te muestra cuánto ha vendido cada tienda '
            'en el mes frente a su meta, cómo va cada regional, qué productos se movieron y qué '
            'stock queda. Las ventas llegan de los reportes que se descargan del portal de '
            'Falabella.'
        ),
        'tmk': (
            'Es el tablero del canal <b>Tmk Ecommerce Claro</b> (televentas, domicilios y '
            'e-commerce). Te muestra cuánto se ha vendido en el mes frente a la meta, cómo va cada '
            'punto y qué stock queda. Las ventas llegan del mismo informe del ERP que usa Claro.'
        ),
    }
    g.p(textos[c['clave']])
    g.p(
        'Tiene dos formas de usarse: <b>mirar</b> (el tablero y los listados, para saber cómo va '
        'el negocio) y <b>alimentar</b> (cargar productos, puntos de venta, metas, ventas e '
        'inventario para que el tablero muestre la realidad). Esta guía explica las dos.'
    )
    if c['clave'] != 'claro':
        g.consejo(
            'Es un canal independiente',
            f'{c["canal"]} tiene sus propios puntos de venta, productos, ventas y metas. '
            'Nada de lo '
            'que cargues aquí cambia los otros informes, y al revés. Arriba de cada pantalla verás '
            f'una franja que dice «{c["canal"]}» para que sepas en qué canal estás.',
        )


def entrar_y_permisos(g: Guia, c):
    g.h1('Cómo entrar y qué puedes hacer')
    g.pasos([
        'Entra a Supli con tu cuenta.',
        'En el menú, abre <b>BI Trade Marketing</b>.',
        f'Haz clic en la tarjeta <b>«{c["tarjeta"]}»</b>.',
    ])
    g.p(
        'Si no ves la tarjeta, tu usuario todavía no tiene ese informe. Pídele a un administrador '
        'que te lo asigne en Administración, en Usuarios.'
    )
    g.h2('Lo que permite cada permiso')
    g.p(
        'Lo que ves en pantalla depende de tus permisos. Si un botón no te aparece, es porque tu '
        'usuario no tiene el permiso que lo habilita.'
    )
    filas = [
        [f'<b>{c["tarjeta"]}</b> (ver el informe)',
         'Ver el tablero y los listados (ventas, productos, puntos de venta, inventario y metas) y '
         'descargarlos en Excel. No puede cambiar nada.'],
        ['<b>Cargar y editar ventas</b>', 'Crear, corregir y borrar ventas, e importarlas.'],
        ['<b>Cargar y editar inventario</b>',
         'Cargar el stock de cada punto y corregirlo. Cargar un reporte de inventario reemplaza '
         'el que había.'],
        ['<b>Cargar y editar metas</b>',
         'Cargar y corregir las metas del mes' + (
             ' y las reglas del concurso de tickets.' if c['con_concurso'] else '.')],
        ['<b>Editar productos y precios</b>',
         'Crear y corregir productos, sus precios y las marcas. También permite crear los '
         'productos que faltan al importar.'],
        ['<b>Editar puntos de venta</b>',
         'Crear y corregir puntos de venta, su regional y sus materiales.'],
        ['<b>Compartir este tablero</b>',
         'Crear enlaces con contraseña para mostrar el tablero a alguien que no tiene cuenta.'],
        ['<b>Administrador de BI Trade</b>', 'Todo lo anterior, en todos los informes.'],
    ]
    if c['clave'] in ('claro', 'tmk'):
        filas[1][1] += (
            ' El botón «Importar» del informe del ERP pide <b>ventas e inventario</b> a la vez, '
            'porque carga las dos cosas.'
        )
    g.tabla(['Permiso', 'Qué te deja hacer'], filas, [1.1, 2.4])


def glosario(g: Guia, c):
    g.h1('Palabras que vas a ver')
    g.p('Estas son las palabras que más se repiten en el tablero y en esta guía.')
    if c['meta_por_punto']:
        meta = (
            'Lo que debe vender cada tienda en el mes, <b>en pesos</b>. Se carga una meta por '
            'tienda y por mes.'
        )
    else:
        meta = (
            'Lo que se espera vender de cada producto en cada punto de venta en el mes, <b>en '
            'unidades</b>. La app la convierte a pesos con el precio Coltrade del producto.'
        )
    filas = [
        ['<b>Meta</b>', meta],
        ['<b>Cumplimiento</b>',
         'Cuánto se ha vendido frente a la meta, en porcentaje. 100 % es meta cumplida; más de '
         '100 % es sobrecumplimiento.'],
        ['<b>Días hábiles</b>',
         'De lunes a sábado. Los domingos y los festivos de Colombia no cuentan para la meta.'],
        ['<b>Meta diaria o cuota del día</b>',
         'La meta del mes dividida entre los días hábiles del mes. Es lo que hay que vender cada '
         'día para llegar.'],
        ['<b>Ritmo</b>',
         'Compara tu cumplimiento con lo que deberías llevar según los días hábiles que ya '
         'pasaron. «+5 pts» quiere decir que vas 5 puntos adelantado; «−5 pts», atrasado.'],
        ['<b>Precio Coltrade</b>',
         'El precio con el que la app convierte unidades en pesos. Cada venta vale el precio '
         'Coltrade del día en que se hizo.'],
        ['<b>Regional</b>', 'La zona que agrupa varios puntos de venta (Zona Norte, Zona Sur…).'],
        ['<b>Punto de venta</b>',
         f'La tienda. Su código es {c["codigo_punto"]}: es la llave con la que llegan los datos.'],
        ['<b>Inventario o stock</b>', 'Las unidades que hay hoy en cada punto de venta.'],
    ]
    if c['con_puntos']:
        filas.append([
            '<b>Puntos</b>',
            'Cada producto puede tener un puntaje. Unidades vendidas × puntaje = puntos. Es otra '
            'forma de medir, además de pesos y unidades.',
        ])
    g.tabla(['Palabra', 'Qué significa'], filas, [1, 3])


def avance_del_mes(g: Guia, c):
    g.h1('El tablero: «Avance del mes»')
    g.p(
        'Es la primera hoja del informe y responde una pregunta: <b>¿vamos a llegar a la meta '
        'este mes?</b> Arriba están las pestañas: «Avance del mes», «Cumplimiento diario»'
        + (' y «Concurso de tickets»' if c['con_concurso'] else '') + '.'
    )
    g.h2('Los filtros')
    g.vinetas([
        '<b>Mes:</b> con las flechas te mueves al mes anterior o al siguiente.',
        '<b>Regional, Punto de venta y Marca:</b> acotan todo lo que ves en la página. Los '
        'filtros activos aparecen debajo como etiquetas; con la «x» de cada una la quitas.',
        '<b>Limpiar:</b> quita todos los filtros de una vez.',
        '<b>Descargar mes:</b> baja un Excel con las tres vistas del mes: día por día, por '
        'regional y por punto de venta.',
    ])
    if c['clave'] == 'claro':
        g.consejo(
            'Solo aparecen los puntos con meta',
            'En Claro, el filtro de punto de venta y las tablas muestran solo los puntos que '
            'tienen meta en el mes que estás mirando. Si falta un punto, revisa sus metas.',
        )
    if c['meta_por_punto']:
        g.consejo(
            'El filtro de marca en Homecenter',
            'Como la meta es de la tienda completa, al filtrar por una marca ves lo vendido de esa '
            'marca contra la meta de toda la tienda. Sirve para ver cuánto aporta cada marca.',
        )
    g.h2('Las cuatro tarjetas de arriba')
    vendido = (
        'Los pesos vendidos en el mes. Debajo, las unidades vendidas.'
        if c['meta_por_punto']
        else 'Los pesos vendidos en el mes. Debajo, las unidades vendidas frente a las unidades '
        'de la meta.'
    )
    g.tabla(
        ['Tarjeta', 'Qué te dice'],
        [
            ['<b>Cumplimiento del mes</b>',
             'El porcentaje vendido frente a la meta del mes, con una etiqueta de ritmo: «Al '
             'día», «+X pts» (vas adelantado) o «−X pts» (vas atrasado). Debajo dice cuánto '
             'deberías llevar a esta altura del mes.'],
            ['<b>Vendido en el mes</b>', vendido],
            ['<b>Meta diaria</b>',
             'Lo que hay que vender cada día hábil: la meta del mes dividida entre los días '
             'hábiles.'],
            ['<b>Días hábiles del mes</b>',
             'Cuántos días hábiles van de cuántos tiene el mes, y cuántos domingos y festivos se '
             'descontaron.'],
        ],
        [1, 2.6],
    )
    g.h2('La gráfica del mes')
    g.p(
        'Muestra la venta de cada día (el área de color) contra la meta (la línea punteada). La '
        'marca «Hoy» indica en qué día del mes vas. Pasa el cursor sobre un día para ver sus '
        'cifras. Debajo hay una segunda gráfica con el cumplimiento en porcentaje.'
    )
    g.vinetas([
        '<b>Diario:</b> cada día contra su cuota. Sirve para ver qué días se quedaron cortos.',
        '<b>Acumulado:</b> la suma del mes hasta cada día contra la meta acumulada. Sirve para '
        'ver si el mes, en total, va bien.',
    ])
    g.h2('Las tablas por regional y por punto de venta')
    regional = (
        'Haz clic en una regional para abrir su detalle, punto por punto.'
        if c['detalle_regional']
        else 'En este canal la regional no abre detalle; el detalle es por punto de venta.'
    )
    g.p(
        '<b>Avance por regional</b> muestra la meta de cada zona contra lo vendido. ' + regional
    )
    g.p(
        '<b>Avance por punto de venta</b> muestra lo mismo para cada punto, más su stock '
        'disponible y hasta dónde llegaría su cumplimiento si vendiera todo ese stock. Haz clic '
        'en un punto para abrir su detalle. Cuando la lista es larga aparece un buscador, y cada '
        'tabla tiene su botón para descargarla o copiarla.'
    )


def detalle_punto(g: Guia, c):
    g.h1('El detalle de un punto de venta')
    g.p(
        'Al hacer clic en un punto se abre su ficha del mes. Es la pantalla para preparar una '
        'visita o una llamada con el punto: dice cómo va y qué le falta.'
    )
    g.vinetas([
        '<b>Cumplimiento de la meta, Vendido en el mes y Promedio diario.</b>',
        '<b>Debe vender por día:</b> lo que le falta dividido entre los días hábiles que quedan. '
        'Si ya cumplió, dice «Meta cumplida».',
        '<b>Proyección:</b> cuánto cerraría el mes si sigue al ritmo que lleva.',
        '<b>Posición:</b> en qué lugar va frente a los demás puntos, y cuántos días hábiles lleva '
        'sin ninguna venta cargada.',
    ] + ([] if c['meta_por_punto'] else [
        '<b>Cumplimiento por marca</b> y <b>por producto</b>, con el stock de cada producto.',
        '<b>Productos a reforzar:</b> los que tienen meta y van por debajo de lo que deberían '
        'llevar hoy. Es la lista para empujar en el punto.',
    ]) + [
        '<b>Inventario</b> del punto, valorizado a precio Coltrade de hoy, y las <b>ventas del '
        'mes</b>, de la más reciente a la más vieja.',
    ])
    if c['detalle_regional']:
        g.p(
            'El <b>detalle de una regional</b> funciona igual, pero muestra cada punto de la zona '
            'contra su meta. Desde ahí también puedes abrir el detalle de cada punto.'
        )


def cumplimiento_diario(g: Guia, c):
    g.h1('«Cumplimiento diario»: cómo nos fue un día')
    g.p(
        'La hoja del mes responde «¿vamos a llegar?»; esta responde <b>«¿cómo nos fue ayer?»</b> '
        '(o cualquier otro día). Todo se compara contra la cuota de ese día.'
    )
    medidas = (
        'En este canal se mide en <b>dinero</b>, porque la meta es en pesos.'
        if c['meta_por_punto']
        else 'Arriba de las tarjetas eliges cómo medir: <b>Dinero</b>, <b>Unidades</b>'
        + (' o <b>Puntos</b>' if c['con_puntos'] else '')
        + '. La medida que elijas se aplica a todas las tablas.'
    )
    g.pasos([
        'Abre la pestaña <b>«Cumplimiento diario»</b>.',
        'Elige el día. Los domingos y festivos aparecen marcados: no tienen cuota.',
        'Si quieres, filtra por regional, punto de venta, marca o producto.',
        medidas,
    ])
    g.p(
        'Verás cuatro tarjetas (cumplimiento del día, vendido en el día, unidades y cuota del '
        'día) y cuatro tablas: <b>por regional</b>, <b>por marca</b>, <b>por punto de venta</b> '
        '(ordenado por cumplimiento) y <b>por producto</b>. El botón <b>«Descargar día»</b> baja '
        'un Excel con los cuatro cortes.'
    )


def concurso(g: Guia, c):
    g.h1('«Concurso de tickets»')
    g.p(
        'Premia a los puntos de venta que cumplen su venta diaria. Cada día que un punto alcanza '
        'una escala gana tickets; al final, entran al sorteo los puntos que cumplen las '
        'condiciones de la campaña. Las reglas aparecen en la misma hoja, en la tarjeta '
        '<b>«¿Cómo participar?»</b>, con los números que de verdad se están aplicando.'
    )
    g.h2('Las reglas, en palabras sencillas')
    g.tabla(
        ['Regla', 'Cómo funciona'],
        [
            ['<b>Escalas diarias</b>',
             'Según cuántas ventas haga el punto en el día, gana una cantidad de tickets. Se '
             'aplica la escala más alta que alcance.'],
            ['<b>Doble ticket</b>',
             'Si en el día vende al menos el mínimo de productos foco (Bluelight y/o Privacy), los '
             'tickets de ese día se duplican.'],
            ['<b>Bono por venta alta con cargadores</b>',
             'Si en el día logra cierta cantidad de ventas incluyendo cierto número de '
             'cargadores, suma tickets extra. Se suman a los de la escala.'],
            ['<b>Acelerador</b>',
             'Si el total de ventas de la campaña pasa un umbral, el punto gana tickets extra por '
             'cada día en que ya había ganado tickets.'],
            ['<b>Condición para participar</b>',
             'Un mínimo de ventas totales y un mínimo de tickets. Hay que cumplir <b>las dos</b>.'],
        ],
        [1.1, 2.6],
    )
    g.h2('Cómo leer la hoja')
    g.vinetas([
        '<b>Participan:</b> cuántos puntos cumplen las dos condiciones, de cuántos tienen venta.',
        '<b>Tickets en juego:</b> los tickets de los puntos que participan.',
        '<b>Unidades vendidas</b> y <b>Días cumplidos</b> en toda la vigencia de la campaña.',
        '<b>Tickets por punto de venta:</b> la tabla ordenada por tickets. Al pasar el cursor '
        'sobre los tickets de un punto ves de dónde salieron (escala, bono, acelerador).',
        'Filtra por campaña, regional, punto o marca, y usa <b>«Descargar»</b> para bajar el '
        'acumulado por punto y el detalle día por día.',
    ])
    g.h2('Crear o cambiar una campaña')
    g.p(
        'Quien tiene el permiso <b>Cargar y editar metas</b> ve el botón <b>«Crear campaña»</b> '
        '(o <b>«Editar reglas»</b> si ya hay una activa).'
    )
    g.pasos([
        'Escribe el nombre y las fechas de vigencia (desde y hasta), y deja la campaña activa.',
        'Pon la condición para participar: ventas totales mínimas y tickets mínimos.',
        'Agrega las escalas diarias (cuántas ventas en el día dan cuántos tickets) y, si '
        'aplica, el acelerador.',
        'Marca a mano qué productos son foco (Bluelight y Privacy no son categorías del '
        'catálogo) y el mínimo de unidades foco al día.',
        'Configura el bono: ventas del día, cargadores del día y tickets que da. Con 0 tickets el '
        'bono queda apagado.',
        'Guarda. El tablero se recalcula de inmediato con las reglas nuevas.',
    ])
    g.importante(
        'Los tickets salen de las ventas cargadas',
        'El concurso se calcula con las ventas que hay en la app. Si faltan ventas de un día, ese '
        'día no suma tickets: mantén las ventas al día.',
    )


def como_se_actualiza(g: Guia, c):
    g.h1('Cómo se mantiene al día la información')
    g.p(
        'Piensa en la información como capas. Primero va el <b>catálogo</b> (productos y puntos '
        'de venta), luego las <b>metas</b> y encima las <b>ventas</b> y el <b>inventario</b>. Si '
        'llega una venta de un producto o un punto que no existe en la app, no tiene dónde quedar.'
    )
    origen = {
        'claro': 'El informe del ERP de Coltrade (se sube a mano o se trae del correo).',
        'tmk': 'El informe del ERP de Coltrade (se sube a mano o se trae del correo).',
        'hc': 'Los reportes de ventas e inventario del portal de Homecenter (.xlsx).',
        'falabella': 'Los reportes «Ventas diarias» y «Análisis semanal» del portal de '
                     'Falabella (.csv).',
    }[c['clave']]
    meta = 'Una meta por tienda y mes, en pesos.' if c['meta_por_punto'] else (
        'Una meta por producto, punto y mes, en unidades.')
    g.tabla(
        ['Qué', 'Cuándo se actualiza', 'De dónde sale'],
        [
            ['<b>Productos y precios</b>', 'Cuando llega un producto nuevo o cambia un precio.',
             'A mano o con la plantilla de Excel' + (
                 '. Al importar, la app ofrece crear los que falten.'
                 if c['clave'] in ('hc', 'falabella', 'tmk') else '.')],
            ['<b>Puntos de venta</b>',
             'Cuando abre o cierra un punto, o cambia de regional.',
             'A mano o con la plantilla de Excel' + (
                 '. Al importar, la app ofrece crear los que falten.'
                 if c['clave'] in ('hc', 'falabella') else '.')],
            ['<b>Metas</b>', 'Una vez al mes, al empezar.', meta],
            ['<b>Ventas</b>', 'Cada vez que llega el informe (lo normal: a diario).', origen],
            ['<b>Inventario</b>', 'Cada vez que llega el informe. Se reemplaza completo.', origen],
        ],
        [1, 1.3, 1.7],
    )
    g.p(
        'Para entrar a cada parte, usa los botones de la parte de arriba del tablero: '
        '<b>Ventas</b>, <b>Puntos de venta</b>, <b>Productos</b>, <b>Inventario</b> y '
        '<b>Metas</b>. Cada uno abre un listado con filtros, y para volver usa el botón '
        '<b>«Tablero»</b>.'
    )
    g.h2('Cómo funciona la plantilla de Excel (para cargar muchos registros)')
    g.p(
        'Productos, puntos de venta, precios, metas, ventas e inventario se pueden cargar de a '
        'muchos con una plantilla. Los botones aparecen en cada listado si tienes el permiso.'
    )
    g.pasos([
        'En el listado, haz clic en <b>«Descargar plantilla»</b>.',
        'Abre el Excel y llena una fila por registro en la hoja «Datos». <b>No cambies los '
        'encabezados</b>: la app los usa para saber qué es cada columna.',
        'Los precios y metas en pesos van sin puntos de miles ni decimales (escribe 1299900, no '
        '$1.299.900). Las fechas, como AAAA-MM-DD (2026-03-15).',
        'Guarda el archivo como .xlsx y haz clic en <b>«Importar Excel»</b>.',
        'Si todo está bien, verás un mensaje con lo que se cargó.',
    ])
    g.importante(
        'Es todo o nada',
        'Si una sola fila tiene un problema, no se guarda ninguna y aparece la lista «Fila N: …» '
        'con lo que hay que corregir. Corrige el archivo y vuelve a subirlo completo.',
    )
    g.p('Así se comporta cada plantilla cuando un registro ya existe:')
    g.tabla(
        ['Plantilla', 'Si el registro ya existe…'],
        [
            ['Productos', 'Si el código ya existe, la fila actualiza ese producto.'],
            ['Puntos de venta', 'Si el código ya existe, la fila actualiza ese punto.'],
            ['Precios por periodo',
             'Si el producto ya tiene un precio que empieza en esa fecha, la fila lo actualiza.'],
            ['Metas',
             ('Si ya hay meta para esa tienda y ese mes, la fila la actualiza. Otro mes se carga '
              'sin pisar el anterior.') if c['meta_por_punto'] else
             ('Si ya hay meta para ese producto, punto y fecha, la fila la actualiza. Con otra '
              'fecha se carga la meta de otro periodo sin pisar la anterior.')],
            ['Inventario',
             'Hay un solo registro por producto y punto: la fila actualiza la cantidad.'],
            ['Ventas',
             '<b>Cada fila es una venta nueva.</b> Subir el mismo archivo dos veces duplica las '
             'ventas.'],
        ],
        [1, 3],
    )


def productos(g: Guia, c):
    g.h1('Productos y precios')
    g.p(
        f'El catálogo del canal, con su precio en {c["canal"]} y su precio Coltrade. El código '
        f'de cada producto es {c["codigo_producto"]}: tiene que ser exactamente el mismo que trae '
        'el informe, o sus ventas no cruzan.'
    )
    g.h2('Crear un producto a mano')
    campos = [
        'Entra a <b>Productos</b> y haz clic en <b>«Nuevo producto»</b>.',
        '<b>Código:</b> el que trae el informe. Después de crear el producto no se puede cambiar.',
    ]
    if c['clave'] == 'hc':
        campos.append('<b>EAN y SKU Coltrade:</b> opcionales.')
    campos += [
        '<b>Nombre</b> y <b>Marca</b>. La marca se elige de la lista; si no está, agrégala con el '
        'botón <b>«Marcas»</b> (la lista de marcas es la misma para todos los informes).',
        '<b>Precio Coltrade base:</b> el precio con el que se valoran las ventas los días que no '
        'tienen un precio por periodo.',
        f'<b>Precio de venta {c["canal"]}:</b> el precio al público en el canal.',
    ]
    if c['con_puntos']:
        campos.append('<b>Puntaje</b> (opcional): con él se calculan los puntos.')
    campos.append('Haz clic en <b>«Crear»</b>.')
    g.pasos(campos)
    if c['clave'] == 'hc':
        g.consejo(
            'En Homecenter solo el código y el nombre son obligatorios',
            'Un producto sin precio Coltrade sí cuenta en unidades, pero no suma dinero. El botón '
            '<b>«Productos sin precio»</b> baja la plantilla con los que quedaron en 0 para que '
            'les pongas precio y la subas con «Importar Excel».',
        )
    g.h2('Cuando cambia el precio Coltrade: «Precios por periodo»')
    g.p(
        'No cambies el precio base cada vez que cambia el precio: eso cambiaría el valor de las '
        'ventas de meses pasados. Registra el precio nuevo como un periodo.'
    )
    g.pasos([
        'En Productos, haz clic en <b>«Precios por periodo»</b> (o en el ícono de calendario de '
        'la fila del producto).',
        'Haz clic en <b>«Nuevo precio»</b>, elige el producto y escribe <b>Desde</b>, '
        '<b>Hasta</b> (vacío si sigue vigente) y el <b>Precio Coltrade</b>.',
        'Guarda.',
    ])
    g.consejo(
        'Ejemplo: el precio cambia el 15 del mes',
        'Registra dos periodos: uno hasta el día 14 con el precio anterior y otro desde el 15, sin '
        'fecha final, con el precio nuevo. Los periodos de un producto no se pueden pisar. Las '
        'ventas valen el precio de su día; las metas, el promedio del mes por días hábiles.',
    )
    g.h2('Borrar productos')
    g.p(
        'Un producto solo se puede eliminar si no tiene ventas. «Eliminar todo» solo funciona si '
        'ningún producto tiene ventas, inventario ni metas.'
    )


def puntos_de_venta(g: Guia, c):
    g.h1('Puntos de venta')
    g.p(
        f'Cada tienda del canal. Su código es {c["codigo_punto"]}: lo define el negocio y es la '
        'llave con la que llegan las ventas y el inventario.'
    )
    pasos = [
        'Entra a <b>Puntos de venta</b> y haz clic en <b>«Nuevo punto de venta»</b>.',
        '<b>Código</b> (no se puede cambiar después) y <b>Nombre</b>.',
        '<b>Regional</b> y <b>Materiales</b>' + (
            ' y <b>Categoría</b> (A, B o C)' if c['clave'] == 'hc' else '')
        + '. Pueden quedar vacíos si todavía no los conoces.',
    ]
    if c['clave'] == 'claro':
        pasos.append(
            'El interruptor <b>«Tiene asesor»</b> viene encendido: apágalo si el punto no tiene '
            'asesor.'
        )
    pasos.append('Haz clic en <b>«Crear»</b>.')
    g.pasos(pasos)
    g.p(
        'Para crear o actualizar muchos a la vez, usa la plantilla de Excel. Un punto solo se '
        'puede eliminar si no tiene ventas registradas.'
    )


def metas(g: Guia, c):
    g.h1('Metas')
    if c['meta_por_punto']:
        g.p(
            'En Homecenter la meta es <b>lo que debe vender cada tienda en el mes, en pesos</b>. '
            'Hay una meta por tienda y por mes. Sin meta, la tienda no tiene cumplimiento que '
            'medir.'
        )
        g.pasos([
            'Entra a <b>Metas</b> y haz clic en <b>«Nueva meta»</b>.',
            'Elige el <b>punto de venta</b> y el <b>mes</b>.',
            'Escribe la <b>meta en pesos</b>, sin decimales.',
            'Guarda. Para cargar todas las tiendas a la vez, usa la plantilla: una fila por tienda '
            'y mes (la fecha solo dice de qué mes es; sirve cualquier día del mes).',
        ])
    else:
        g.p(
            'La meta es el objetivo <b>de cada producto en cada punto de venta, en unidades</b>. '
            'Es lo único que se guarda: la app calcula cuánto vale en pesos con el precio Coltrade '
            'del mes' + (' y en puntos con el puntaje del producto.' if c['con_puntos'] else '.')
        )
        g.pasos([
            'Entra a <b>Metas</b> y haz clic en <b>«Nueva meta»</b>.',
            'Elige el <b>producto</b> y el <b>punto de venta</b>.',
            'En <b>Periodo de la meta</b> pon una fecha del mes (por ejemplo, el día 1).',
            'Escribe la <b>meta de unidades</b>. La app te muestra a cuánto equivale en dinero'
            + (' y en puntos' if c['con_puntos'] else '') + '.',
            'Guarda. Para cargar el mes completo, usa la plantilla de Excel: una fila por '
            'producto y punto.',
        ])
        g.p(
            'Hay una sola meta por producto, punto y periodo. Cambiando la fecha cargas la meta de '
            'otro mes sin pisar la anterior.'
        )
    g.p(
        'En el listado de Metas puedes filtrar por periodo, punto de venta, regional'
        + ('' if c['meta_por_punto'] else ', producto, marca')
        + ' y rango de valor, y ver arriba cuántas metas hay cargadas y cuánto suman.'
    )
    if c['clave'] == 'claro':
        g.importante(
            'En Claro, la meta va primero',
            'Al importar ventas solo entran las de productos que tienen meta ese mes en ese punto '
            '(más los productos del plan Recomiéndame Belkin). Por eso, al empezar el mes, carga '
            'las metas <b>antes</b> de importar las ventas.',
        )
    elif c['clave'] in ('tmk', 'falabella'):
        g.consejo(
            'Las ventas sin meta también cuentan',
            f'En {c["canal"]} entra toda venta de un producto que exista, tenga meta o no. Pero '
            'sin meta no hay contra qué medir: carga las metas del mes para que el cumplimiento '
            'tenga sentido.',
        )


def listado_ventas(g: Guia, c):
    g.h2('El listado de ventas')
    g.p(
        'En <b>Ventas</b> ves qué producto se vendió, en qué punto, cuándo y cuántas unidades. '
        'Puedes buscar por código o nombre, filtrar por fechas, punto, producto, regional y '
        'marca, y arriba ves cuántos registros, unidades e importe suman.'
    )
    g.vinetas([
        '<b>Nueva venta:</b> para registrar una venta suelta a mano (producto, punto, fecha y '
        'cantidad). El total se calcula con el precio Coltrade de ese día.',
        '<b>Editar o eliminar</b> una venta: con los íconos de la fila.',
        '<b>Exportar Excel:</b> baja todas las ventas que estás filtrando (no solo la página).',
        '<b>Descargar plantilla / Importar Excel:</b> para cargar muchas ventas de un archivo '
        'propio.',
    ])
    g.cuidado(
        '«Eliminar todo» borra el histórico completo',
        'Ese botón elimina todas las ventas del canal y el tablero queda en cero. No se puede '
        'deshacer. Úsalo solo si de verdad quieres empezar de nuevo.',
    )


def listado_inventario(g: Guia, c):
    g.h2('El listado de inventario')
    g.p(
        'En <b>Inventario</b> hay una fila por producto en cada punto de venta. Arriba ves los '
        'registros, las unidades en stock, el valor del inventario a precio Coltrade y cuántos '
        'están agotados. Puedes filtrar por punto, producto, regional, marca, materiales, con o '
        'sin stock y rango de unidades.'
    )
    g.p(
        'Con <b>«Nuevo registro»</b> cargas o corriges el stock de un producto en un punto (cero '
        'significa agotado). Solo puede haber un registro por producto y punto.'
    )


# ── Ventas e inventario: lo propio de cada canal ───────────────────────────


def importar_erp(g: Guia, c):
    tmk = c['clave'] == 'tmk'
    g.h1('Ventas e inventario: el informe del ERP')
    g.p(
        'La forma normal de cargar las ventas y el inventario es el <b>«Informe Inventarios '
        'Tecnología Coltrade»</b>, el Excel que sale del ERP. Trae ventas e inventario mezclados '
        'y muchas columnas: no tienes que tocar nada, la app toma sola lo que le sirve.'
    )
    g.h2('Paso a paso')
    g.pasos([
        'En el tablero, haz clic en <b>«Importar»</b>. (Necesitas los permisos de ventas e '
        'inventario.)',
        'Elige el archivo del ERP tal como sale, sin modificarlo, <b>o</b> haz clic en '
        '<b>«Traer del correo»</b>: la app busca el último informe que llegó al buzón de '
        'informes y lo deja elegido.',
        'En <b>«Mes al que van las ventas»</b> elige el mes. Si trajiste el informe del correo, '
        'la app propone el mes de la fecha del archivo; puedes cambiarlo (por ejemplo, para '
        'cargar el mes pasado).',
        'Elige qué hacer con las ventas que ya están cargadas: <b>Completar</b> o '
        '<b>Sobrescribir</b> (ver abajo).',
        'Haz clic en <b>«Importar»</b> y espera: el archivo trae miles de filas.'
        + (' Si el archivo vende productos que no existen en la app, antes de cargar aparece la '
           'pantalla para elegir cuáles crear (ver la sección siguiente).' if tmk else ''),
        'Al terminar aparece el resumen: qué entró y qué no, y por qué.',
    ])
    g.h2('¿Completar o Sobrescribir?')
    g.tabla(
        ['Opción', 'Qué hace', 'Cuándo usarla'],
        [
            ['<b>Completar</b>',
             'Respeta los días que ya tienen ventas cargadas y solo llena los días vacíos.',
             'Lo normal: subir el informe cada día o cada tanto para agregar lo que falta.'],
            ['<b>Sobrescribir</b>',
             'Borra <b>todas</b> las ventas del mes elegido y deja únicamente lo que trae el '
             'archivo.',
             'Cuando el informe corrige días ya cargados'
             + (', o cuando creaste productos nuevos y quieres que entren sus ventas de días ya '
                'cargados.' if tmk else '.')],
        ],
        [0.8, 1.6, 1.6],
    )
    g.cuidado(
        'Sobrescribir no se puede deshacer',
        'Aunque el archivo solo traiga hasta la mitad del mes, el resto del mes queda en cero. '
        'Usa Sobrescribir con un informe completo del mes.',
    )
    g.h2('Qué toma la app del archivo')
    reglas = [
        'Solo el mes que elegiste: las ventas de otros meses se ignoran.',
        'Cada fila del archivo es <b>una unidad</b> (el ERP lista serial por serial): la app '
        'cuenta las filas de cada producto, punto y día.',
        'Solo las ventas normales (movimiento 601) y el inventario (movimiento 1). Los demás '
        'movimientos, como el 601A, se ignoran.',
    ]
    if c['clave'] == 'claro':
        reglas += [
            'Solo entran las ventas de productos que tienen <b>meta ese mes en ese punto</b>, y '
            'las de los productos del plan Recomiéndame Belkin. Sube primero las metas del mes.',
            'Los productos y puntos de venta que no existen en la app se omiten: este informe no '
            'crea catálogo.',
            'Las ventas de productos del plan Belkin en puntos fuera de Coltrade pasan solas al '
            'Plan Recomiéndame Belkin, con el mismo mes y el mismo modo.',
        ]
    else:
        reglas += [
            'Entran <b>todas</b> las ventas de productos que existan en Tmk, <b>tengan meta o '
            'no</b>.',
            'Los puntos de venta que no existen en Tmk se omiten. Los productos que faltan se te '
            'muestran para que elijas cuáles crear.',
        ]
    reglas.append(
        'El <b>inventario se reemplaza completo</b> con la foto del archivo. Si el archivo no trae '
        'inventario, el que había se deja intacto.'
    )
    g.vinetas(reglas)
    g.h2('Cómo leer el resumen')
    filas = [
        ['Registros creados / Unidades', 'Lo que entró.'],
        ['Omitidos: su día ya tenía ventas',
         'En modo Completar, ventas de días que ya estaban cargados.'],
        ['Omitidos: de otro mes', 'Ventas de fechas que no son del mes elegido.'],
        ['Omitidos: producto no está en la app',
         'El código de material no existe en la app' + (
             ' (y no lo elegiste para crear).' if tmk else '. Créalo y vuelve a importar.')],
        ['Omitidos: punto de venta no está en la app',
         'El centro no existe en la app. Créalo y vuelve a importar.'],
    ]
    if c['clave'] == 'claro':
        filas.insert(4, ['Omitidos: sin meta ese mes en ese punto',
                         'El producto no tiene meta. Carga la meta y vuelve a importar.'])
    filas += [
        ['Días cargados / Días que ya tenían datos',
         'Qué días se llenaron y cuáles se respetaron.'],
        ['Inventario', 'Registros creados, unidades en stock y registros reemplazados.'],
    ]
    if c['clave'] == 'claro':
        filas.append(['Plan Recomiéndame Belkin',
                      'Lo que pasó al plan desde los puntos fuera de Coltrade.'])
    if tmk:
        filas.insert(0, ['Productos nuevos',
                         'Cuántos productos se crearon, cuántos quedaron en $0 y si se creó '
                         'alguna marca.'])
    g.tabla(['Lo que dice', 'Qué significa'], filas, [1.4, 2.4])
    if tmk:
        crear_productos_tmk(g)
    listado_ventas(g, c)
    listado_inventario(g, c)
    g.p(
        'El inventario de este canal normalmente llega con el informe del ERP, así que no hace '
        'falta cargarlo aparte. La plantilla de inventario sirve para correcciones puntuales.'
    )


def crear_productos_tmk(g: Guia):
    g.h2('Cuando el informe trae productos que no existen en Tmk')
    g.p(
        'Si el archivo vende en Tmk productos que todavía no están en la app, antes de guardar '
        'nada la app te muestra una tabla para que elijas cuáles crear. Así esas ventas entran '
        'aunque el producto no tenga meta.'
    )
    g.pasos([
        'Revisa la lista. Cada producto viene <b>marcado</b>, con su código, el nombre que trae '
        'el ERP (puedes corregirlo), la marca y las unidades que entran con él.',
        'Desmarca los que no quieras crear. Con la casilla del encabezado marcas o desmarcas '
        'todos.',
        'Escribe el <b>precio Coltrade</b> de cada uno, en pesos y sin puntos. Ese mismo valor '
        'queda como precio Tmk. Si no lo sabes, déjalo vacío.',
        'Haz clic en <b>«Crear N productos e importar»</b>. O en <b>«Importar sin crearlos»</b> si '
        'no quieres crear ninguno: sus ventas quedan por fuera.',
    ])
    g.importante(
        'El informe no trae el precio Coltrade',
        'Si dejas el precio vacío, el producto queda en $0: sus ventas cuentan en unidades pero no '
        'en dinero. Ponle el precio después en Productos y el tablero se corrige solo.',
    )
    g.vinetas([
        'Crear productos pide el permiso <b>Editar productos y precios</b>. Sin él, solo puedes '
        'importar sin crearlos.',
        'La marca se busca en la lista de marcas («AIWA» queda como «Aiwa»). Si no existe, se '
        'crea con el producto.',
        'Solo se ofrecen productos vendidos en el mes elegido, en puntos de Tmk, y en días que '
        'la importación va a cargar. En modo <b>Completar</b>, los días que ya tenían ventas no '
        'se tocan; si quieres traer todo el mes con los productos nuevos, usa '
        '<b>Sobrescribir</b>.',
    ])


def importar_hc(g: Guia, c):
    g.h1('Ventas e inventario: los reportes de Homecenter')
    g.p(
        'Las ventas y el inventario llegan de los reportes que se descargan del <b>portal de '
        'Homecenter</b>, en Excel (.xlsx). Se suben tal como se descargan, desde el botón '
        '<b>«Importar»</b> del tablero.'
    )
    g.h2('Cargar las ventas')
    g.pasos([
        'En el tablero, haz clic en <b>«Importar»</b> y elige <b>Ventas</b>.',
        'Elige el reporte de ventas del portal. La app usa las columnas «Fecha», «Código SKU», '
        '«EAN Tienda», «Unidades Vendidas» y «Canal».',
        'La app lee el archivo y te muestra sus <b>canales</b> (Tienda, Web, App…) con cuántas '
        'ventas y unidades trae cada uno. Deja marcados los que quieres cargar (botones «Todos» '
        'y «Ninguno»).',
        '<b>«Quitar ventas de Venta Distancia»</b> viene encendido: las ventas de la tienda '
        '7703670900993 o sin EAN de tienda no se cargan. Apágalo si sí las quieres.',
        'Haz clic en <b>«Importar»</b>.',
        'Si el archivo trae productos o tiendas que no existen, verás cómo quedarían y podrás '
        'elegir <b>«Crear e importar»</b>, <b>«Importar sin crearlos»</b> o cancelar.',
        'Si alguno de los días ya tenía ventas, la app te pregunta si quieres '
        '<b>sobrescribirlos</b>. Si dices que sí, se borran las ventas de esos días (de todos los '
        'canales) y quedan las del archivo.',
    ])
    g.p('Solo entran las ventas de 1 unidad o más. Al final verás un resumen con lo que entró y '
        'lo que no.')
    g.h2('Cargar el inventario')
    g.pasos([
        'En el tablero, haz clic en <b>«Importar»</b> y elige <b>Inventario</b>.',
        'Elige el reporte de inventario del portal. La app usa «Fecha», «Código SKU», «EAN '
        'Ubicación» e «Inventario Unidades Tienda»; para crear productos usa también «EAN 13 '
        'Calculado», «Referencia Proveedor», «Descripción SKU» y «Marca».',
        'Haz clic en <b>«Importar»</b> y decide si crear los productos o tiendas que falten.',
    ])
    g.cuidado(
        'Se reemplaza todo el inventario',
        'Quedan solo los registros del día más reciente del archivo, con 1 unidad o más en '
        'tienda. Las filas sin EAN Ubicación van a la tienda 7703670900993.',
    )
    g.importante(
        'Productos creados desde el inventario quedan en precio 0',
        'El reporte no trae su valor. En el resumen (y en Productos, con el botón «Productos sin '
        'precio») puedes bajar la plantilla de esos productos, ponerles el precio Coltrade y el '
        'precio Homecenter, y subirla con «Importar Excel».',
    )
    g.h2('El «Querie» (otra forma de cargar)')
    g.p(
        'En los listados de <b>Ventas</b> e <b>Inventario</b> hay un botón <b>«Querie»</b> para '
        'subir el querie del portal de Homecenter. Funciona parecido: en ventas pregunta antes de '
        'sobrescribir días que ya tienen datos, y en inventario reemplaza todo con el día más '
        'reciente del archivo. Usa el que te llegue; el resultado en el tablero es el mismo.'
    )
    listado_ventas(g, c)
    listado_inventario(g, c)


def importar_falabella(g: Guia, c):
    g.h1('Ventas e inventario: los reportes de Falabella')
    g.p(
        'Las ventas y el inventario llegan de los reportes que se descargan del <b>portal de '
        'Falabella</b>, en formato .csv. Se suben tal como se descargan, desde el botón '
        '<b>«Importar»</b> del tablero.'
    )
    g.h2('Cargar las ventas: reporte «Ventas diarias»')
    g.pasos([
        'En el tablero, haz clic en <b>«Importar»</b> y elige <b>Ventas</b>.',
        'Elige el .csv. La app usa «SKU», «ID Local», «Fecha» y «Unidades»; para crear productos, '
        '«Producto», «Marca» y «Venta neta»; para crear tiendas, «Local».',
        'Haz clic en <b>«Importar»</b>.',
        'Si el archivo trae productos o tiendas que no existen, verás cómo quedarían y podrás '
        'elegir <b>«Crear e importar»</b>, <b>«Importar sin crearlos»</b> o cancelar.',
        'Si algún día ya tenía ventas, la app pregunta si quieres <b>sobrescribirlo</b>: se borran '
        'las de esos días y quedan las del archivo.',
    ])
    g.vinetas([
        'Se cargan <b>todos los días</b> del archivo.',
        'Solo las filas con 1 unidad o más (las devoluciones y ajustes en 0 o negativo no '
        'entran).',
        'Entran las ventas <b>tengan meta o no</b>.',
        'Las ventas de <b>Falabella.com</b> no se cargan.',
    ])
    g.h2('Cargar el inventario: reporte «Análisis semanal»')
    g.pasos([
        'En el tablero, haz clic en <b>«Importar»</b> y elige <b>Inventario</b>.',
        'Elige el .csv. La app usa «ID Producto», «ID Local» y «Stock Disponible»; para crear '
        'productos, «Producto», «Marca» y «Stock a costo Disponible»; para crear tiendas, '
        '«Local».',
        'Haz clic en <b>«Importar»</b> y decide si crear lo que falte.',
    ])
    g.cuidado(
        'Se reemplaza todo el inventario',
        'Se borran los registros actuales y quedan los del archivo, solo con 1 unidad o más de '
        'stock disponible y sin Falabella.com.',
    )
    g.h2('Cómo quedan los productos y tiendas que se crean')
    g.vinetas([
        '<b>Producto:</b> con el nombre y la marca del reporte. El precio (Falabella y Coltrade) '
        'es la venta neta de una unidad; en el inventario, el costo. La marca se busca en la '
        'lista sin importar mayúsculas ni tildes («SONY» es «Sony»); si no está, se crea.',
        '<b>Tienda:</b> con el «ID Local» y el «Local» del reporte, regional Nacional y todos los '
        'materiales. Si el archivo no trae el nombre del local, no se crea.',
        'Revisa después los precios en Productos: el precio Coltrade real puede ser distinto a la '
        'venta neta.',
    ])
    listado_ventas(g, c)
    listado_inventario(g, c)


def compartir(g: Guia, c):
    g.h1('Compartir el tablero con alguien sin cuenta')
    g.p(
        'Con el permiso <b>Compartir este tablero</b> ves el botón <b>«Compartir»</b>. Genera un '
        'enlace de solo lectura, con contraseña: quien lo abra ve las hojas del tablero sin '
        'cuenta, sin descargar y sin editar nada.'
    )
    g.pasos([
        'En el tablero, haz clic en <b>«Compartir»</b>.',
        'En <b>«Para quién es»</b> escribe un nombre para reconocerlo (Gerencia, Regional Norte…). '
        'Es lo que ve quien abre el enlace.',
        'Elige cuándo <b>vence</b>: No vence, 1 día, 7 días o 30 días.',
        'Haz clic en <b>«Generar enlace»</b> y copia el enlace y la contraseña.',
    ])
    g.importante(
        'La contraseña se muestra una sola vez',
        'Guárdala o envíala en ese momento. Por seguridad, manda el enlace y la contraseña por '
        'canales distintos (por ejemplo, el enlace por correo y la contraseña por chat).',
    )
    g.p(
        'En la misma ventana ves los enlaces creados. Con el interruptor lo <b>revocas</b> '
        '(deja de '
        'abrir) o lo reactivas; con <b>«Nueva contraseña»</b> cambias la clave sin cambiar el '
        'enlace; y con la papelera lo eliminas para siempre.'
    )


def rutina(g: Guia, c):
    g.h1('Rutina recomendada')
    inicio = [
        'Revisa si hay productos nuevos o cambios de precio y regístralos (precios por periodo).',
        'Revisa que estén todos los puntos de venta y con su regional.',
        'Carga las <b>metas del mes</b>.',
    ]
    if c['con_concurso']:
        inicio.append('Si arranca una campaña del concurso, revisa sus reglas y fechas.')
    if c['clave'] in ('claro', 'tmk'):
        diario = [
            'Haz clic en <b>«Importar»</b> y luego en <b>«Traer del correo»</b>; revisa el '
            'mes y deja '
            '<b>Completar</b>.',
            'Lee el resumen: si algo quedó por fuera, corrige la causa (producto, punto'
            + (', meta' if c['clave'] == 'claro' else '') + ') y vuelve a importar.',
            'Mira «Cumplimiento diario» del día anterior y los puntos que van atrasados.',
        ]
    elif c['clave'] == 'hc':
        diario = [
            'Descarga del portal de Homecenter los reportes de ventas e inventario.',
            'Súbelos con «Importar» y revisa el resumen y los productos que quedaron sin precio.',
            'Mira «Cumplimiento diario» del día anterior.',
        ]
    else:
        diario = [
            'Descarga del portal de Falabella «Ventas diarias» y «Análisis semanal».',
            'Súbelos con «Importar» y revisa el resumen.',
            'Mira «Cumplimiento diario» del día anterior.',
        ]
    cierre = ['Si el último informe del mes corrige días ya cargados, vuelve a cargar el mes '
              'completo' + (' con Sobrescribir.' if c['clave'] in ('claro', 'tmk') else '.'),
              'Descarga el Excel del mes («Descargar mes») para tu archivo.']
    g.tabla(
        ['Cuándo', 'Qué hacer'],
        [
            ['<b>Al empezar el mes</b>', '<br/>'.join(f'• {t}' for t in inicio)],
            ['<b>Cada día (o cuando llegue el informe)</b>',
             '<br/>'.join(f'• {t}' for t in diario)],
            ['<b>Al cerrar el mes</b>', '<br/>'.join(f'• {t}' for t in cierre)],
        ],
        [1, 3],
    )


def preguntas(g: Guia, c):
    g.h1('Preguntas frecuentes')
    pr = []
    if c['clave'] == 'claro':
        pr.append((
            'Importé el informe y no veo una venta. ¿Qué pasó?',
            'Revisa el resumen de la importación. Las causas más comunes: el producto no tiene '
            'meta ese mes en ese punto, el producto o el punto no existen en la app, o su día ya '
            'tenía ventas y estabas en modo Completar.',
        ))
    elif c['clave'] == 'tmk':
        pr.append((
            'Importé el informe y no veo una venta. ¿Qué pasó?',
            'Revisa el resumen. Puede que el producto no exista y no lo hayas elegido para crear, '
            'que el punto no sea de Tmk, o que su día ya tuviera ventas y estuvieras en '
            'Completar. Para traer todo el mes de nuevo, usa Sobrescribir.',
        ))
        pr.append((
            'Creé un producto nuevo y sus ventas salen en $0.',
            'Lo creaste sin precio. Entra a Productos, edítalo y ponle el precio Coltrade: el '
            'tablero se recalcula solo.',
        ))
    else:
        pr.append((
            'Importé el reporte y faltan ventas.',
            'Revisa el resumen: «Lo que no entró» dice cuántas filas quedaron fuera y por qué '
            '(producto o tienda que no existe, 0 unidades'
            + (', Falabella.com' if c['clave'] == 'falabella' else ', canales no marcados o Venta '
               'Distancia') + ').',
        ))
    pr += [
        ('El tablero dice «Este mes está en blanco».',
         'No hay metas ni ventas cargadas en ese mes. Prueba otro mes con las flechas o carga los '
         'datos.'),
        ('El cumplimiento sale en 0 % aunque hay ventas.',
         'Falta cargar las metas del mes: sin meta no hay contra qué medir.'),
        ('Cambié un precio y cambió lo vendido en meses pasados.',
         'Cambiaste el precio base. Para cambios de precio usa «Precios por periodo»: así cada '
         'venta conserva el precio de su día.'),
        ('Subí la plantilla de ventas dos veces.',
         'Cada fila de esa plantilla es una venta nueva, así que quedaron duplicadas. Bórralas '
         'desde el listado'
         + (' o vuelve a cargar el mes con el informe del ERP en modo Sobrescribir.'
            if c['clave'] in ('claro', 'tmk') else '.')),
        ('No veo el botón para importar o editar.',
         'Tu usuario no tiene ese permiso. Pídele a un administrador el permiso que necesitas '
         '(ver la sección «Cómo entrar y qué puedes hacer»).'),
        ('¿Puedo deshacer «Sobrescribir» o «Eliminar todo»?',
         'No. Por eso la app te avisa antes. Si pasa, vuelve a cargar la información desde el '
         'archivo original.'),
    ]
    for pregunta, respuesta in pr:
        g.h2(pregunta)
        g.p(respuesta)


# ── Armar cada guía ─────────────────────────────────────────────────────────


def guia_canal(c) -> bytes:
    g = Guia(c['titulo'], c['subtitulo'], c['acento'])
    secciones = [
        '¿Qué es este informe?', 'Cómo entrar y qué puedes hacer', 'Palabras que vas a ver',
        'El tablero: «Avance del mes»', 'El detalle de un punto de venta',
        '«Cumplimiento diario»',
    ]
    if c['con_concurso']:
        secciones.append('«Concurso de tickets»')
    secciones += ['Cómo se mantiene al día la información', 'Productos y precios',
                  'Puntos de venta', 'Metas', 'Ventas e inventario', 'Compartir el tablero',
                  'Rutina recomendada', 'Preguntas frecuentes']
    g.indice(secciones)
    que_es(g, c)
    entrar_y_permisos(g, c)
    glosario(g, c)
    avance_del_mes(g, c)
    detalle_punto(g, c)
    cumplimiento_diario(g, c)
    if c['con_concurso']:
        concurso(g, c)
    como_se_actualiza(g, c)
    productos(g, c)
    puntos_de_venta(g, c)
    metas(g, c)
    {'claro': importar_erp, 'tmk': importar_erp, 'hc': importar_hc,
     'falabella': importar_falabella}[c['clave']](g, c)
    compartir(g, c)
    rutina(g, c)
    preguntas(g, c)
    return g.pdf()
