FROM node:20-alpine AS development
COPY . /app
WORKDIR /app
RUN npm ci

EXPOSE 3000
CMD ["npm", "run", "dev"]


FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build


FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev          # production deps only

COPY --from=builder /app/build ./build

EXPOSE 3000
CMD ["npm", "run", "start"]    # runs the RR7 Node server