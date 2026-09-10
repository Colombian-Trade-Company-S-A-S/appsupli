from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views, views_reports

app_name = 'valoracion'

# Sin slash final: el frontend llama /api/valoracion/ciclos, no /ciclos/.
router = DefaultRouter(trailing_slash=False)
router.register('competencias', views.CompetencyViewSet, basename='competencias')
router.register('preguntas', views.QuestionViewSet, basename='preguntas')
router.register('ciclos', views.CycleViewSet, basename='ciclos')
router.register('asignaciones', views.AssignmentViewSet, basename='asignaciones')
router.register('mis-evaluaciones', views.MyEvaluationViewSet, basename='mis-evaluaciones')
router.register('resultados', views.ResultViewSet, basename='resultados')
router.register('planes-accion', views.ActionPlanViewSet, basename='planes-accion')
router.register('jerarquia', views.HierarchyViewSet, basename='jerarquia')

urlpatterns = [
    path('resumen', views.summary, name='resumen'),
    path('opciones', views.options, name='opciones'),
    path('configuracion', views.SettingsView.as_view(), name='configuracion'),
    # ── Informes ───────────────────────────────────────────────────────────
    path('dashboard', views_reports.dashboard, name='dashboard'),
    path('dashboard/persona/<int:pk>', views_reports.person_dashboard, name='dashboard-persona'),
    path('consolidado', views_reports.consolidated, name='consolidado'),
    path('consolidado/items', views_reports.consolidated_items, name='consolidado-items'),
    path('consolidado/exportar', views_reports.export_consolidated, name='exportar-consolidado'),
    path('consolidado/exportar-items', views_reports.export_items, name='exportar-items'),
    path('informes/ciclos', views_reports.cycles_summary, name='informes-ciclos'),
    *router.urls,
]
