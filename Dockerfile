FROM public.ecr.aws/lambda/nodejs:20

COPY --from=public.ecr.aws/datadog/lambda-extension:55 /opt/extensions/ /opt/extensions

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm
RUN pnpm install datadog-lambda-js dd-trace

RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY . ${LAMBDA_TASK_ROOT}
RUN pnpm build

CMD [ "index.handler" ]
