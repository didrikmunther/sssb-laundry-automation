import { getTime } from './time';

export type LogFunction = (...args: any[]) => void;

const capitalize = (v: string) => v.length <= 0 ? '' : `${v[0].toUpperCase()}${v.slice(1)}`;
const deCapitalize = (v: string) => v.length <= 0 ? '' : `${v[0].toLowerCase()}${v.slice(1)}`;

/**
 * Wraps output of job in a begin and ending label.
 * @param label the label of the job
 * @param job function generating the async job to run
 * @returns the return value of the job
 */
export const job = async <T>(label: string, job: (logAdditional: LogFunction) => Promise<T>): Promise<T> => {
	let additionalInformation: any[] | undefined = undefined;
	const logAdditional = (...args: any[]) => {
		if (additionalInformation === undefined) {
			additionalInformation = args;
		} else {
			additionalInformation = [...additionalInformation, ...args];
		}
	}

	console.group(getTime(), capitalize(label), '...');
	const res = await job(logAdditional);
	console.groupEnd();
	console.log(getTime(), '... done', deCapitalize(label), ...[...additionalInformation ? additionalInformation : []]);

	return res;
};