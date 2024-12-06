import { HTMLElement, parse } from "node-html-parser";
import fetch from "cross-fetch";
import { job } from "./log";
import { getDateString, getTime, sameDate } from "./time";
import { getGroups } from "./groups";
import { User } from "./constants";
import { activeRequests, insertActiveRequest } from "./cache";

export type BookStatus = "booked" | "own" | "bookable";

export type Login = {
  cookie: string;
};

export type LaundryWeek = {
  [day: string]: {
    time: TimeRange;
    slots: {
      groupName: string;
      pass: number;
      groupId: number;
      status: BookStatus;
    }[];
  }[];
};

export type TimeRange = { start: string; end: string };

const headers = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
  "accept-language": "en-SE,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
};

const APTUS = "https://sssb.aptustotal.se/AptusPortal";
const LOGIN_URL = `${APTUS}/Account/Login?ReturnUrl=%2fAptusPortal%2f`;

const enc_str = (v: string, k: number): string =>
  v
    .split("")
    .map((_, i) => String.fromCharCode(k ^ v.charCodeAt(i)))
    .join("");

const getLoginBody = (
  requestToken: string,
  password: string,
  salt: number
): string =>
  `DeviceType=PC&DesktopSelected=true&__RequestVerificationToken=${requestToken}&UserName=${password}&Password=${password}&PwEnc=${encodeURIComponent(
    enc_str(password, salt)
  )}&PasswordSalt=${salt}`;

const getISODateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

const getBookable = (v: HTMLElement) => {
  const time = v
    .querySelector("> div")
    ?.textContent.split("-")
    .map((v) => v.trim())!;
  const pass = Number(
    v
      .querySelector("> button")
      ?.getAttribute("onclick")
      ?.match(/passNo=(?<pass>\d+)\&/)?.groups?.["pass"] ?? "-1"
  );
  const statuses = v.classList.value.filter((v) => v !== "interval");
  const status: BookStatus =
    statuses.length <= 0 ? "booked" : (statuses[0] as BookStatus);

  return {
    start: time[0],
    end: time[1],
    status,
    pass,
  };
};

const setLanguage = async ({ cookie }: Login, language: string) => {
  await fetch(
    `${APTUS}/Account/SetCustomerLanguage?lang=${language}&returnController=Home&returnAction=Index`,
    {
      headers: {
        ...headers,
        cookie,
      },
      redirect: "manual",
    }
  );
};

export const login = async (password: string): Promise<Login> => {
  const res1 = await fetch(LOGIN_URL, {
    headers,
    redirect: "manual",
  });

  const aspSessionId = res1.headers.get("set-cookie")!.split(";")[0].trim();

  const res2 = await fetch(LOGIN_URL, {
    headers: {
      ...headers,
      cookie: aspSessionId,
    },
    redirect: "manual",
  });

  const parsed = parse(await res2.text());
  const salt = Number(
    parsed.getElementById("PasswordSalt").getAttribute("value")
  );
  const requestTokenHTML = parsed
    .getElementsByTagName("input")
    .find((v) => v.getAttribute("name") === "__RequestVerificationToken")
    ?.getAttribute("value")!;
  const requestTokenCookie = res2.headers
    .get("set-cookie")!
    .split(";")
    .find((v) => v.startsWith("__RequestVerificationToken"))
    ?.trim();
  const loginCookie = `${aspSessionId}; ${requestTokenCookie}`;
  const loginBody = getLoginBody(requestTokenHTML, password, salt);

  const res3 = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/x-www-form-urlencoded",
      cookie: loginCookie,
    },
    body: loginBody,
    credentials: "include",
    redirect: "manual",
  });

  const authToken = res3.headers
    .get("set-cookie")
    ?.split(";")
    .find((v) => v.startsWith(".ASPXAUTH"));
  const auth = {
    cookie: `${loginCookie}; ${authToken}`,
  };

  await job("Setting language to english", () => setLanguage(auth, "en-GB"));

  return auth;
};

export const getSlots = async (
  { cookie }: Login,
  groupId: number,
  date: Date
) => {
  const passDate = date.toISOString().split("T")[0];

  console.log("Scraping group", groupId);
  const weekContentReponse = await fetch(
    `${APTUS}/CustomerBooking/BookingCalendar?bookingGroupId=${groupId}&passDate=${passDate}`,
    {
      headers: {
        ...headers,
        cookie,
      },
    }
  );

  const weekContent = parse(await weekContentReponse.text());

  const groupNameElement = weekContent.querySelector("#changeGroup");
  const child = groupNameElement?.querySelector("span");

  if (groupNameElement && child) {
    groupNameElement.removeChild(child);
  }

  const groupName = groupNameElement?.textContent.trim() ?? "UNKNOWN GROUP";

  console.log(getTime(), "... done scraping group", groupId, `(${groupName})`);

  const days = weekContent.querySelectorAll(".dayColumn");
  const weekDays = weekContent
    .querySelectorAll(".weekDay") // Lookup for the column dates
    .map(
      (v) =>
        v.getAttribute("aria-label")?.match(/(?<date>\w+\s+\d+\s+\w+)/)
          ?.groups?.["date"]
    )
    .map((v) => new Date(`${v} ${date.getFullYear()}`))
    .map(getISODateString);

  return {
    groupName,
    groupId,
    slots: days
      .map((day, i) => [weekDays[i], day] as [string, HTMLElement])
      .map(([day, dayElement]) => ({
        slots: dayElement
          .querySelectorAll(".interval")
          .filter((v) => !!v.textContent?.trim())
          .map(getBookable),
        day,
      })),
  };
};

export const scrapeWeek = async (
  user: User,
  auth: Login,
  groupIds: number[],
  date: Date
): Promise<LaundryWeek> => {
  const active =
    activeRequests[user.rentalId]?.[getDateString(date)]?.[
      JSON.stringify(groupIds)
    ];

  if (active) {
    return active;
  }

  const generatePromise = async () => {
    const groups = await Promise.all(
      groupIds.map((group) => getSlots(auth, group, date))
    );
    const daySlots = Array.from(
      new Set(groups.flatMap(({ slots }) => slots.map(({ day }) => day)))
    );
    const timeSlots: TimeRange[] = Array.from(
      new Set(
        groups.flatMap(({ slots }) =>
          slots.flatMap(({ slots }) =>
            slots.map(({ start, end }) => JSON.stringify({ start, end }))
          )
        )
      )
    ).map((v) => JSON.parse(v));

    return Object.fromEntries(
      Array.from(daySlots).map((day) => [
        day,
        timeSlots.map((time) => ({
          time,
          slots: groups.flatMap(({ groupName, groupId, slots }) =>
            slots
              .filter(({ day: slotDay }) => slotDay === day)
              .flatMap(({ slots }) =>
                slots
                  .filter(
                    ({ start, end }) => start === time.start && end === time.end
                  )
                  .map(({ status, pass }) => ({
                    groupName,
                    groupId,
                    status,
                    pass,
                  }))
              )
          ),
        })),
      ])
    );
  };

  const current = generatePromise();
  insertActiveRequest(user.rentalId, date, groupIds, current);

  return await current;
};

export const scrapeGroups = async ({ cookie }: Login) => {
  const categories = await fetch(
    `${APTUS}/CustomerBooking/CustomerCategories`,
    {
      headers: {
        ...headers,
        cookie,
      },
    }
  );

  const parsedCategories = parse(await categories.text());
  const dialog = [
    ...(parsedCategories
      .querySelector(`[aria-label=Laundry]`)
      ?.getAttribute("onclick")
      ?.matchAll(/LoadLocationGroupDialog\('(\w*)'\)/g) ?? []),
  ]?.[0]?.[1];

  if (!dialog) {
    console.log(
      "There was a problem accessing the dialog groups",
      parsedCategories
    );
    return [];
  }

  const locations = await fetch(
    `${APTUS}/CustomerBooking/CustomerLocationGroups?categoryId=${dialog}`,
    {
      headers: {
        ...headers,
        cookie,
        Referer: "https://sssb.aptustotal.se/AptusPortal/CustomerBooking",
      },
    }
  );

  const parsedLocations = parse(await locations.text());

  const groups = parsedLocations
    .querySelectorAll(".bookingNavigation")
    .filter((button) =>
      button.getAttribute("onclick")?.includes("BookingCalendarOverview")
    ) // Filter first available time
    .map((button) => ({
      id: [
        ...(button
          .getAttribute("onclick")
          ?.matchAll(/\?bookingGroupId=(\w*)/g) ?? []),
      ]?.[0]?.[1],
      name: button
        .querySelectorAll("td")
        .filter((el) => el.getAttribute("style")?.includes("white-space"))?.[0]
        ?.innerHTML?.replace(/(<([^>]+)>)/gi, ""), // Remove html tags
    }));

  return groups;
};

export type ActiveSlot = {
  date: Date;
  id: string;
  name: string;
};

export const scrapeActive = async ({
  cookie,
}: Login): Promise<ActiveSlot[]> => {
  const activeResponse = await fetch(`${APTUS}/CustomerBooking`, {
    headers: {
      ...headers,
      cookie,
    },
  });

  const getDate = (str?: string): Date | undefined => {
    if (!str) {
      return undefined;
    }

    const reg = str.match(
      /(?<day>\d+)\/(?<month>\d+)\/(?<year>\d+)\s*(?<time>\d+:\d+)/
    );

    if (!reg || !reg.groups) {
      return undefined;
    }

    const {
      groups: { day, month, year, time },
    } = reg;

    return new Date(`${year}-${month}-${day} ${time}`);
  };

  const activeContent = parse(await activeResponse.text());

  const cards = activeContent
    .querySelectorAll(".bookingCard")
    .filter((v) => v.getAttribute("data-disabled") !== "disabled");

  const active: ActiveSlot[] = cards
    .filter((v) => Boolean(v.querySelector("button")))
    .map((v) => ({
      date: getDate(v.querySelector("button")!.getAttribute("aria-label"))!,
      id: v.querySelector("button")!.getAttribute("id")!,
      name: `${v.querySelectorAll("div")?.[4]?.innerText.trim()} ${v
        .querySelectorAll("div")?.[3]
        ?.innerText.trim()}`,
    }))
    .filter(({ date, id }) => date && id);

  return active;
};

export const bookDay = async (
  user: User,
  auth: Login,
  groups: number[],
  day: string,
  start: string,
  group: number
) => {
  console.log("Booking group", { day, start, group });

  const week = await scrapeWeek(user, auth, groups, new Date(day));
  const { cookie } = auth;

  const bookings = week[day].find((v) => v.time.start === start);
  if (!bookings) {
    console.warn("No slots found with date", day, start);
    return;
  }

  const getJobs = async () => {
    const slot = bookings.slots
      .filter(({ status }) => status === "bookable")
      .find(({ groupId }) => groupId === group);

    if (!slot) return;

    const { pass, groupId } = slot;

    console.log("Booking pass", { pass, groupId });

    const res = await fetch(
      `${APTUS}/CustomerBooking/Book?passNo=${pass}&passDate=${day}&bookingGroupId=${groupId}`,
      {
        headers: {
          ...headers,
          cookie,
        },
        referrerPolicy: "strict-origin-when-cross-origin",
        mode: "cors",
        credentials: "include",
        redirect: "manual",
      }
    );

    const location = res.headers.get("location");
    if (location?.toLowerCase().includes("error")) {
      console.log("Error while booking", location);
    }

    console.log(getTime(), "... done booking group", { pass, groupId });
  };

  await job("Booking group", async () => await getJobs());
};

export const unbookId = async ({ cookie }: Login, id: string) => {
  await fetch(`${APTUS}/CustomerBooking/Unbook/${id}`, {
    headers: {
      ...headers,
      cookie,
    },
  });
};

export const unbookGroup = async (
  user: User,
  auth: Login,
  day: string,
  time: string,
  groups: number[]
) => {
  const [userGroups, active] = await Promise.all([
    await getGroups(user.rentalId),
    await scrapeActive(auth),
  ]);

  const unbooks = groups
    .map((group) => userGroups.find(({ id }) => id === `${group}`))
    .filter(Boolean)
    .map((userGroup) =>
      active
        .filter((v) => sameDate(new Date(`${day} ${time}`), v.date))
        .find((v) => v.name === userGroup!.name)
    )
    .filter(Boolean)
    .map((groupElement) => unbookId(auth, groupElement!.id));

  await job(`Unbooking ${groups}`, () => Promise.all(unbooks));
};
