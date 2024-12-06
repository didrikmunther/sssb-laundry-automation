import { styled } from "styled-components";

import { useAPI, useEndpoint, usePostEndpoint } from "../util/api/provider";
import { Slot } from "./Slot";
import { ReactNode } from "react";

const GroupsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
`;

const GroupWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  justify-content: center;
`;

const RefreshButtonWrapper = styled.button`
  font-size: 16px;
  font-weight: 200;
  letter-spacing: 1px;
  padding: 13px 20px 13px;
  outline: 0;
  border: 1px solid black;
  cursor: pointer;
  position: relative;
  background-color: rgba(0, 0, 0, 0);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;

  &:after {
    content: "";
    background-color: #ffe54c;
    width: 100%;
    z-index: -1;
    position: absolute;
    height: 100%;
    top: 7px;
    left: 7px;
    transition: 0.2s;
  }

  &:hover:after {
    top: 0px;
    left: 0px;
  }
`;

const UpdateButtonWrapper = styled.button`
  background-color: #3dd1e7;
  border: 0 solid #e5e7eb;
  box-sizing: border-box;
  color: #000000;
  display: flex;
  font-size: 1rem;
  font-weight: 700;
  justify-content: center;
  line-height: 1.75rem;
  padding: 0.75rem 1.65rem;
  position: relative;
  text-align: center;
  text-decoration: none #000000 solid;
  text-decoration-thickness: auto;
  width: 100%;
  max-width: 190px;
  position: relative;
  cursor: pointer;
  transform: rotate(-2deg);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;

  &:focus {
    outline: 0;
  }

  &:after {
    content: "";
    position: absolute;
    border: 1px solid #000000;
    bottom: 4px;
    left: 4px;
    width: calc(100% - 1px);
    height: calc(100% - 1px);
  }

  &:hover:after {
    bottom: 2px;
    left: 2px;
  }
`;

const RefreshButton = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) => {
  return (
    <RefreshButtonWrapper onClick={onClick}>{children}</RefreshButtonWrapper>
  );
};

const UpdateCalendarButton = ({ onRefresh }: { onRefresh: () => void }) => {
  const api = useAPI();
  const { loading, refresh } = usePostEndpoint(api.update);

  return (
    <>
      {loading ? (
        <>Loading (this will take a long time) ...</>
      ) : (
        <UpdateButtonWrapper
          onClick={async () => {
            await refresh();
            onRefresh();
          }}
        >
          Update calendar
        </UpdateButtonWrapper>
      )}
    </>
  );
};

export const Groups = ({ day, time }: { day: string; time: string }) => {
  const api = useAPI();
  const {
    data: groups,
    loading,
    error,
    refresh,
    set,
  } = useEndpoint(api.status, day, time);

  return (
    <GroupsWrapper>
      {loading ? (
        <>Loading ...</>
      ) : error !== null ? (
        <>
          <div>There was an error: {error}</div>
        </>
      ) : (
        <>
          <GroupWrapper>
            {Object.entries(groups)
              .find(([date, _]) => date === day)?.[1]
              .find(({ time: { start } }) => start === time)
              ?.slots.map((slot) => (
                <Slot
                  key={slot.groupId}
                  onWeekUpdate={set}
                  time={time}
                  day={day}
                  {...slot}
                />
              ))}
          </GroupWrapper>

          <RefreshButton onClick={refresh}>Refresh</RefreshButton>
          <UpdateCalendarButton onRefresh={refresh} />
        </>
      )}
    </GroupsWrapper>
  );
};
