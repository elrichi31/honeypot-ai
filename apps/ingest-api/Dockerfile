FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh && chown -R node:node /app

# Mount point for the uploaded-samples volume. Docker initialises an empty named
# volume from the image's directory, ownership included — without this the
# volume lands as root:root and the node user gets EACCES on every sample it
# tries to store.
RUN mkdir -p /malware-store && chown node:node /malware-store

USER node

CMD ["./entrypoint.sh"]
