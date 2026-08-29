import { OAuth2Client } from 'google-auth-library';
import {
  createGoogleOidcState,
  validateGoogleOidcIdentity,
  verifyGoogleOidcState,
} from './google-oidc';

interface GoogleOidcConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  issuer: string;
  audience: string;
}

function requireConfiguration(): GoogleOidcConfiguration {
  const configuration = {
    clientId: process.env.GOOGLE_OIDC_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_OIDC_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_OIDC_REDIRECT_URI ?? '',
    stateSecret: process.env.GOOGLE_OIDC_STATE_SECRET ?? '',
    issuer: process.env.OIDC_ISSUER_URL ?? '',
    audience: process.env.OIDC_AUDIENCE ?? '',
  };
  if (Object.values(configuration).some(value => !value)) throw new Error('Google OIDC is not configured.');
  return configuration;
}

function clientFor(configuration: GoogleOidcConfiguration): OAuth2Client {
  return new OAuth2Client(configuration.clientId, configuration.clientSecret, configuration.redirectUri);
}

export function createAuthorizationUrl({ returnTo }: { returnTo: string }): string {
  const configuration = requireConfiguration();
  const state = createGoogleOidcState({ secret: configuration.stateSecret, returnTo });
  return clientFor(configuration).generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
  });
}

export async function exchangeCode({ code, state }: { code: string; state: string }): Promise<{
  identity: { subject: string; email: string; fullName: string };
  returnTo: string;
}> {
  const configuration = requireConfiguration();
  const { returnTo, nonce } = verifyGoogleOidcState({ state, secret: configuration.stateSecret });
  const client = clientFor(configuration);
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error('Google OIDC did not return an ID token.');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: configuration.audience });
  const payload = ticket.getPayload() ?? {};
  return {
    identity: validateGoogleOidcIdentity({ payload, audience: configuration.audience, issuer: configuration.issuer, expectedNonce: nonce }),
    returnTo,
  };
}
