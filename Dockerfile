FROM node:23-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

COPY config/env/staging.env staging.env

RUN npm run build

EXPOSE 7000

CMD ["npm", "run" ,"start:prod"]