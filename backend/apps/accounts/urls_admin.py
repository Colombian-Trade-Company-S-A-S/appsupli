from rest_framework.routers import DefaultRouter

from .views_admin import (
    ApplicationViewSet,
    AreaViewSet,
    PermissionViewSet,
    RoleViewSet,
    UserViewSet,
)

app_name = 'admin_api'

# Sin slash final: el frontend llama /api/admin/users, no /users/.
router = DefaultRouter(trailing_slash=False)
router.register('users', UserViewSet, basename='users')
router.register('areas', AreaViewSet, basename='areas')
router.register('applications', ApplicationViewSet, basename='applications')
router.register('permissions', PermissionViewSet, basename='permissions')
router.register('roles', RoleViewSet, basename='roles')

urlpatterns = router.urls
