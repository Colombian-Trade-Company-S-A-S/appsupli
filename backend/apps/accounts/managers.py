from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    """Autenticación por correo corporativo en lugar de username."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra):
        if not email:
            raise ValueError('El correo es obligatorio')
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra):
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email: str, password: str | None = None, **extra):
        extra.update(is_staff=True, is_superuser=True, is_active=True)
        return self._create_user(email, password, **extra)
