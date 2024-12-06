import { styled } from "styled-components";

import {
  LaundrySlot,
  LaundryStatus,
  LaundryStatusResponse,
} from "../util/api/api";
import { useAPI, usePostEndpoint } from "../util/api/provider";

const FloatingText = styled.div`
  position: absolute;
  top: 0;
  padding: 10px;
`;

const Wrapper = styled.button<{
  status: LaundryStatus;
  loading: number;
}>`
  position: relative;
  border-radius: 3px;
  border: 1px solid black;
  padding: 0.8rem;
  max-width: 320px;
  height: 100px;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  justify-content: center;
  color: #fafafa;
  user-select: none;

  ${({ status }) =>
    status === "own" &&
    `
    cursor: pointer;
    background: #9E6F21;
  `}

  ${({ status }) =>
    status === "bookable" &&
    `
    cursor: pointer;
    background: #41644A;
    
  `}

${({ status }) =>
    status === "booked" &&
    `
    pointer-events: none;
    background: #717171;
  `}

  ${({ loading }) =>
    loading &&
    `
    cursor: wait;
  `}
`;

export const Slot = ({
  day,
  time,
  groupName,
  groupId,
  status,
  onWeekUpdate,
}: {
  day: string;
  time: string;
  onWeekUpdate: (data: LaundryStatusResponse) => void;
} & LaundrySlot) => {
  const api = useAPI();

  const {
    loading: bookLoading,
    error: bookError,
    refresh: book,
  } = usePostEndpoint(api.book);

  const {
    loading: unbookLoading,
    error: unbookError,
    refresh: unbook,
  } = usePostEndpoint(api.unbook);

  const loading = bookLoading || unbookLoading;
  const error = bookError || unbookError;

  const action = async () => {
    if (loading) return;
    if (status === "booked") return;

    if (status === "own") {
      const data = await unbook(day, time, groupId);
      onWeekUpdate(data);
    } else if (status === "bookable") {
      const data = await book(day, time, groupId);
      onWeekUpdate(data);
    }
  };

  return (
    <Wrapper status={status} loading={loading ? 1 : 0} onClick={action}>
      {loading ? (
        <FloatingText>Loading ...</FloatingText>
      ) : error !== null ? (
        <FloatingText>Error: {error}</FloatingText>
      ) : (
        <></>
      )}
      <h3 style={{ fontWeight: "900" }}>{groupName}</h3>
      {status === "own" ? (
        <FloatingText style={{ bottom: 0, top: "unset" }}>
          Booked by you
        </FloatingText>
      ) : (
        <></>
      )}
    </Wrapper>
  );
};
