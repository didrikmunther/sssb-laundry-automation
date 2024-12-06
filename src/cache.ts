import { getDateString } from "./time";
import { LaundryWeek } from "./tvatt";

export const activeRequests: Record<
  string,
  Record<string, Record<string, Promise<LaundryWeek> | undefined>>
> = {};

export const insertActiveRequest = (
  rentalId: string,
  date: Date,
  groupIds: number[],
  request: Promise<LaundryWeek>
) => {
  console.log('Inserting', rentalId, getDateString(date), groupIds)

  if (!activeRequests[rentalId]) {
    activeRequests[rentalId] = {};
  }

  const dateString = getDateString(date);
  if (!activeRequests[rentalId][dateString]) {
    activeRequests[rentalId][dateString] = {};
  }

  const ids = JSON.stringify(groupIds);
  if (!activeRequests[rentalId][dateString][ids]) {
    activeRequests[rentalId][dateString][ids] = request;
  }

  (async () => {
    await request;
    activeRequests[rentalId][dateString][ids] = undefined;
  })();
};
