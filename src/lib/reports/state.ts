/**
 * The choices for the report that is about to be shown. They travel in memory only: the name must never end up in a
 * URL, a server log or storage. A reload empties this, and the print page then sends the person back to the choices.
 * Only the layout is remembered on the device (a harmless preference).
 */
import type { Locale } from '$lib/i18n/core';
import type { Include } from './doctor';
import type { ReportLayout } from './headache';

export type ReportRequest = {
	/** First and last day ("YYYY-MM-DD"), both included. */
	from: string;
	to: string;
	locale: Locale;
	layout: ReportLayout;
	name: string;
};

let current: ReportRequest | null = null;

export const setReportRequest = (request: ReportRequest | null): void => {
	current = request;
};
export const getReportRequest = (): ReportRequest | null => current;

/**
 * The choices for the Doctor visit report. Same rule: memory only. The questions and the name are never saved, never
 * put in a URL and never sent anywhere; a reload empties them.
 */
export type DoctorRequest = {
	from: string;
	to: string;
	locale: Locale;
	name: string;
	questions: string;
	include: Include;
	/** "touched" choices of the options screen, so coming back keeps them. */
	touched: Partial<Include>;
};

let currentDoctor: DoctorRequest | null = null;
export const setDoctorRequest = (request: DoctorRequest | null): void => {
	currentDoctor = request;
};
export const getDoctorRequest = (): DoctorRequest | null => currentDoctor;

const LAYOUT_KEY = 'report-layout';

export function loadLayout(): ReportLayout {
	try {
		return localStorage.getItem(LAYOUT_KEY) === 'form' ? 'form' : 'table';
	} catch {
		return 'table';
	}
}

export function saveLayout(layout: ReportLayout): void {
	try {
		localStorage.setItem(LAYOUT_KEY, layout);
	} catch {
		// Not remembered; the choice still applies now.
	}
}
