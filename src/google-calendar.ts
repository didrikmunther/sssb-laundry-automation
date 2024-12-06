const fs = require('fs').promises;
const path = require('path');

import Bottleneck from "bottleneck";
import { authenticate } from '@google-cloud/local-auth';
import { BaseExternalAccountClient, OAuth2Client } from 'google-auth-library';
import { calendar_v3, google } from 'googleapis';
import { User } from "./constants";

type Auth = OAuth2Client | BaseExternalAccountClient;

export type CalendarEvent = Pick<calendar_v3.Schema$Event, 'summary' | 'location' | 'description' | 'start' | 'end' | 'colorId' | 'attendees'>;

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const limiter = new Bottleneck({
	maxConcurrent: 1,
	minTime: 14
});

const getTokenPath = (user: User) => path.join(process.cwd(), 'certs', `${user.mainEmail}.json`)
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')

const loadSavedCredentialsIfExist = async (user: User) => {
	try {
		const content = await fs.readFile(getTokenPath(user));
		const credentials = JSON.parse(content);
		return google.auth.fromJSON(credentials);
	} catch (err) {
		return null;
	}
};

const saveCredentials = async (user: User, client: OAuth2Client) => {
	const content = await fs.readFile(CREDENTIALS_PATH);
	const keys = JSON.parse(content);
	const key = keys.installed || keys.web;
	const payload = JSON.stringify({
		type: 'authorized_user',
		client_id: key.client_id,
		client_secret: key.client_secret,
		refresh_token: client.credentials.refresh_token,
	});
	await fs.writeFile(getTokenPath(user), payload);
};

const authorize = async (user: User): Promise<Auth> => {
	const credentials = await loadSavedCredentialsIfExist(user);
	if (credentials) {
		return credentials;
	}
	const client = await authenticate({
		scopes: SCOPES,
		keyfilePath: CREDENTIALS_PATH,
	});
	if (client.credentials) {
		await saveCredentials(user, client);
	}
	return client;
};

export const pushEvent = async (user: User, requestBody: CalendarEvent) => {
	const auth = await authorize(user);
	const calendar = google.calendar({ version: 'v3', auth });

	try {
		await limiter.schedule(() => calendar.events.insert({
			auth,
			calendarId: 'primary',
			requestBody
		}));
	} catch (e) {
		console.warn('Push calendar event error', e);
	}
};

export const removeEvent = async (user: User, id: string) => {
	const auth = await authorize(user);
	const calendar = google.calendar({ version: 'v3', auth });

	try {
		return await limiter.schedule(() => calendar.events.delete({
			calendarId: 'primary',
			eventId: id
		}));
	} catch (e) {
		console.warn('Remove calendar event error', e);
	}
};

export const fetchEvents = async (user: User, start: string, end: string) => {
	const auth = await authorize(user);
	const calendar = google.calendar({ version: 'v3', auth });

	try {
		return await limiter.schedule(() => calendar.events.list({
			calendarId: 'primary',
			singleEvents: true,
			orderBy: 'startTime',
			timeMin: start,
			timeMax: end,
		}));
	} catch (e) {
		console.warn('Push fetch event error', e);

		throw e;
	}
};