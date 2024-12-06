import { ROOT_URL, User } from './constants';
import { CalendarEvent, fetchEvents, pushEvent, removeEvent } from './google-calendar';
import { LaundryWeek, TimeRange } from './tvatt';

export type CalendarUpdate = {
	pushes: number,
	removals: number
};

// Color scale for coloring events based on available time slots
const colorScale = [11, 6, 5, 2, 10];

const withTimeZone = (dateTime: string) => ({
	dateTime,
	timeZone: 'Europe/Stockholm'
});

const addOneDayToDate = (day: string) => {
	const dayPlusOne = new Date(day);
	dayPlusOne.setDate(dayPlusOne.getDate() + 1);
	return dayPlusOne.toISOString().split('T')[0];
}

const getStartEnd = (day: string, time: TimeRange) => {
	// In some laundry rooms, the end time can be e.g. 01:00, which is the next day
	// We need to handle this by adding a day to the end time
	const endDay = time.end < time.start ? addOneDayToDate(day) : day;

	const start = withTimeZone(`${day}T${time.start}:00`);
	const end = withTimeZone(`${endDay}T${time.end}:00`);

	return {start, end}
}

const sameEvents = (a: CalendarEvent, b: CalendarEvent): boolean => (
	a.summary === b.summary
	&& a.colorId === b.colorId
	&& a.description?.split('\n')[0] === b.description?.split('\n')[0] // Only compare first line
	&& a.location === b.location
	&& JSON.stringify(a.attendees?.map(v => v.email) ?? []) == JSON.stringify(b.attendees?.map(v => v.email) ?? [])
)

const toGroupId = (v: string) => v.match(/Grupp\s*(?<id>\d+)/)?.groups?.['id'];

export const updateCalendar = async (user: User, dates: LaundryWeek): Promise<CalendarUpdate> => {
	let removals = 0;
	let pushes = 0;

	for (const [day, daySlots] of Object.entries(dates)) {
		console.log('Updating day', day);

		const events: CalendarEvent[] = daySlots
			.flatMap(({ time, slots }) => {
				const events = slots.filter(({ status }) => status !== 'booked');
				if (events.length <= 0) {
					return [];
				}

				const statuses = new Set(events.map(({ status }) => status));
				const locations = Array.from(new Set(events.filter(({ status }) => status === 'bookable').map(({ groupName }) => groupName))).map(toGroupId);
				const colorId = statuses.has('own') ? 3 : colorScale[Math.max(Math.round(events.length / user.preferedGroups.length * colorScale.length) - 1, 0)];
				const bookedByUs = slots.filter(({ status }) => status === 'own').map(({ groupName }) => groupName).map(toGroupId).join(', ');

				const summary = [
					[() => statuses.has('own'), `Booked by us: ${bookedByUs}`],
					[() => locations.length > 0, `${locations.length} available.`]
				].filter(([predicate]) => (predicate as () => boolean)()).map(([, message]) => message).join(' | ')

				const {start, end} = getStartEnd(day, time)

				let result: CalendarEvent[] = [{
					summary,
					description: `${ROOT_URL}/book/?day=${day}&time=${time.start}&id=${user.rentalId}`,
					location: locations.length > 0 ? `Groups available: ${locations.join(', ')}` : undefined,
					colorId: `${colorId}`,
					start,
					end,
					attendees: statuses.has('own') ? user.inviteEmails.map(email => ({ email })) : undefined
				}];

				return result;
			});

		try {
			var existingEvents = (await fetchEvents(user, `${day}T00:00:00+02:00`, `${day}T23:59:00+02:00`)).data.items ?? [];
		} catch (e) {
			console.log('Error in fetching calendar events, continuing.', { day });
			continue;
		}

		const newEvents = events.map(event => ({
			event,
			existing: existingEvents.find(({ start }) => event.start?.dateTime && start?.dateTime?.startsWith(event.start.dateTime))
		})).filter(({ event, existing }) => !existing || !sameEvents(event, existing));

		for (const existing of existingEvents) {
			if (!events.some(event => event.start?.dateTime && existing.start?.dateTime?.startsWith(event.start.dateTime))) {
				if (existing.id) {
					removals++;
					await removeEvent(user, existing.id);
				} else {
					console.warn('A duplicate event did not have an ID, could not remove.', existing);
				}
			}
		}

		for (const { event, existing } of newEvents) {
			if (existing) {
				if (existing.id) {
					removals++;
					await removeEvent(user, existing.id);
				} else {
					console.warn('A duplicate event did not have an ID, could not remove.', existing);
				}
			}

			pushes++;
			await pushEvent(user, event);
		}
	}

	return { removals, pushes };
};