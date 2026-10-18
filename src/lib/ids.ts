import { bufferToBase64Url } from './crypto';

export function newPublicId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return bufferToBase64Url(bytes.buffer);
}

export function newKey(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const body = bufferToBase64Url(bytes.buffer).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  return `${prefix}_${body || 'id'}`;
}
