export type User = {
  rentalId: string;
  preferedGroups: number[];
  mainEmail: string;
  inviteEmails: string[];
  lookahead: number; // How many week ahead to scrape.
};

export const ROOT_URL = "http://your.root.url.com";

export const USERS: User[] = [
  {
    rentalId: "1234-5678-910",
    preferedGroups: [42, 43, 44, 45, 46, 47, 48],
    mainEmail: "google.calendar.inviter.email@gmail.com",
    inviteEmails: ["this.is.your.email@gmail.com", "and.your.roommates@gmail.com"],
    lookahead: 5, // How many weeks to look ahead
  }
];
