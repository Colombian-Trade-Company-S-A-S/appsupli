# Supli

Plataforma interna de la compañía. En construcción.

```
supli/
├── frontend/   React 19 + TS + Vite + shadcn/ui   → ver frontend/README.md
└── backend/    Django 5 + DRF + SQLite            → ver backend/README.md
```

## Arranque

```bash
# Backend
cd backend
env\Scripts\activate
python manage.py migrate
python manage.py runserver          # http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

## Estado actual

| Página | Ruta | Estado |
|---|---|---|
| Landing | `/` | Pública |
| Login | `/login` | JWT contra el backend |
| Plataforma | `/inicio` | Sidebar armado con las apps de cada persona |
| Administración | `/inicio/admin` | Usuarios, áreas, apps, permisos y roles |
| Valoración | `/inicio/valoracion` | Evaluación de desempeño 180° |

Todo lo que está fuera de la app se ve **siempre en tema claro**. Cuando exista
el área privada, el cambio claro/oscuro se habilitará solo ahí dentro.

Apps de negocio en `backend/apps/`: `accounts` (usuarios y accesos) y
`valoracion` (evaluación de desempeño). Ambas siguen las mismas convenciones:
DRF en camelCase, paginación uniforme y errores normalizados.
