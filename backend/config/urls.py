"""Ruteo raíz: cada área de negocio expone su propio `urls.py`."""
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('admin/', admin.site.urls),
    # ── API ────────────────────────────────────────────────────────────────
    path('api/auth/', include('apps.accounts.urls')),
    path('api/admin/', include('apps.accounts.urls_admin')),
    path('api/valoracion/', include('apps.valoracion.urls')),
    path('api/bi-trade/', include('apps.bi_trade.urls')),
    # ── Documentación ──────────────────────────────────────────────────────
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='docs'),
]
