// The server can't read content, so it renders nothing: the app is client-side only
// (ARCHITECTURE §2, "Rendering mode"). Individual endpoints (healthz, manifest) opt out.
export const ssr = false;
export const prerender = false;
