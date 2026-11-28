import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PencilIcon, SearchIcon, UserCheckIcon, UserXIcon } from 'lucide-react';
import { useDebounced } from '@/shared/hooks';
import { urlFotoDe, useAuth } from '@/core/auth';
import { cn } from '@/shared/lib/utils';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/components/ui';
import { adminApi, type AdminUserFila } from '../api';
import { useAdminMutation, useAdminUsers, useAreas, usePrecarga } from '../hooks';
import { usePermisosAdmin } from '../permisos';

const TIPOS = { admin: 'Admin', lider: 'Líder', colaborador: 'Colaborador' } as const;
const ESTADOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'inactivos', label: 'Inactivos' },
];

export function UsersTab() {
  const { user: yo } = useAuth();
  const puede = usePermisosAdmin();
  // Con «Ver el listado» se consulta; editar e inactivar pide «Editar usuarios».
  const puedeEditar = puede.editarUsuarios;
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('todos');
  const [area, setArea] = useState('');
  const precargar = usePrecarga();

  const { data: areas = [] } = useAreas();
  // Se busca cuando se deja de escribir, no con cada letra.
  const busquedaEstable = useDebounced(busqueda.trim());
  const { data: usuarios = [], isLoading } = useAdminUsers({
    search: busquedaEstable || undefined,
    is_active: estado === 'todos' ? undefined : estado === 'activos',
    area: area || undefined,
  });

  const alternarActivo = useAdminMutation(
    (id: number) => adminApi.users.toggleActive(id),
    'Estado actualizado',
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, correo o cargo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <Select
          items={[
            { value: '', label: 'Todas las áreas' },
            ...areas.map((a) => ({ value: String(a.id), label: a.name })),
          ]}
          value={area}
          onValueChange={(v) => setArea(v ?? '')}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas las áreas" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="">Todas las áreas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <ToggleGroup
          value={[estado]}
          onValueChange={(v) => setEstado(v[0] ?? 'todos')}
          variant="outline"
        >
          {ESTADOS.map((e) => (
            <ToggleGroupItem key={e.value} value={e.value}>
              {e.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <p className="text-sm text-muted-foreground">
        {puede.esAdmin
          ? 'Las personas llegan y salen con la sincronización de Odoo (pestaña Odoo). Aquí se manejan sus accesos.'
          : puedeEditar
            ? 'Las personas llegan y salen con la sincronización de Odoo. Puedes editar su cuenta; sus accesos los da un administrador.'
            : 'Las personas llegan y salen con la sincronización de Odoo. Toca un nombre para ver su detalle.'}
      </p>

      <Card className="py-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : usuarios.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>Sin resultados</EmptyTitle>
              <EmptyDescription>
                Ajusta la búsqueda o los filtros, o sincroniza con Odoo.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Aplicaciones</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((usuario) => (
                  <FilaUsuario
                    key={usuario.id}
                    usuario={usuario}
                    acciones={puedeEditar}
                    intocable={usuario.isAdmin && !puede.esAdmin}
                    esYo={usuario.id === yo?.id}
                    alternando={alternarActivo.isPending && alternarActivo.variables === usuario.id}
                    onAlternar={alternarActivo.mutate}
                    precargar={precargar}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {usuarios.length} usuario{usuarios.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/**
 * Una persona en la tabla. Va aparte y memorizada: al escribir en el buscador
 * la tabla no se vuelve a dibujar entera con cada letra, solo las filas que
 * cambian. Editar es un botón directo (antes había que abrir un menú) y, al
 * pasar el cursor por él o por el nombre, se adelanta la página que se abre.
 */
const FilaUsuario = memo(function FilaUsuario({
  usuario,
  acciones,
  intocable,
  esYo,
  alternando,
  onAlternar,
  precargar,
}: {
  usuario: AdminUserFila;
  /** Puede editar usuarios: ve los botones. */
  acciones: boolean;
  /** Es administrador y quien mira no: solo otro administrador lo toca. */
  intocable: boolean;
  esYo: boolean;
  alternando: boolean;
  onAlternar: (id: number) => void;
  precargar: ReturnType<typeof usePrecarga>;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className={cn('size-8', usuario.destacado && 'hilo-socio')}>
            <AvatarImage src={urlFotoDe(usuario)} alt="" loading="lazy" />
            <AvatarFallback>{usuario.firstName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <Link
              to={`/inicio/admin/usuarios/${usuario.id}`}
              onPointerEnter={() => precargar.usuario(usuario.id, 'detalle')}
              onFocus={() => precargar.usuario(usuario.id, 'detalle')}
              className="font-medium underline-offset-4 hover:text-primary hover:underline"
            >
              {usuario.fullName}
            </Link>
            <span className="text-xs text-muted-foreground">{usuario.email}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>{usuario.areaName || '—'}</TableCell>
      <TableCell>{usuario.position || '—'}</TableCell>
      <TableCell>
        <Badge variant={usuario.kind === 'admin' ? 'default' : 'secondary'}>
          {TIPOS[usuario.kind]}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {usuario.isAdmin ? 'Todas' : usuario.applicationNames.length || 'Ninguna'}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={usuario.isActive ? 'success' : 'outline'}>
          {usuario.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      </TableCell>
      {acciones && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {intocable ? (
              <Button
                variant="ghost"
                size="icon"
                disabled
                aria-label="Solo otro administrador lo edita"
                title="Solo otro administrador lo edita"
              >
                <PencilIcon />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Editar a ${usuario.fullName}`}
                title="Editar"
                render={<Link to={`/inicio/admin/usuarios/${usuario.id}/editar`} />}
                nativeButton={false}
                onPointerEnter={() => precargar.usuario(usuario.id, 'editar')}
                onFocus={() => precargar.usuario(usuario.id, 'editar')}
              >
                <PencilIcon />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              disabled={esYo || intocable || alternando}
              aria-label={`${usuario.isActive ? 'Inactivar' : 'Activar'} a ${usuario.fullName}`}
              title={usuario.isActive ? 'Inactivar' : 'Activar'}
              className={usuario.isActive ? 'hover:text-destructive' : 'hover:text-emerald-600'}
              onClick={() => onAlternar(usuario.id)}
            >
              {usuario.isActive ? <UserXIcon /> : <UserCheckIcon />}
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
});
