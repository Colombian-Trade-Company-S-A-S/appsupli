/**
 * Lo que explica la tarjeta de ayuda (el «?») junto a cada app, rol y permiso
 * en Administración. Escrito para quien reparte accesos sin saber de código:
 * qué puede hacer la persona y qué cuidar.
 *
 * Va por código porque los nombres los puede cambiar cualquiera desde la
 * pestaña de aplicaciones. Si un código no está aquí, la tarjeta usa la
 * descripción guardada en la base.
 */
export interface Ayuda {
  /** Qué puede hacer la persona con esto. */
  texto: string;
  /** Algo que conviene saber antes de marcarlo. */
  ojo?: string;
}

export const AYUDA_APPS: Record<string, Ayuda> = {
  admin: {
    texto:
      'Es este panel: aquí se crean usuarios, áreas y roles, y se decide a qué entra cada persona.',
    ojo: 'Solo funciona si la cuenta es de tipo Administrador. Si no lo es, verá la opción en el menú pero no podrá entrar.',
  },
  'bi-trade': {
    texto:
      'Los tableros de ventas de los canales (Claro, Homecenter, Falabella y Tmk): cuánto se ha vendido contra la meta del mes, por regional y por punto de venta.',
    ojo: 'Con esto solo consulta. Para cargar o corregir datos necesita además un rol con el permiso de editar datos de BI Trade.',
  },
  'supli-performance': {
    texto:
      'Es la puerta de entrada que agrupa Objetivos y KPIs y Valoración. Por sí sola no muestra nada.',
    ojo: 'No hace falta marcarla: al darle Objetivos y KPIs o Valoración, aparece sola. Si marcas solo esta, la persona encontrará la sección vacía.',
  },
  'objetivos-kpis': {
    texto:
      'Cada persona ve sus objetivos del mes: qué tiene que lograr, su meta y cómo va. Si tiene personas a cargo, también les pone objetivos y revisa sus resultados.',
    ojo: 'Para ver los objetivos de toda la compañía o abrir el mes de medición necesita un rol de Supli Performance.',
  },
  valoracion: {
    texto:
      'La evaluación de desempeño: la persona responde las evaluaciones que le asignen y ve su resultado cuando se publique. Los líderes ven también los de su equipo.',
    ojo: 'Configurar la evaluación o ver los resultados de todos necesita un rol de valoración.',
  },
  'supli-challenge': {
    texto:
      'Los retos de cultura: la persona ve los retos abiertos, participa con su entrega y sigue el ranking.',
    ojo: 'Crear retos o calificar participaciones necesita un rol de Supli Challenge.',
  },
};

export const AYUDA_ROLES: Record<string, Ayuda> = {
  'performance-people': {
    texto:
      'Para People. Puede poner objetivos a cualquier persona, ver los de toda la compañía y abrir, iniciar y cerrar el mes de medición.',
    ojo: 'Con este rol entra a Objetivos y KPIs aunque no marques la app.',
  },
  'performance-direccion': {
    texto:
      'Para la dirección. Ve los objetivos y resultados de todas las personas, sin poder cambiarlos.',
    ojo: 'Con este rol entra a Objetivos y KPIs aunque no marques la app.',
  },
  'valoracion-people': {
    texto:
      'Para People. Maneja la evaluación de principio a fin: arma las preguntas, lanza los ciclos, ve todos los resultados y decide cuándo se publican.',
    ojo: 'Con este rol entra a Valoración aunque no marques la app.',
  },
  'valoracion-bi-tech': {
    texto:
      'Para quien ajusta cómo se evalúa: cambia las competencias y las preguntas, ve los informes y puede publicar o bloquear los resultados.',
    ojo: 'Con este rol entra a Valoración aunque no marques la app.',
  },
  'valoracion-ceo': {
    texto:
      'Para la dirección. Ve los resultados de todas las personas y los informes, sin poder cambiar nada.',
    ojo: 'Con este rol entra a Valoración aunque no marques la app.',
  },
  'challenge-people': {
    texto:
      'Para People. Crea los retos, los publica, los cierra y responde cuando alguien pide revisar su calificación.',
    ojo: 'Con este rol entra a Supli Challenge aunque no marques la app.',
  },
  'challenge-evaluador': {
    texto: 'Para quien califica las participaciones de los retos, usando la rúbrica de cada reto.',
    ojo: 'Con este rol entra a Supli Challenge aunque no marques la app.',
  },
};

const ADMIN_SIN_EFECTO =
  'Por ahora este permiso no cambia nada: a Administración solo entran las cuentas de tipo Administrador.';

export const AYUDA_PERMISOS: Record<string, Ayuda> = {
  'admin:users:view': { texto: 'Ver la lista de usuarios.', ojo: ADMIN_SIN_EFECTO },
  'admin:users:manage': { texto: 'Crear, editar e inactivar usuarios.', ojo: ADMIN_SIN_EFECTO },
  'admin:areas:manage': {
    texto: 'Crear y editar las áreas de la compañía.',
    ojo: ADMIN_SIN_EFECTO,
  },
  'admin:applications:manage': {
    texto: 'Crear y editar las aplicaciones y sus permisos.',
    ojo: ADMIN_SIN_EFECTO,
  },
  'admin:roles:manage': { texto: 'Crear y editar roles.', ojo: ADMIN_SIN_EFECTO },

  'bi-trade:data:manage': {
    texto:
      'Cargar y corregir los datos de BI Trade: puntos de venta, productos, ventas y metas. Sin este permiso, la persona solo mira los tableros.',
  },

  'performance:objetivos:manage_all': {
    texto:
      'Poner o cambiar objetivos a cualquier persona, no solo a su equipo. También puede cargar y aprobar resultados de cualquiera.',
  },
  'performance:objetivos:view_all': {
    texto: 'Ver los objetivos y resultados de toda la compañía, sin poder cambiarlos.',
  },
  'performance:periodos:manage': {
    texto: 'Abrir el mes de medición, iniciarlo y cerrarlo.',
    ojo: 'Al iniciar el mes, los objetivos quedan congelados: ya no se pueden cambiar.',
  },

  'valoracion:config:manage': {
    texto: 'Cambiar qué se evalúa: las competencias y las preguntas de las evaluaciones.',
  },
  'valoracion:cycles:manage': {
    texto:
      'Lanzar un ciclo de evaluación: decidir quién evalúa a quién y, al final, consolidar las respuestas.',
  },
  'valoracion:results:view_all': {
    texto:
      'Ver el resultado de cualquier persona de la compañía, no solo el propio o el de su equipo.',
  },
  'valoracion:results:publish': {
    texto: 'Decidir cuándo las personas pueden ver sus resultados: los habilita o los bloquea.',
  },
  'valoracion:dashboard:view': {
    texto: 'Ver el dashboard con los gráficos e informes de toda la evaluación.',
  },
  'valoracion:plans:manage': {
    texto: 'Crear y hacer seguimiento a los planes de acción que salen de los resultados.',
  },
  'valoracion:hierarchy:manage': {
    texto: 'Cambiar el cargo y el jefe directo de las personas.',
    ojo: 'De esto depende qué equipo ve cada líder, así que conviene tocarlo con cuidado.',
  },

  'challenge:retos:manage': {
    texto: 'Crear retos, publicarlos, cerrarlos y darlos por terminados.',
  },
  'challenge:valoraciones:crear': {
    texto: 'Calificar las participaciones de los retos con la rúbrica.',
  },
};

/** La ayuda escrita aquí o, si no hay, la descripción que viene de la base. */
export function ayudaDe(
  mapa: Record<string, Ayuda>,
  code: string,
  descripcion?: string,
): Ayuda | undefined {
  return mapa[code] ?? (descripcion ? { texto: descripcion } : undefined);
}
