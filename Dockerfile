FROM node:16 AS base
WORKDIR /usr/src/app

FROM base AS frontend
COPY frontend/package.json .
COPY frontend/yarn.lock .
RUN yarn install
COPY frontend/. .
RUN yarn build

FROM base AS backend
COPY package.json .
COPY yarn.lock .
RUN yarn install
COPY . .
COPY --from=frontend /usr/src/app/build ./frontend/build

CMD yarn start