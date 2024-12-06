import { exit } from "process";
import { Database as SQLDriver } from "sqlite3";
import { open } from "sqlite";
import dotenv from "dotenv";

import { LaundryWeek } from "./tvatt";

dotenv.config();
const { SQLITE_FILE } = process.env;

export const getDb = async () => {
  if (!SQLITE_FILE) {
    console.warn("Require SQLITE_FILE");
    exit(1);
  }

  console.log("Opening db file", SQLITE_FILE);

  const db = await open({
    filename: SQLITE_FILE,
    driver: SQLDriver,
  });

  console.log("Opened db", db.config.filename);

  await db.run(`
		CREATE TABLE IF NOT EXISTS laundry (
			id 			INTEGER PRIMARY KEY,
			group_date 	DATETIME NOT NULL,
			group_id	INTEGER NOT NULL,
			event_date 	DATETIME DEFAULT (datetime('now','localtime')) NOT NULL,
			status 	STRING NOT NULL
		)
	`);

  await db.run(`
		CREATE TABLE IF NOT EXISTS event (
			id 			INTEGER PRIMARY KEY,
			event		STRING NOT NULL,
			date 		DATETIME DEFAULT (datetime('now','localtime')) NOT NULL,
			rental_id	STRING,
			info		STRING
		)
	`);

  return db;
};

type Event =
  | "booked"
  | "unbooked"
  | "checkedStatus"
  | "getGroups"
  | "getEvents";

export type Database = Awaited<ReturnType<typeof getDb>>;

export const getReporter = (db: Database) => {
  return {
    updateWeek: async (week: LaundryWeek) => {
      let insertions = 0;
      const date = new Date().toISOString();

      for (let [day, groups] of Object.entries(week)) {
        for (let { time, slots } of groups) {
          for (let slot of slots) {
            const groupDate = `${day} ${time.start}`;
            const latest = await db.get(
              `
							SELECT * FROM laundry WHERE group_date=? AND group_id=? ORDER BY event_date DESC LIMIT 1
						`,
              [groupDate, slot.groupId]
            );

            if (!latest || latest.status !== slot.status) {
              insertions++;
              await db.run(
                `
								INSERT into laundry (group_date, group_id, status) VALUES (?, ?, ?)
							`,
                [groupDate, slot.groupId, slot.status]
              );
            }
          }
        }
      }

      console.log("Inserted", insertions, "new events in db");
    },
    createEvent: async (event: Event, id: string, info?: String) => {
      await db.run(
        `
				INSERT into event (event, rental_id, info) VALUES (?, ?, ?)
			`,
        [event, id, info]
      );
    },
    getEvents: (): Promise<
      {
        id: number;
        event: Event;
        date: string;
        rental_id?: string;
        info?: number | string;
      }[]
    > => db.all(`SELECT * FROM event`),
  };
};

export type Reporter = ReturnType<typeof getReporter>;
