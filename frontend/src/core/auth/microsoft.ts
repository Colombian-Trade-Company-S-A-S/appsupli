/**
 * Ingreso con Microsoft (Entra ID) por redirección, con PKCE y sin secreto.
 *
 * El inquilino y la aplicación los da el backend (`/auth/ingreso`): así no hay
 * que reconstruir el frontend para cambiarlos. MSAL solo se carga cuando se usa.
 */
import type { PublicClientApplication } from '@azure/msal-browser';
import { authApi } from './auth.api';

/** La URL que registró IT en Entra: tiene que coincidir exactamente. */
export const RUTA_RETORNO = '/auth/microsoft';

const ALCANCES = ['openid', 'profile', 'email'];

let instancia: Promise<PublicClientApplication> | null = null;

function msal(): Promise<PublicClientApplication> {
  instancia ??= (async () => {
    const [{ PublicClientApplication }, config] = await Promise.all([
      import('@azure/msal-browser'),
      authApi.ingreso(),
    ]);
    if (!config.microsoft) throw new Error('El ingreso con Microsoft no está configurado.');
    const app = new PublicClientApplication({
      auth: {
        clientId: config.microsoft.clientId,
        authority: `https://login.microsoftonline.com/${config.microsoft.tenantId}`,
        redirectUri: `${window.location.origin}${RUTA_RETORNO}`,
        // Al volver se queda en /auth/microsoft: ahí se termina el ingreso.
        navigateToLoginRequestUrl: false,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
    await app.initialize();
    return app;
  })().catch((error: unknown) => {
    instancia = null;
    throw error;
  });
  return instancia;
}

/** Lleva a la pantalla de Microsoft. La página se va: no hay nada después. */
export async function irAMicrosoft() {
  const app = await msal();
  await app.loginRedirect({ scopes: ALCANCES, prompt: 'select_account' });
}

/** Al volver de Microsoft: el id_token, o `null` si no se venía de allá. */
export async function tokenDeRegreso(): Promise<string | null> {
  const app = await msal();
  const resultado = await app.handleRedirectPromise();
  return resultado?.idToken ?? null;
}

/** Cierra solo la sesión local de MSAL; la de Microsoft queda abierta. */
export async function olvidarCuentaMicrosoft() {
  if (!instancia) return;
  const app = await instancia;
  await app.clearCache();
}
