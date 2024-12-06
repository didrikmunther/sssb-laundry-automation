import { Subject, concatMap } from "rxjs";
import { WeekUpdate$ } from ".";
import { updateCalendar } from "./calendar";
import { USERS, User } from "./constants";
import { getDb, getReporter, Reporter } from "./db";
import { job } from "./log";
import { LaundryWeek, Login, login, scrapeWeek } from "./tvatt";
import { updateWeek } from "./book";

export const _updateWeek = async (
  auth: Login,
  user: User,
  date: Date,
  week$: WeekUpdate$
) => {
  return await job(
    `Updating week ${date.toISOString().split("T")[0]}`,
    async () => {
      const week = await job("Scraping laundry", () =>
        scrapeWeek(user, auth, user.preferedGroups, date)
      );
      const timestamp = Date.now();
      week$.next({ week, user, timestamp });
    }
  );
};

export const update = async (users: User[], week$: WeekUpdate$) =>
  Promise.all(users.map((user) => updateUser(user, week$)));

export const updateUser = async (user: User, week$: WeekUpdate$) => {
  const auth = await job("Login", () => login(user.rentalId));

  for (let i = 0; i < user.lookahead; i++) {
    const date = new Date();
    date.setDate(date.getDate() + 7 * i);

    await _updateWeek(auth, user, date, week$);
  }
};

const main = async () => {
  const id = process.argv[2];
  if (id == undefined) {
    console.log("Usage: update <user rental id>");
    return;
  }
  const user = USERS.find(({ rentalId }) => rentalId == id);
  if (!user) {
    console.log("No such user");
    return;
  }

  const db = await job("Getting db", () => getDb());
  const reporter = getReporter(db);

  const week$ = new Subject<{
    week: LaundryWeek;
    timestamp: number;
    user: User;
  }>();

  week$
    .pipe(
      concatMap(async (update) => {
        const { week, user } = update as {
          week: LaundryWeek;
          user: User;
        };

        const calendarUpdate = await updateWeek(week, user, reporter);

        return {
          calendarUpdate,
          user,
          week,
        };
      })
    )
    .subscribe(({ calendarUpdate, user, week }) =>
      console.log(
        "Updated calendar for user",
        user,
        "for week",
        Object.keys(week ?? {})[0],
        "with updates",
        calendarUpdate
      )
    );

  updateUser(user, week$);
};

if (require.main === module) {
  main();
}
