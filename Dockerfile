# syntax = docker/dockerfile:1

ARG NODE_VERSION=20.13.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app
ENV NODE_ENV="production"

# ---------- build stage ----------
FROM base AS build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3
COPY package-lock.json package.json ./
RUN npm ci
COPY . .

# ---------- final image ----------
FROM base
# ensure the persistent mount point exists (Fly volume mounts to /data)
RUN mkdir -p /data/uploads

# bring app + node_modules from build stage
COPY --from=build /app /app

# (Optional) This is metadata only; matches fly.toml internal_port=5000
EXPOSE 5000

# Fly will use [processes] command from fly.toml ("npm start")
# If you run locally with docker run, this will still work:
CMD ["node", "server.js"]
