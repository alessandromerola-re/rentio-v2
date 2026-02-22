FROM node:24-alpine
WORKDIR /app
ARG VITE_CORE_API_URL=http://localhost:3001
ENV VITE_CORE_API_URL=$VITE_CORE_API_URL
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
