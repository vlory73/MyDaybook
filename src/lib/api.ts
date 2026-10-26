/**
 * Small typed client for the app's own JSON API. Same-origin only; the session cookie is HttpOnly and managed by
 * the browser. Binary values travel as URL-safe base64 (see `toB64` / `fromB64` in $lib/crypto).
 * Request and response bodies here only ever contain verifiers, wrapped keys and identity, never a passphrase.
 */
import type { KdfParams } from '$lib/crypto/keys';
import { setOnline } from '$lib/connection.svelte';

/** The server's `error` code (e.g. `invalid_credentials`), or `network` when no answer arrived. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly retryAfterSec: number | null = null
	) {
		super(code);
		this.name = 'ApiError';
	}
}

export type Role = 'admin' | 'member';
export type Identity = { userId: string; username: string; role: Role };

/** Wrapped key material as sent by `/api/auth/session` and `/api/auth/login`. Opens only with the passphrase. */
export type WireBundle = {
	kdfSalt: string;
	kdfParams: KdfParams;
	wrappedMkByPassphrase: string;
	wrappedPrivateKey: string;
	publicKey: string;
};
export type SessionResponse = Identity & { bundle: WireBundle };

let onUnauthenticated: (() => void) | null = null;

/** The session module registers here so a revoked session anywhere in the app drops the UI to signed-out. */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
	onUnauthenticated = handler;
}

function toApiError(res: Response, data: unknown): ApiError {
	const code =
		typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
			? data.error
			: 'server_error';
	const retry = Number(res.headers.get('retry-after'));
	const error = new ApiError(res.status, code, Number.isFinite(retry) && retry > 0 ? retry : null);
	if (code === 'unauthenticated') onUnauthenticated?.();
	return error;
}

async function request<T>(
	method: 'GET' | 'POST' | 'PUT' | 'DELETE',
	path: string,
	body?: unknown
): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			method,
			credentials: 'same-origin',
			cache: 'no-store',
			headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
			body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
		});
	} catch {
		setOnline(false);
		throw new ApiError(0, 'network');
	}
	setOnline(true);
	let data: unknown = null;
	try {
		data = await res.json();
	} catch {
		// An empty or non-JSON body; the status decides.
	}
	if (!res.ok) throw toApiError(res, data);
	return data as T;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
export const apiPut = <T>(path: string, body?: unknown) => request<T>('PUT', path, body);
export const apiDelete = <T>(path: string, body?: unknown) => request<T>('DELETE', path, body);

/** Uploads raw bytes (an encrypted attachment) as `application/octet-stream`. */
export async function apiPutBytes<T>(path: string, bytes: Uint8Array): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			method: 'PUT',
			credentials: 'same-origin',
			cache: 'no-store',
			headers: { 'content-type': 'application/octet-stream' },
			body: bytes as BodyInit
		});
	} catch {
		setOnline(false);
		throw new ApiError(0, 'network');
	}
	setOnline(true);
	const data: unknown = await res.json().catch(() => null);
	if (!res.ok) throw toApiError(res, data);
	return data as T;
}

/** Downloads raw bytes (an encrypted attachment). */
export async function apiGetBytes(path: string): Promise<Uint8Array> {
	let res: Response;
	try {
		res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
	} catch {
		setOnline(false);
		throw new ApiError(0, 'network');
	}
	setOnline(true);
	if (!res.ok) throw toApiError(res, await res.json().catch(() => null));
	return new Uint8Array(await res.arrayBuffer());
}
