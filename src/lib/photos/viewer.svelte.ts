import { onLock, onSignOut } from '$lib/session.svelte';
import type { AttachmentRef } from '$lib/records/types';

/** Which photo the full-screen viewer shows (null: closed). Closed on lock and sign-out. */
export const viewer = $state<{ photo: AttachmentRef | null }>({ photo: null });

export const openPhoto = (photo: AttachmentRef) => {
	viewer.photo = photo;
};
export const closePhoto = () => {
	viewer.photo = null;
};

onLock(closePhoto);
onSignOut(closePhoto);
