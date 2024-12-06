import styled from "styled-components";
import { APIService } from "../util/api/api";
import { APIProvider } from "../util/api/provider";
import { APIRepository } from "../util/api/repository";
import { Groups } from "./Groups";

// import { MockAPIRepository } from "../util/api/mockRepository";
// const mockApi = APIService(
//   MockAPIRepository({
//     delay: 500,
//     log: true,
//   })
// );

const getDayName = (dateStr: any, locale: any) => {
  var date = new Date(dateStr);
  return date.toLocaleDateString(locale, { weekday: "long" });
};

const query = new URLSearchParams(window.location.search);

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem;
`;

export const App = () => {
  const id = query.get("id");
  const day = query.get("day");
  const time = query.get("time");

  if (!id || !day || !time) {
    return <div>`Missing 'id', 'day', or 'time' query.`</div>;
  }

  return (
    <APIProvider
      value={APIService(
        APIRepository(id, {
          // url: "http://localhost:80",
        })
      )}
    >
      {/* <APIProvider value={mockApi}> */}
      <Wrapper>
        <h1>
          {getDayName(day, "en-us")} {day} - {time}
        </h1>
        <Groups day={day} time={time} />
      </Wrapper>
    </APIProvider>
  );
};
