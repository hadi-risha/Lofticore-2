# Lofticore API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t lofticore-api .
#
# Two stages: one with everything needed to build, and a small one that carries
# only the bundled server and its production dependencies.

FROM node:22-slim AS build
WORKDIR /app

# manifests first, so installs are cached until a dependency changes
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# git hooks (husky) are for developers, not for images
RUN npm pkg delete scripts.prepare && npm ci --workspace=@lofticore/api

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@lofticore/api


FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm pkg delete scripts.prepare && npm ci --workspace=@lofticore/api --omit=dev && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist
# seed photos; uploads go to Cloudinary in production (see docs/DEPLOYMENT.md)
COPY apps/api/public apps/api/public

# the server resolves ./public from its working directory
WORKDIR /app/apps/api
USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
