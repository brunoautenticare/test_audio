FROM node:18-slim

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

ENV PORT=8080

CMD [ "node", "dist/index.js" ]