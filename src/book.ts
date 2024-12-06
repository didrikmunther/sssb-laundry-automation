import { CalendarUpdate, updateCalendar } from './calendar';
import { User, USERS } from './constants';
import { getDb, getReporter, Reporter } from './db';
import { job } from './log';
import { bookDay, LaundryWeek, Login, login, scrapeWeek, unbookGroup } from './tvatt';

export const bookWithAuth = async (user: User, auth: Login, day: string, time: string, group: number) => {
	await job(`Booking day`, () => bookDay(user, auth, user.preferedGroups, day, time, group));
};

/**
 * @param user the user
 * @param day of form yyyy-mm-dd
 * @param time of form hh:mm
 * @param group which machine to book
 * @returns auth object for future updating of new state of calendar
 */
export const book = async (auth: Login, user: User, day: string, time: string, group: number) => {
	// const auth = await job('Login', () => login(user.rentalId));
	await bookWithAuth(user, auth, day, time, group);

	return auth
};

export const unbook = async (auth: Login, user: User, day: string, time: string, groups: number[]) => {
	// const auth = await job('Login', () => login(user.rentalId));
	await job(`Unbooking groups day: ${day}, time: ${time}: group: ${groups}`, () => unbookGroup(user, auth, day, time, groups));

	return auth
};

export const getWeek = async (user: User, auth: Login, day: string) => {
	return await job('Scraping new week', () => scrapeWeek(user, auth, user.preferedGroups, new Date(day)));
}

export const updateWeek = async (week: LaundryWeek, user: User, reporter: Reporter, day?: string): Promise<CalendarUpdate> => {
	await job('Updating events in db', () => reporter.updateWeek(week));

	const calendarWeek = day ? { [day]: week[day] } : week;
	return await job('Updating calendar', () => updateCalendar(user, calendarWeek));
}

const main = async () => {
	const user = USERS[0]
	const auth = await job('Login', () => login(user.rentalId));
	const db = await job('Getting db', () => getDb());
	await job('Updating day', async () => {
		const day = new Date().toISOString().split('T')[0];
		const week = await getWeek(user, auth, day);
		await updateWeek(week, user, getReporter(db), day);
	});
}

if (require.main === module) {
	main();
}