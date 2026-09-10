import { useState } from 'react';
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UserCheckIcon,
  UserXIcon,
} from 'lucide-react';
import { useAuth } from '@/core/auth';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { adminApi, type AdminUser } from '../api';
import { useAdminMutation, useAdminUsers, useAreas } from '../hooks';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { UserDialog } from './UserDialog';

const TIPOS = { admin: 'Admin', lider: 'Líder', colaborador: 'Colaborador' } as const;
const ESTADOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'inactivos', label: 'Inactivos' },
];

export function UsersTab() {
  const { user: yo } = useAuth();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('todos');
  const [area, setArea] = useState('');
  const [editando, setEditando] = useState<AdminUser | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<AdminUser | null>(null);

  const { data: areas = [] } = useAreas();
  const { data: usuarios = [], isLoading } = useAdminUsers({
    search: busqueda || undefined,
    is_active: estado === 'todos' ? undefined : estado === 'activos',
    area: area || undefined,
  });

  const alternarActivo = useAdminMutation(
    (id: number) => adminApi.users.toggleActive(id),
    'Estado actualizado',
  );
  const eliminar = useAdminMutation((id: number) => adminApi.users.remove(id), 'Usuario eliminado');

  const abrirNuevo = () => {
    setEditando(null);
    setDialogoAbierto(true);
  };

  const abrirEdicion = (usuario: AdminUser) => {
    setEditando(usuario);
    setDialogoAbierto(true);
  };

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

        <ToggleGroup value={[estado]} onValueChange={(v) => setEstado(v[0] ?? 'todos')} variant="outline">
          {ESTADOS.map((e) => (
            <ToggleGroupItem key={e.value} value={e.value}>
              {e.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Button onClick={abrirNuevo}>
          <PlusIcon data-icon="inline-start" />
          Nuevo usuario
        </Button>
      </div>

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
              <EmptyDescription>Ajusta la búsqueda o los filtros.</EmptyDescription>
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
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback>
                            {usuario.firstName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">{usuario.fullName}</span>
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
                      {usuario.isAdmin ? (
                        <span className="text-xs text-muted-foreground">Todas</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {usuario.applicationNames.length || 'Ninguna'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={usuario.isActive ? 'success' : 'outline'}>
                        {usuario.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" aria-label="Acciones">
                              <MoreHorizontalIcon />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => abrirEdicion(usuario)}>
                              <PencilIcon />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={usuario.id === yo?.id}
                              onClick={() => alternarActivo.mutate(usuario.id)}
                            >
                              {usuario.isActive ? <UserXIcon /> : <UserCheckIcon />}
                              {usuario.isActive ? 'Inactivar' : 'Activar'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={usuario.id === yo?.id}
                              onClick={() => setPorBorrar(usuario)}
                            >
                              <Trash2Icon />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {usuarios.length} usuario{usuarios.length === 1 ? '' : 's'}
      </p>

      <UserDialog
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        usuario={editando}
      />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar usuario?"
        descripcion={`Se eliminará la cuenta de ${porBorrar?.fullName}. Si solo quieres bloquear el acceso, mejor inactívala.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}
