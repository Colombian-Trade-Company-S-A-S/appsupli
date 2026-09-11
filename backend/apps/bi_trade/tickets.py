"""
El concurso de tickets: cuántos gana cada punto de venta y quién participa.

Las reglas viven en la campaña (`Campana`); aquí solo se aplican. Se calcula
día por día y punto por punto, en este orden:

1. **Escala diaria.** Las unidades del día caen en la escala más alta que
   alcancen: con escalas de 10, 12 y 15, trece ventas ganan lo de la de 12.
2. **Doble ticket.** Si ese mismo día se vendieron suficientes productos foco
   —los del concurso, tipo Bluelight o Privacy—, los tickets de la escala se
   duplican.
3. **Bono.** Si además el día llegó a la venta alta con su cuota de cargadores,
   se suman los tickets del bono. Se suman, no reemplazan: en el afiche está
   marcado como «adicional».
4. **Acelerador.** Al final, si el total de la campaña pasó un umbral, cada día
   que ya había ganado tickets suma los del acelerador.

Un día solo cuenta como cumplido si ganó al menos un ticket de escala: el bono
premia un buen día, no crea uno.
"""
from dataclasses import dataclass, field
from datetime import date

from django.db.models import Q, Sum

from .models import Campana, Venta


@dataclass
class DiaTicket:
    """Lo que pasó un día en un punto de venta."""

    fecha: date
    unidades: int
    foco: int
    cargador: int
    tickets_escala: int = 0
    tickets_bono: int = 0
    #: Verdadero si el doble ticket se aplicó ese día.
    duplicado: bool = False

    @property
    def cumplido(self) -> bool:
        return self.tickets_escala > 0

    @property
    def tickets(self) -> int:
        return self.tickets_escala + self.tickets_bono


@dataclass
class FilaTicket:
    """El acumulado de un punto de venta en la campaña."""

    key: str
    label: str
    regional: str
    dias: list[DiaTicket] = field(default_factory=list)
    tickets_acelerador: int = 0
    #: El umbral de acelerador que alcanzó, si alcanzó alguno.
    acelerador_alcanzado: int = 0

    @property
    def unidades(self) -> int:
        return sum(dia.unidades for dia in self.dias)

    @property
    def unidades_foco(self) -> int:
        return sum(dia.foco for dia in self.dias)

    @property
    def unidades_cargador(self) -> int:
        return sum(dia.cargador for dia in self.dias)

    @property
    def dias_cumplidos(self) -> int:
        return sum(1 for dia in self.dias if dia.cumplido)

    @property
    def dias_duplicados(self) -> int:
        return sum(1 for dia in self.dias if dia.duplicado)

    @property
    def tickets_escala(self) -> int:
        return sum(dia.tickets_escala for dia in self.dias)

    @property
    def tickets_bono(self) -> int:
        return sum(dia.tickets_bono for dia in self.dias)

    @property
    def tickets(self) -> int:
        return self.tickets_escala + self.tickets_bono + self.tickets_acelerador


def _tickets_de_escala(escalas: list[tuple[int, int]], unidades: int) -> int:
    """Los tickets de la escala más alta que alcancen esas unidades."""
    ganados = 0
    for minimo, tickets in escalas:
        if unidades >= minimo:
            ganados = tickets
    return ganados


def calcular_tickets(
    campana: Campana, regional: str = '', marca: str = '', punto: str = ''
) -> list[FilaTicket]:
    """
    Aplica las reglas de la campaña a las ventas de su vigencia.

    `marca` acota qué ventas cuentan, no qué productos dan premio: sirve para
    mirar el concurso desde una marca, aunque en el concurso real cuentan
    todas.
    """
    escalas = sorted(campana.escalas.values_list('ventas', 'tickets'))
    aceleradores = sorted(campana.aceleradores.values_list('ventas_totales', 'tickets_por_dia'))
    foco = set(campana.productos_foco.values_list('id_producto', flat=True))
    cargadores = set(campana.productos_cargador.values_list('id_producto', flat=True))

    ventas = Venta.objects.filter(fecha_venta__gte=campana.desde, fecha_venta__lte=campana.hasta)
    if regional:
        ventas = ventas.filter(id_punto_venta__regional=regional)
    if marca:
        ventas = ventas.filter(id_producto__marca=marca)
    if punto:
        ventas = ventas.filter(id_punto_venta=punto)

    # Un solo recorrido a la base: las unidades del día y, con `filter`, las
    # que además son de producto foco o cargador.
    filas = ventas.values(
        'id_punto_venta',
        'id_punto_venta__nombre_pdv',
        'id_punto_venta__regional',
        'fecha_venta',
    ).annotate(
        unidades=Sum('cantidad_vendida'),
        foco=Sum('cantidad_vendida', filter=Q(id_producto__in=foco)),
        cargador=Sum('cantidad_vendida', filter=Q(id_producto__in=cargadores)),
    ).order_by('id_punto_venta', 'fecha_venta')

    por_punto: dict[str, FilaTicket] = {}
    for fila in filas:
        clave = fila['id_punto_venta']
        acumulado = por_punto.setdefault(
            clave,
            FilaTicket(
                key=clave,
                label=fila['id_punto_venta__nombre_pdv'],
                regional=fila['id_punto_venta__regional'] or 'Sin dato',
            ),
        )

        dia = DiaTicket(
            fecha=fila['fecha_venta'],
            unidades=fila['unidades'] or 0,
            foco=fila['foco'] or 0,
            cargador=fila['cargador'] or 0,
        )
        dia.tickets_escala = _tickets_de_escala(escalas, dia.unidades)

        # El doble solo tiene sentido si la escala dio algo que duplicar.
        if campana.foco_minimo and dia.tickets_escala and dia.foco >= campana.foco_minimo:
            dia.tickets_escala *= 2
            dia.duplicado = True

        if (
            campana.bono_tickets
            and dia.unidades >= campana.bono_ventas
            and dia.cargador >= campana.bono_cargadores
        ):
            dia.tickets_bono = campana.bono_tickets

        acumulado.dias.append(dia)

    # El acelerador se resuelve al final: depende del total de la campaña.
    for acumulado in por_punto.values():
        extra_por_dia = 0
        for umbral, extra in aceleradores:
            if acumulado.unidades >= umbral:
                extra_por_dia = extra
                acumulado.acelerador_alcanzado = umbral
        acumulado.tickets_acelerador = extra_por_dia * acumulado.dias_cumplidos

    return sorted(por_punto.values(), key=lambda f: (-f.tickets, -f.unidades, f.label))


def participa(campana: Campana, fila: FilaTicket) -> bool:
    """Si cumple las dos condiciones: ventas totales mínimas y tickets mínimos."""
    return (
        fila.unidades >= campana.ventas_minimas and fila.tickets >= campana.tickets_minimos
    )
