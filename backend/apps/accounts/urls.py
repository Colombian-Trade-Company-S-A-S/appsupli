from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    IngresoView,
    InstalacionAppView,
    LoginView,
    MicrosoftLoginView,
    LogoutView,
    MeView,
    PreferencesView,
    VerifyPasswordView,
)

app_name = 'auth'

urlpatterns = [
    path('login', LoginView.as_view(), name='login'),
    path('ingreso', IngresoView.as_view(), name='ingreso'),
    path('microsoft', MicrosoftLoginView.as_view(), name='microsoft'),
    path('me', MeView.as_view(), name='me'),
    path('preferences', PreferencesView.as_view(), name='preferences'),
    path('instalacion-app', InstalacionAppView.as_view(), name='instalacion-app'),
    path('logout', LogoutView.as_view(), name='logout'),
    path('verify-password', VerifyPasswordView.as_view(), name='verify-password'),
    path('change-password', ChangePasswordView.as_view(), name='change-password'),
    path('refresh', TokenRefreshView.as_view(), name='refresh'),
]
