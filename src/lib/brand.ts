import brand from '../../brand.config.json';

/** The single source of naming (see CLAUDE.md "Conventions"). */
export { brand };

export function buildManifest(locale: 'en' | 'da' = 'en') {
	return {
		name: brand.displayName,
		short_name: brand.shortName,
		description: brand.description[locale],
		lang: locale,
		start_url: '/',
		scope: '/',
		display: 'standalone',
		orientation: 'portrait',
		background_color: brand.backgroundColor,
		theme_color: brand.themeColor.light,
		icons: [
			{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
			{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
		]
	};
}
