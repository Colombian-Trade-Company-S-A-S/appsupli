"""Estilo común de las guías de BI Trade Marketing: fuentes, colores, bloques y páginas."""
import os
from io import BytesIO

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    CondPageBreak,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

#: Las fuentes Vera vienen dentro de reportlab: están igual en Windows y en el
#: servidor, sin instalar nada. Tienen las tildes, la ñ, «» y ¿¡, pero no la
#: flecha «→»: el texto de las guías no la usa.
FUENTES = os.path.join(os.path.dirname(reportlab.__file__), 'fonts')
for nombre, archivo in (
    ('Guia', 'Vera.ttf'),
    ('Guia-Bold', 'VeraBd.ttf'),
    ('Guia-Italic', 'VeraIt.ttf'),
    ('Guia-BoldItalic', 'VeraBI.ttf'),
):
    pdfmetrics.registerFont(TTFont(nombre, os.path.join(FUENTES, archivo)))
pdfmetrics.registerFontFamily(
    'Guia', normal='Guia', bold='Guia-Bold', italic='Guia-Italic', boldItalic='Guia-BoldItalic'
)

APP = 'BI Trade Marketing'
TINTA = colors.HexColor('#1F2937')
GRIS = colors.HexColor('#6B7280')
LINEA = colors.HexColor('#E5E7EB')
FONDO = colors.HexColor('#F9FAFB')
AMBAR = colors.HexColor('#B45309')
AMBAR_FONDO = colors.HexColor('#FEF3C7')
ROJO = colors.HexColor('#B91C1C')
ROJO_FONDO = colors.HexColor('#FEE2E2')

ANCHO, ALTO = letter
MARGEN = 2 * cm
UTIL = ANCHO - 2 * MARGEN


def tinte(color, cuanto=0.88):
    """El color mezclado con blanco: fondos suaves del acento."""
    return colors.Color(
        color.red + (1 - color.red) * cuanto,
        color.green + (1 - color.green) * cuanto,
        color.blue + (1 - color.blue) * cuanto,
    )


class Guia:
    """Arma un PDF: portada con franja, secciones numeradas y bloques de ayuda."""

    def __init__(self, titulo, subtitulo, acento):
        self.titulo = titulo
        self.subtitulo = subtitulo
        self.acento = colors.HexColor(acento)
        self.historia = []
        self.seccion = 0
        base = {'fontName': 'Guia', 'textColor': TINTA, 'alignment': TA_LEFT}
        self.e = {
            'p': ParagraphStyle('p', fontSize=10.5, leading=15.5, spaceAfter=7, **base),
            'pchico': ParagraphStyle('pchico', fontSize=9.5, leading=13.5, **base),
            'celda': ParagraphStyle('celda', fontSize=9.5, leading=13, **base),
            'celda_t': ParagraphStyle(
                'celda_t', fontSize=9.5, leading=13, fontName='Guia-Bold', textColor=TINTA
            ),
            'h1': ParagraphStyle(
                'h1', fontSize=17, leading=22, fontName='Guia-Bold', textColor=TINTA,
                spaceBefore=16, spaceAfter=8,
            ),
            'h2': ParagraphStyle(
                'h2', fontSize=12.5, leading=17, fontName='Guia-Bold', textColor=self.acento,
                spaceBefore=10, spaceAfter=5,
            ),
            'vineta': ParagraphStyle(
                'vineta', fontSize=10.5, leading=15, leftIndent=14, bulletIndent=2,
                spaceAfter=3, **base,
            ),
            'indice': ParagraphStyle('indice', fontSize=10, leading=15, **base),
        }

    # ── Bloques ─────────────────────────────────────────────────────────────

    def h1(self, texto):
        self.seccion += 1
        numero = f'<font color="{self.acento.hexval().replace("0x", "#")}">{self.seccion}.</font>'
        # Un título nunca queda solo al final de la página: si no caben él y el comienzo
        # de lo que sigue, salta a la siguiente. Sin llevarse una tabla larga entera.
        self.historia.append(CondPageBreak(4.5 * cm))
        self.historia.append(Paragraph(f'{numero} {texto}', self.e['h1']))

    def h2(self, texto):
        self.historia.append(CondPageBreak(3.2 * cm))
        self.historia.append(Paragraph(texto, self.e['h2']))

    def p(self, texto):
        self.historia.append(Paragraph(texto, self.e['p']))

    def vinetas(self, items):
        for item in items:
            self.historia.append(Paragraph(item, self.e['vineta'], bulletText='•'))
        self.historia.append(Spacer(1, 5))

    def pasos(self, items):
        """Pasos numerados: el número en un recuadro del color del informe."""
        filas = []
        for i, item in enumerate(items, 1):
            filas.append(
                [
                    Paragraph(
                        f'<font color="white"><b>{i}</b></font>',
                        ParagraphStyle('n', fontName='Guia-Bold', fontSize=10, leading=12,
                                       alignment=1),
                    ),
                    Paragraph(item, self.e['celda']),
                ]
            )
        tabla = Table(filas, colWidths=[0.7 * cm, UTIL - 0.7 * cm])
        estilo = [
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (1, 0), (1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]
        for fila in range(len(filas)):
            estilo.append(('BACKGROUND', (0, fila), (0, fila), self.acento))
        tabla.setStyle(TableStyle(estilo))
        self.historia.append(tabla)
        self.historia.append(Spacer(1, 8))

    def _recuadro(self, titulo, texto, color, fondo):
        contenido = [Paragraph(f'<b>{titulo}</b>', ParagraphStyle(
            't', fontName='Guia-Bold', fontSize=10, leading=14, textColor=color))]
        textos = texto if isinstance(texto, list) else [texto]
        for t in textos:
            contenido.append(Paragraph(t, self.e['pchico']))
        tabla = Table([[contenido]], colWidths=[UTIL])
        tabla.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), fondo),
            ('LINEBEFORE', (0, 0), (0, -1), 3, color),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ]))
        self.historia.append(KeepTogether([tabla, Spacer(1, 9)]))

    def consejo(self, titulo, texto):
        self._recuadro(titulo, texto, self.acento, tinte(self.acento, 0.9))

    def importante(self, titulo, texto):
        self._recuadro(titulo, texto, AMBAR, AMBAR_FONDO)

    def cuidado(self, titulo, texto):
        self._recuadro(titulo, texto, ROJO, ROJO_FONDO)

    def tabla(self, encabezados, filas, anchos):
        datos = [[Paragraph(h, self.e['celda_t']) for h in encabezados]]
        for fila in filas:
            datos.append([Paragraph(c, self.e['celda']) for c in fila])
        total = sum(anchos)
        tabla = Table(datos, colWidths=[UTIL * a / total for a in anchos], repeatRows=1)
        tabla.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), tinte(self.acento, 0.85)),
            ('LINEBELOW', (0, 0), (-1, 0), 1, self.acento),
            ('LINEBELOW', (0, 1), (-1, -1), 0.5, LINEA),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        self.historia.append(tabla)
        self.historia.append(Spacer(1, 10))

    def salto(self):
        self.historia.append(PageBreak())

    def indice(self, secciones):
        """«En esta guía»: la lista de secciones, en dos columnas, en la portada."""
        mitad = (len(secciones) + 1) // 2
        color = self.acento.hexval().replace('0x', '#')

        def col(items, desde):
            return [
                Paragraph(f'<font color="{color}"><b>{desde + i}.</b></font> {t}', self.e['indice'])
                for i, t in enumerate(items)
            ]

        izquierda, derecha = col(secciones[:mitad], 1), col(secciones[mitad:], mitad + 1)
        filas = [
            [izquierda[i] if i < len(izquierda) else '', derecha[i] if i < len(derecha) else '']
            for i in range(mitad)
        ]
        titulo = Paragraph('<b>En esta guía</b>', ParagraphStyle(
            'ti', fontName='Guia-Bold', fontSize=11, leading=15, textColor=TINTA))
        tabla = Table([[titulo, '']] + filas, colWidths=[UTIL / 2, UTIL / 2])
        tabla.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), FONDO),
            ('BOX', (0, 0), (-1, -1), 0.5, LINEA),
            ('SPAN', (0, 0), (1, 0)),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 10),
        ]))
        self.historia.append(tabla)
        self.historia.append(Spacer(1, 6))

    # ── Páginas ─────────────────────────────────────────────────────────────

    def _portada(self, lienzo, doc):
        lienzo.saveState()
        alto_franja = 5.2 * cm
        lienzo.setFillColor(self.acento)
        lienzo.rect(0, ALTO - alto_franja, ANCHO, alto_franja, stroke=0, fill=1)
        lienzo.setFillColor(colors.white)
        lienzo.setFont('Guia', 10)
        lienzo.drawString(MARGEN, ALTO - 1.5 * cm, f'{APP}  ·  Guía de uso')
        lienzo.setFont('Guia-Bold', 25)
        lienzo.drawString(MARGEN, ALTO - 2.9 * cm, self.titulo)
        lienzo.setFont('Guia', 12)
        lienzo.drawString(MARGEN, ALTO - 3.75 * cm, self.subtitulo)
        lienzo.restoreState()
        self._pie(lienzo, doc)

    def _interior(self, lienzo, doc):
        lienzo.saveState()
        lienzo.setFillColor(self.acento)
        lienzo.rect(0, ALTO - 0.35 * cm, ANCHO, 0.35 * cm, stroke=0, fill=1)
        lienzo.setFillColor(GRIS)
        lienzo.setFont('Guia', 8.5)
        lienzo.drawString(MARGEN, ALTO - 1.1 * cm, f'{APP}  ·  {self.titulo}')
        lienzo.restoreState()
        self._pie(lienzo, doc)

    def _pie(self, lienzo, doc):
        lienzo.saveState()
        lienzo.setStrokeColor(LINEA)
        lienzo.line(MARGEN, 1.45 * cm, ANCHO - MARGEN, 1.45 * cm)
        lienzo.setFillColor(GRIS)
        lienzo.setFont('Guia', 8.5)
        lienzo.drawString(MARGEN, 1 * cm, f'{APP} · Guía de uso · {self.titulo}')
        lienzo.drawRightString(ANCHO - MARGEN, 1 * cm, f'Página {doc.page}')
        lienzo.restoreState()

    def pdf(self) -> bytes:
        """El PDF armado, en memoria: se manda tal cual en la respuesta."""
        salida = BytesIO()
        doc = SimpleDocTemplate(
            salida,
            pagesize=letter,
            leftMargin=MARGEN,
            rightMargin=MARGEN,
            topMargin=1.7 * cm,
            bottomMargin=2 * cm,
            title=f'{self.titulo} · Guía de uso',
            author=APP,
            subject=self.subtitulo,
        )
        doc.build(
            [Spacer(1, 4.2 * cm)] + self.historia,
            onFirstPage=self._portada,
            onLaterPages=self._interior,
        )
        return salida.getvalue()
