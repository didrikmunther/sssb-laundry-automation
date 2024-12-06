import express, { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import { exit } from "process";
import { randomUUID } from "crypto";
import {
  Observable,
  OperatorFunction,
  Subject,
  concatMap,
  defer,
  filter,
  groupBy,
  map,
  merge,
  mergeMap,
  of,
  pairwise,
  share,
  startWith,
  switchMap,
  take,
  tap,
} from "rxjs";

import { update, updateUser } from "./update";
import { book, getWeek, unbook, updateWeek } from "./book";
import { getTime } from "./time";
import { getDb, getReporter, Reporter } from "./db";
import { job } from "./log";
import { USERS, User } from "./constants";
import { getGroups } from "./groups";
import { LaundryWeek, login } from "./tvatt";

const { HTTP_USERNAME, HTTP_PASSWORD } = process.env;

const firstWeekUpdate = Symbol();

function bufferUntilAllDone<T>(): OperatorFunction<Promise<T>, T[]> {
  let state = { invalidate: false };

  return (source: Observable<Promise<T>>) =>
    defer(() => {
      let buffer: Promise<T>[] = [];
      state.invalidate = true;
      state = { invalidate: false };
      const myState = state;

      return source.pipe(
        tap((v) => buffer.push(v)),
        switchMap(async () => {
          const res = await Promise.all(buffer);

          return myState.invalidate
            ? new Observable<Awaited<T>[]>((subscriber) =>
                subscriber.complete()
              )
            : of(res);
        }),
        switchMap((v) => v),
        tap(() => (buffer = []))
      );
    });
}

dotenv.config();
const { PORT, SQLITE_FILE } = process.env;

if (typeof SQLITE_FILE !== "string") {
  console.error("Require SQLITE_FILE");
  exit(-1);
}

type BookingInfo = { day: string; time: string; group: number };
type StatusInfo = { day: string; id: string };
type UnbookingInfo = { day: string; time: string; group: number };
type UpdateInfo = { id: string };

export type WeekUpdate$ = Subject<{
  week: LaundryWeek;
  user: User;
  timestamp: number;
}>;

const getApp = (reporter: Reporter) => {
  const book$: Subject<{
    user: User;
    day: string;
    time: string;
    group: number;
    bookId: string;
    doBook: boolean; // book or unbook?
  }> = new Subject();

  const week$: WeekUpdate$ = new Subject();

  const bookings$ = book$.pipe(
    groupBy(({ user, day, time }) =>
      JSON.stringify([user.rentalId, day, time])
    ),
    mergeMap((booking) =>
      booking.pipe(
        map(async ({ user, doBook, day, time, group, bookId }) => {
          const auth = await job("Login", () => login(user.rentalId));

          if (doBook) {
            await book(auth, user, day, time, group);
            reporter.createEvent("booked", user.rentalId, `${group}`);
          } else {
            await unbook(auth, user, day, time, [group]);
            reporter.createEvent("unbooked", user.rentalId, `${group}`);
          }

          return { auth, user, day, bookId };
        }),
        bufferUntilAllDone()
      )
    ),
    filter(({ length }) => length > 0),
    mergeMap(async (groups) => {
      const [{ auth, user, day }] = groups;
      const week = await getWeek(user!, auth, day);
      const bookIds = groups.map(({ bookId }) => bookId);
      const timestamp = Date.now();

      return { auth, user, week, timestamp, day, bookIds };
    }),
    share()
  );

  const updates$ = merge(
    bookings$.pipe(
      map(({ week, timestamp, user, day }) => ({ week, timestamp, user, day }))
    ),
    week$.pipe(
      map(({ week, user, timestamp }) => ({
        week,
        user,
        timestamp,
        day: undefined,
      }))
    )
  ).pipe(
    startWith(firstWeekUpdate),
    pairwise(),
    filter(([a, b]) => {
      if (a == firstWeekUpdate) return true;
      if (b == firstWeekUpdate) return false;

      return a.timestamp < b.timestamp;
    }),
    concatMap(async ([, update]) => {
      const { week, user, day } = update as {
        week: LaundryWeek;
        user: User;
        day: string | undefined;
      };

      const calendarUpdate = await updateWeek(week, user, reporter, day);

      return {
        calendarUpdate,
        user,
        week,
      };
    })
  );

  updates$.subscribe(({ calendarUpdate, user, week }) =>
    console.log(
      "Updated calendar for user",
      user,
      "for week",
      Object.keys(week ?? {})[0],
      "with updates",
      calendarUpdate
    )
  );

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../frontend/build")));

  app.use(
    express.urlencoded({
      extended: true,
    })
  );

  app.use((req, _, next) => {
    console.group(
      getTime(),
      "Request",
      `> ${req.headers["x-forwarded-for"] || req.socket.remoteAddress} <`
    );
    next();
    console.groupEnd();
  });

  const requireAuth = (
    req: Request<{}>,
    res: Response<Record<string, any>>
  ): boolean => {
    const reject = () => {
      console.log("Bad auth");
      console.groupEnd();

      res.setHeader("www-authenticate", "Basic");
      res.sendStatus(401);
    };

    const authorization = req.headers.authorization;

    if (!authorization) {
      reject();

      return false;
    }

    const [username, password] = Buffer.from(
      authorization.replace("Basic ", ""),
      "base64"
    )
      .toString()
      .split(":");

    if (!(username === HTTP_USERNAME && password === HTTP_PASSWORD)) {
      reject();

      return false;
    }

    return true;
  };

  app.get(
    "/events",
    async (req: Request<{}, {}, {}, { event?: string[] }>, res) => {
      console.group(getTime(), "Getting events ...");

      if (!requireAuth(req, res)) {
        return;
      }

      reporter.createEvent("getEvents", "");
      const events = await reporter.getEvents();
      console.log(getTime(), "... done getting events");
      console.groupEnd();

      const result = req.query.event
        ? events.filter(({ event }) =>
            (typeof req.query.event === "string"
              ? [req.query.event]
              : req.query.event
            )?.includes(event)
          )
        : events;

      res.send(result);
    }
  );

  app.get("/groups", async (req: Request<{}, {}, {}, { id: string }>, res) => {
    console.group(getTime(), "Getting groups ...");

    const id = req.query["id"];
    if (!id) {
      console.log("Bad input");
      console.groupEnd();
      return res.status(400);
    }

    reporter.createEvent("getGroups", id);
    const groups = await getGroups(id);

    console.log(getTime(), "... done getting groups");
    console.groupEnd();

    res.send(groups);
  });

  app.post("/update", async (req: Request<{}, {}, UpdateInfo>, res) => {
    console.group(getTime(), "API updating ...");

    const id = req.get("rental-id");
    if (!id) {
      console.log("Bad input");
      console.groupEnd();
      return res.status(400);
    }

    // Perhaps also check for ip address
    if (id === "all") {
      console.log("Updating all users");
      await update(USERS, week$);
    } else {
      console.log(`Trying to update specific user ${id}`);
      let user = USERS.find((user) => user.rentalId == id);
      if (!user) {
        console.log(`No such user ${id}`);
        console.groupEnd();

        return res.status(400);
      }

      await updateUser(user, week$);
    }

    console.log(getTime(), "... done API updating");
    console.groupEnd();

    res.send({
      status: "updated",
    });
  });

  app.post("/status", async (req: Request<{}, {}, StatusInfo>, res) => {
    console.group(getTime(), "API status ...", req.body);

    const id = req.get("rental-id");
    console.log("... with id", id);

    const { day } = req.body;
    if (!day || !id) {
      console.log("Bad input");
      console.groupEnd();

      return res.status(400);
    }

    let user = USERS.find((user) => user.rentalId == id);
    if (!user) {
      console.log(`No such user ${id}`);
      console.groupEnd();

      return res.status(400);
    }

    reporter.createEvent("checkedStatus", user.rentalId, day);

    const auth = await job("Login", () => login(user!.rentalId));
    const week = await getWeek(user, auth, day);

    console.log(getTime(), "... done API status");
    console.groupEnd();

    res.send(week);
  });

  app.post("/book", async (req: Request<{}, {}, BookingInfo>, res) => {
    console.group(getTime(), "API booking ...", req.body);

    const id = req.get("rental-id");
    const { day, time, group } = req.body;
    if (!id || !day || !time || !group) {
      console.log("Bad input");
      console.groupEnd();

      return res.status(400);
    }

    let user = USERS.find((user) => user.rentalId == id);
    if (!user) {
      console.log(`No such user ${id}`);
      console.groupEnd();

      return res.status(400);
    }

    const bookId = randomUUID();

    bookings$
      .pipe(
        filter(({ bookIds }) => bookIds.includes(bookId)),
        take(1)
      )
      .subscribe(({ week }) => {
        res.send(week);
        console.groupEnd();
        console.log("... done API booking");
      });

    book$.next({
      user,
      day,
      time,
      group,
      bookId,
      doBook: true,
    });
  });

  app.post("/unbook", async (req: Request<{}, {}, UnbookingInfo>, res) => {
    console.group(getTime(), "API unbooking ...", req.body);

    const id = req.get("rental-id");
    const { day, time, group } = req.body;
    if (!id || !day || !time || !group) {
      console.log("Bad input");
      console.groupEnd();

      return res.status(400);
    }

    let user = USERS.find((user) => user.rentalId == id);
    if (!user) {
      console.log(`No such user ${id}`);
      console.groupEnd();

      return res.status(400);
    }

    const bookId = randomUUID();

    bookings$
      .pipe(
        filter(({ bookIds }) => bookIds.includes(bookId)),
        take(1)
      )
      .subscribe(({ week }) => {
        res.send(week);
        console.groupEnd();
        console.log("... done API unbooking");
      });

    book$.next({
      user,
      day,
      time,
      group,
      bookId,
      doBook: false,
    });
  });

  app.get("/book", async (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/build/index.html"));
  });

  return app;
};

const main = async () => {
  const port = PORT ?? 80;
  const db = await job("Getting db", () => getDb());
  const reporter = getReporter(db);
  const app = getApp(reporter);

  app.listen(port, () => {
    console.log(getTime(), `Server is running at https://localhost:${port}`);
  });
};

if (require.main === module) {
  main();
}
