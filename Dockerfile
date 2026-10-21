# CI sets REGISTRY to our ECR mirror of public.ecr.aws (same paths), which
# avoids the public registry's per-IP pull limits; local builds use the default
ARG REGISTRY=public.ecr.aws

FROM ${REGISTRY}/datadog/lambda-extension:55 AS datadog-extension

FROM ${REGISTRY}/lambda/nodejs:20

COPY --from=datadog-extension /opt/extensions/ /opt/extensions

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm
RUN pnpm install --frozen-lockfile

# Install datadog packages after frozen lockfile install
RUN pnpm install datadog-lambda-js dd-trace

# Copy source code and build
COPY . ${LAMBDA_TASK_ROOT}
RUN pnpm build

CMD [ "dist/index.handler" ]
