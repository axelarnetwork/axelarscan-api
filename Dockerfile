FROM public.ecr.aws/lambda/nodejs:20

COPY --from=public.ecr.aws/datadog/lambda-extension:55 /opt/extensions/ /opt/extensions

COPY . ${LAMBDA_TASK_ROOT}

RUN corepack enable pnpm
RUN pnpm install datadog-lambda-js dd-trace

RUN pnpm install --frozen-lockfile

CMD [ "index.handler" ]
