import { USERS, User } from "./constants";
import { job } from "./log";
import { login, scrapeGroups } from "./tvatt";

export const getGroups = async (
  id: string
): Promise<
  {
    id: string;
    name: string;
  }[]
> => {
  const auth = await job("Login", () => login(id));

  const groups = await job("Scraping groups", async () => {
    return await scrapeGroups(auth);
  });

  return groups;
};

const main = async () => {
  const rentalId = process.argv[2];

  if (rentalId == undefined) {
    console.log("Usage: get:groups <user rental id>");
    return;
  }

  const groups = await job("Main module getting groups", () =>
    getGroups(rentalId)
  );

  console.log(groups);

  console.log(`[${groups.map((v) => v.id).join(',')}]`);
};

if (require.main === module) {
  main();
}
