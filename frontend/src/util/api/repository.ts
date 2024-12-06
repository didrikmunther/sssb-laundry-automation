export interface IAPIRepository {
  fetch: <R extends object, T extends object>(
    url: string,
    body?: T
  ) => Promise<R>;
}

const apiFetcher = (id: string, rootUrl: string) => {
  return async <R extends object, T extends object>(
    url: string,
    body?: T
  ): Promise<R> => {
    const result = await fetch(`${rootUrl}${url}`, {
      method: "POST",
      body: body ? JSON.stringify(body) : "",
      headers: new Headers({
        "content-type": "application/json",
        "rental-id": id,
      }),
    });

    return await result.json();
  };
};

type APIRepositorySettings = {
  url?: string;
};

/**
 * @param id rental id
 * @returns An APIRepository
 */
export const APIRepository = (
  id: string,
  { url }: APIRepositorySettings = {}
): IAPIRepository => ({
  fetch: apiFetcher(id, url ?? ""),
});
