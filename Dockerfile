FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV HEADLESS=true
ENV SLOW_MO=50

CMD ["node", "src/index.js"]