"""
Motor de cálculo del % de cumplimiento.

Es la traducción del §5 de la especificación técnica. La regla central se
respeta tal cual: **el porcentaje nunca se digita**, lo calcula el backend a
partir del tipo de medición del objetivo. Toda la flexibilidad vive aquí, así
que agregar una forma de medir mañana es agregar un caso, sin tocar el modelo
ni el formulario.

La especificación lo escribió en JavaScript porque estaba pensada para el
proyecto anterior; acá es Python, pero los casos, el tope y el redondeo son los
mismos.
"""
import ast
import operator
from decimal import Decimal, InvalidOperation

from .models import TipoMedicion

#: Lo único que se permite dentro de una fórmula escrita por un usuario.
_OPERACIONES = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

#: Funciones seguras que sirven para topar o acotar una fórmula.
_FUNCIONES = {'min': min, 'max': max, 'abs': abs, 'round': round}

#: Las dos variables con las que se escribe una fórmula.
VARIABLES = ('logrado', 'meta')


class FormulaInvalida(ValueError):
    """La fórmula tiene algo que no se puede evaluar de forma segura."""


def evaluar_formula(formula: str, variables: dict[str, float]) -> float:
    """
    Evalúa una fórmula aritmética con `logrado` y `meta`, y nada más.

    No se usa `eval`: se parsea la expresión y se recorre el árbol permitiendo
    solo números, las dos variables, cuatro funciones y los operadores
    aritméticos. Cualquier otra cosa —una llamada, un atributo, un nombre
    desconocido— es un error, no un riesgo.
    """
    try:
        arbol = ast.parse(formula.strip(), mode='eval')
    except SyntaxError as exc:
        raise FormulaInvalida(f'La fórmula no se entiende: {exc.msg}.') from exc

    def caminar(nodo):
        if isinstance(nodo, ast.Expression):
            return caminar(nodo.body)
        if isinstance(nodo, ast.Constant):
            if isinstance(nodo.value, bool) or not isinstance(nodo.value, int | float):
                raise FormulaInvalida('En una fórmula solo se pueden usar números.')
            return float(nodo.value)
        if isinstance(nodo, ast.Name):
            if nodo.id not in variables:
                permitidas = ', '.join(VARIABLES)
                raise FormulaInvalida(f'«{nodo.id}» no existe. Solo puedes usar: {permitidas}.')
            return float(variables[nodo.id])
        if isinstance(nodo, ast.BinOp) and type(nodo.op) in _OPERACIONES:
            return _OPERACIONES[type(nodo.op)](caminar(nodo.left), caminar(nodo.right))
        if isinstance(nodo, ast.UnaryOp) and type(nodo.op) in _OPERACIONES:
            return _OPERACIONES[type(nodo.op)](caminar(nodo.operand))
        if isinstance(nodo, ast.Call):
            if not isinstance(nodo.func, ast.Name) or nodo.func.id not in _FUNCIONES:
                disponibles = ', '.join(sorted(_FUNCIONES))
                raise FormulaInvalida(f'Solo puedes usar estas funciones: {disponibles}.')
            if nodo.keywords:
                raise FormulaInvalida(
                    'Las funciones de la fórmula no reciben argumentos con nombre.'
                )
            return _FUNCIONES[nodo.func.id](*[caminar(arg) for arg in nodo.args])
        raise FormulaInvalida('La fórmula tiene una expresión que no está permitida.')

    try:
        resultado = caminar(arbol)
    except ZeroDivisionError:
        # Dividir por cero en una fórmula es el mismo caso que abajo: el dato
        # no permite medir, no es un error del sistema.
        return 0.0
    if isinstance(resultado, bool) or not isinstance(resultado, int | float):
        raise FormulaInvalida('La fórmula debe dar un número.')
    return float(resultado)


def _a_float(valor) -> float:
    try:
        return float(valor)
    except (TypeError, ValueError, InvalidOperation):
        return 0.0


def calcular_cumplimiento(objetivo, resultado_ejecutado) -> Decimal:
    """
    El % de cumplimiento de un objetivo dado lo ejecutado.

    Devuelve un `Decimal` con dos decimales, topado según lo que el objetivo
    permita. Nunca es negativo: por debajo de cero se entiende que no se
    cumplió nada.
    """
    logrado = _a_float(resultado_ejecutado)
    meta = _a_float(objetivo.meta_valor)

    if objetivo.tipo_medicion == TipoMedicion.BINARIO:
        pct = 100.0 if logrado >= 1 else 0.0

    elif objetivo.tipo_medicion == TipoMedicion.PROPORCIONAL:
        # Más es mejor. La meta en cero la bloquea la validación del objetivo;
        # el guarda de acá es para no reventar con datos viejos.
        pct = (logrado / meta) * 100 if meta else 0.0

    elif objetivo.tipo_medicion == TipoMedicion.PROPORCIONAL_INVERSO:
        # Menos es mejor (días, costos, tickets). Ejecutar cero es el mejor
        # resultado posible, así que cuenta como cumplimiento pleno en vez de
        # ser una división por cero. Pendiente de confirmar con People.
        pct = (meta / logrado) * 100 if logrado > 0 else 100.0

    elif objetivo.tipo_medicion == TipoMedicion.FORMULA:
        pct = evaluar_formula(objetivo.formula, {'logrado': logrado, 'meta': meta})

    else:
        raise ValueError(f'Tipo de medición no soportado: {objetivo.tipo_medicion}')

    tope = _a_float(objetivo.tope_cumplimiento) or 100.0
    if not objetivo.permite_sobrecumplimiento and pct > tope:
        pct = tope
    if pct < 0:
        pct = 0.0

    return Decimal(f'{pct:.2f}')


def cumplimiento_total(pares) -> Decimal:
    """
    El cumplimiento de una persona en el mes: Σ (peso_i/100 × pct_i).

    `pares` son tuplas `(peso, porcentaje)`. Es lo que alimenta el ranking y el
    Top Performance de la Fase 2.
    """
    total = sum(_a_float(peso) / 100 * _a_float(pct) for peso, pct in pares)
    return Decimal(f'{total:.2f}')
