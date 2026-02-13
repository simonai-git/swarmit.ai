/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth flows.
 * Uses Web Crypto API — works in both browser and Edge Runtime.
 */

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = base64urlEncode(randomBytes.buffer as ArrayBuffer);

  const encoded = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const codeChallenge = base64urlEncode(digest);

  return { codeVerifier, codeChallenge };
}
