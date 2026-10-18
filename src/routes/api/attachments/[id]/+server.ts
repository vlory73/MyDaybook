import { Readable } from 'node:stream';
import type { RequestEvent } from '@sveltejs/kit';
import { ApiError, api, reply, requireUser } from '$lib/server/auth/http';
import { parseUuidV4 } from '$lib/server/auth/validate';
import { MAX_BLOB_BYTES, deleteBlob, openBlob, putBlob } from '$lib/server/attachments';

function idOf(event: RequestEvent): string {
	const id = parseUuidV4(event.params.id);
	if (!id) throw new ApiError(400, 'bad_request');
	return id;
}

/**
 * An oversized upload is read to its end and thrown away before the 413 goes out. Answering mid-upload makes the
 * client's remaining writes fail (EPIPE/ECONNRESET) instead of showing the 413. adapter-node's BODY_SIZE_LIMIT bounds
 * how much is drained; past it the adapter breaks the stream itself. `Connection: close` tells the client not to
 * reuse the connection in that case.
 */
const tooLarge = () => new ApiError(413, 'too_large', { connection: 'close' });

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<never> {
	try {
		while (!(await reader.read()).done);
	} catch {
		// The adapter stopped the stream at its own limit; the answer is the same.
	}
	throw tooLarge();
}

/** Reads the raw body, refusing more than MAX_BLOB_BYTES without buffering the excess. */
async function readBody(request: Request): Promise<Buffer> {
	const declared = Number(request.headers.get('content-length'));
	const chunks: Uint8Array[] = [];
	let total = 0;
	if (request.body) {
		const reader = request.body.getReader();
		if (Number.isFinite(declared) && declared > MAX_BLOB_BYTES) await drain(reader);
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				total += value.length;
				if (total > MAX_BLOB_BYTES) break;
				chunks.push(value);
			}
		} catch {
			throw new ApiError(400, 'bad_request');
		}
		if (total > MAX_BLOB_BYTES) await drain(reader);
	} else if (Number.isFinite(declared) && declared > MAX_BLOB_BYTES) {
		throw tooLarge();
	}
	if (total === 0) throw new ApiError(400, 'bad_request');
	return Buffer.concat(chunks, total);
}

/** Stores the encrypted blob (raw `application/octet-stream`, at most 1.25 MiB). A foreign id is answered 404. */
export const PUT = api(async (event) => {
	const { user } = requireUser(event);
	const id = idOf(event);
	// The origin guard also admits JSON; this endpoint takes raw bytes only.
	if (!/^application\/octet-stream\s*(;|$)/i.test(event.request.headers.get('content-type') ?? '')) {
		throw new ApiError(415, 'unsupported_media_type');
	}
	const result = putBlob(user.id, id, await readBody(event.request));
	if (!result.ok) throw new ApiError(404, 'not_found');
	return reply({ id, size: result.size });
});

/** Streams the blob back to its owner. Someone else's id looks the same as a missing one. */
export const GET = api((event) => {
	const { user } = requireUser(event);
	const blob = openBlob(user.id, idOf(event));
	if (!blob) throw new ApiError(404, 'not_found');
	return new Response(Readable.toWeb(blob.stream) as ReadableStream, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-length': String(blob.size),
			'cache-control': 'no-store'
		}
	});
});

export const DELETE = api((event) => {
	const { user } = requireUser(event);
	if (!deleteBlob(user.id, idOf(event))) throw new ApiError(404, 'not_found');
	return reply({ ok: true });
});
