import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { APIService } from "./api";
import { MockAPIRepository } from "./mockRepository";

const timeout = async (delay: number) =>
  new Promise((res) => setTimeout(res, delay));

const APIContext = createContext(APIService(MockAPIRepository()));

type APIType = ReturnType<typeof APIService>;
type ValueIn<T> = T[keyof T];

export const APIProvider = ({
  value,
  children,
}: {
  value: APIType;
  children: ReactNode;
}) => <APIContext.Provider value={value}>{children}</APIContext.Provider>;

export const useAPI = () => useContext(APIContext);

// Automatically refresh on new args
export const useEndpoint = <
  T extends ValueIn<APIType>,
  R extends Awaited<ReturnType<T>>
>(
  endpoint: T,
  ...args: Parameters<T>
): {
  refresh: () => void;
  _refresh: (...args: Parameters<T>) => Promise<R>;
  set: (data: R) => void;
} & (
  | {
      data: R;
      loading: false;
      error: null;
    }
  | {
      data: null;
      loading: true;
      error: null;
    }
  | {
      data: null;
      loading: false;
      error: string;
    }
) => {
  const {
    refresh: _refresh,
    data,
    loading,
    error,
    set,
  } = usePostEndpoint<T, R>(endpoint);

  const refresh = useCallback(async () => {
    try {
      await (_refresh as any).apply(void 0, args as any);
    } catch (_) {}

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_refresh, ...args]);

  useEffect(() => {
    const id = setTimeout(() => {
      refresh();
    }, 100);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...args]);

  if (data === null && error === null && !loading) {
    return { _refresh, set, refresh, data: null, error: null, loading: true };
  } else {
    return { _refresh, set, refresh, data, error, loading } as any;
  }
};

export const usePostEndpoint = <
  T extends ValueIn<APIType>,
  R extends Awaited<ReturnType<T>>
>(
  endpoint: T
): {
  refresh: (...args: Parameters<T>) => Promise<R>;
  set: (data: R) => void;
} & (
  | {
      data: R;
      loading: false;
      error: null;
    }
  | {
      data: null;
      loading: true;
      error: null;
    }
  | {
      data: null;
      loading: false;
      error: string;
    }
  | {
      data: null;
      loading: false;
      error: null;
    }
) => {
  const controller = useRef(new AbortController());
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const refresh = useCallback(
    async (...args: Parameters<T>) => {
      controller.current.abort();
      const newController = new AbortController();
      controller.current = newController;

      setLoading(true);
      await timeout(0); // Make sure loading is true

      if (!newController.signal.aborted) {
        setData(null);
        setError(null);
      }

      try {
        const result = await (endpoint as any).apply(void 0, args as any);

        if (!newController.signal.aborted) {
          setData(result as R);
          setLoading(false);
        }

        return result;
      } catch (e) {
        if (!newController.signal.aborted) {
          if (e instanceof Error) {
            setError(e.message);
          } else {
            setError(e as string);
          }

          setLoading(false);
        }

        throw e;
      }
    },
    [setData, setError, controller, endpoint]
  );

  const retur = {
    refresh,
    set: setData,
  };

  // Enforce discriminated union type hinting
  if (loading) {
    return {
      data: null,
      error: null,
      loading: true,
      ...retur,
    };
  } else if (error !== null) {
    console.log(error);

    return {
      data: null,
      error,
      loading: false,
      ...retur,
    };
  } else if (data !== null) {
    return {
      data,
      error: null,
      loading: false,
      ...retur,
    };
  } else {
    return {
      data: null,
      error: null,
      loading: false,
      ...retur,
    };
  }
};
