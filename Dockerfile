FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

ENV PORT=38889
ENV DATA_DIR=/app/data
EXPOSE 38889

VOLUME ["/app/data"]

CMD ["node", "server.js"]
