from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    PreferencesView,
    VerifyPasswordView,
)

app_name = 'auth'

urlpatterns = [
    path('login', LoginView.as_view(), name='login'),
    path('me', MeView.as_view(), name='me'),
    path('preferences', PreferencesView.as_view(), name='preferences'),
    path('logout', LogoutView.as_view(), name='logout'),
    path('verify-password', VerifyPasswordView.as_view(), name='verify-password'),
    path('change-password', ChangePasswordView.as_view(), name='change-password'),
    path('refresh', TokenRefreshView.as_view(), name='refresh'),
]
