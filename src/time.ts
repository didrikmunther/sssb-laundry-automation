export const getDateString = (date: Date): string => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
export const getDateStringTime = (date: Date): string => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;

export const sameDay = (a: Date, b: Date): boolean => getDateString(a) === getDateString(b);
export const sameDate = (a: Date, b: Date): boolean => getDateStringTime(a) === getDateStringTime(b);

export const getTime = (): string => {
	const date = new Date();
	const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
	const date_ = getDateString(date);
	return `[${date_} ${time}]`;
};