# syntax=docker/dockerfile:1
# Brushlog as a static site: build with Node, serve with unprivileged nginx on :8080.
#   docker build -t brushlog .                               # served at /
#   docker build --build-arg BASE_PATH=/brushlog/ -t brushlog .   # served at /brushlog/

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BASE_PATH=/
RUN BASE_PATH="$BASE_PATH" npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html${BASE_PATH}
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO /dev/null http://127.0.0.1:8080/healthz || exit 1
