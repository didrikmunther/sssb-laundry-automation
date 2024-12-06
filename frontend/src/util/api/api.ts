import { IAPIRepository } from "./repository";

export type LaundryStatus = "booked" | "own" | "bookable";

export type LaundrySlot = {
  groupName: string;
  pass: number;
  groupId: number;
  status: LaundryStatus;
};

export type LaundryStatusResponse = {
  [day: string]: {
    time: { start: string; end: string };
    slots: LaundrySlot[];
  }[];
};

export const APIService = ({ fetch }: IAPIRepository) => ({
  book: async (day: string, time: string, group: number): Promise<{}> =>
    fetch("/book", {
      day,
      time,
      group,
    }),

  unbook: async (day: string, time: string, group: number): Promise<{}> =>
    fetch("/unbook", {
      day,
      time,
      group,
    }),

  getGroups: async (): Promise<
    {
      name: string;
      id: number;
    }[]
  > => fetch("/groups"),

  status: async (day: string, time: string): Promise<LaundryStatusResponse> =>
    fetch("/status", {
      day,
      time,
    }),

  update: async (): Promise<object> => fetch("/update"),
});
