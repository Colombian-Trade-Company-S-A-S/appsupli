from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    """Autenticación por correo corporativo en lugar de username."""

    use_in_migrations = True

    def _create_user(self, email: str | None, password: str | None, **extra):
        # El correo puede venir vacío: los asesores y promotores de punto de
        # venta no tienen cuenta corporativa. Se guarda como `NULL` y no como
        # cadena vacía, porque dos cadenas vacías chocarían contra el índice
        # único mientras que dos nulos conviven sin problema.
        user = self.model(email=self.normalize_email(email).lower() if email else None, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str | None = None, password: str | None = None, **extra):
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email: str, password: str | None = None, **extra):
        if not email:
            raise ValueError('Un administrador necesita correo: con él inicia sesión.')
        extra.update(is_staff=True, is_superuser=True, is_active=True)
        return self._create_user(email, password, **extra)
