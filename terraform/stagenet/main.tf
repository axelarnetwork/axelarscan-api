terraform {
  backend "s3" {
    bucket = "axelar-terraform"
    key    = "services/axelarscan-api/stagenet/terraform.tfstate"
    region = "us-east-2"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.14"
    }
  }
  required_version = ">= 1.0.0"
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Owner       = "AxelarScan"
      Environment = var.environment
      Terraform   = true
    }
  }
}

provider "archive" {}

data "archive_file" "zip_api" {
  type        = "zip"
  source_dir  = "../../functions/api"
  excludes    = ["yarn.lock", ".env.example", ".env", "test"]
  output_path = "${var.project_name}-api.zip"
}

data "aws_iam_policy_document" "policy" {
  statement {
    sid     = ""
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      identifiers = ["lambda.amazonaws.com"]
      type        = "Service"
    }
  }
}

resource "aws_iam_role" "axelarscan_lambda" {
  name = "${var.project_name}-${var.environment}-role"
  assume_role_policy = jsonencode(
    {
      Statement = [
        {
          Action = "sts:AssumeRole"
          Effect = "Allow"
          Principal = {
            Service = "lambda.amazonaws.com"
          }
        },
      ]
      Version = "2012-10-17"
    }
  )

  inline_policy {
    name = "secret_manager_policy"
    policy = jsonencode(
      {
        Statement = [
          {
            Action = [
              "secretsmanager:GetSecretValue",
            ]
            Effect   = "Allow"
            Resource = "*"
          },
        ]
        Version = "2012-10-17"
      }
    )
  }

  inline_policy {
    name = "lambda_execution_policy"
    policy = jsonencode(
      {
        Statement = [
          {
            Action = [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ]
            Effect   = "Allow"
            Resource = "*"
          },
        ]
        Version = "2012-10-17"
      }
    )
  }
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-${var.environment}"
  filename         = data.archive_file.zip_api.output_path
  source_code_hash = data.archive_file.zip_api.output_base64sha256
  role             = aws_iam_role.axelarscan_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs14.x"
  timeout          = 30
  memory_size      = 512
  publish          = true
  environment {
    variables = {
      NODE_NO_WARNINGS           = 1
      ENVIRONMENT                = var.environment
      GENERAL_INDEXER_URL        = var.general_indexer_url
      GENERAL_INDEXER_USERNAME   = var.general_indexer_username
      GENERAL_INDEXER_PASSWORD   = var.general_indexer_password
      TRANSFERS_INDEXER_URL      = var.transfers_indexer_url
      TRANSFERS_INDEXER_USERNAME = var.transfers_indexer_username
      TRANSFERS_INDEXER_PASSWORD = var.transfers_indexer_password
      LOG_LEVEL                  = var.log_level
    }
  }
  kms_key_arn = ""
}

resource "aws_lambda_provisioned_concurrency_config" "config" {
  function_name                     = aws_lambda_function.api.function_name
  provisioned_concurrent_executions = 100
  qualifier                         = aws_lambda_function.api.version
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-${var.environment}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_headers = ["*"]
    allow_methods = ["*"]
  }
  target = aws_lambda_function.api.arn
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  connection_type        = "INTERNET"
  description            = "Lambda Integration - terraform"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_type       = "AWS_PROXY"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "route_default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "route_cross-chain" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /cross-chain/{function}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "route_function" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /{function}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "lambda" {
  api_id      = aws_apigatewayv2_api.api.id
  auto_deploy = true
  name        = "stagenet"
}

data "aws_acm_certificate" "api_axelarscan_io" {
  domain   = "*.api.axelarscan.io"
  statuses = ["ISSUED"]
}

resource "aws_apigatewayv2_domain_name" "stagenet" {
  domain_name = "stagenet.api.axelarscan.io"
  domain_name_configuration {
    certificate_arn = data.aws_acm_certificate.api_axelarscan_io.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "stagenet" {
  api_id      = aws_apigatewayv2_api.api.id
  stage       = aws_apigatewayv2_stage.lambda.id
  domain_name = aws_apigatewayv2_domain_name.stagenet.domain_name
}

data "archive_file" "zip_axelar_crawler" {
  type        = "zip"
  source_dir  = "../../functions/axelar-crawler"
  excludes    = ["yarn.lock", ".env.example", ".env", "local.js"]
  output_path = "${var.project_name}-axelar-crawler.zip"
}

resource "aws_lambda_function" "axelar_crawler" {
  function_name    = "${var.project_name}-axelar-crawler-${var.environment}"
  filename         = data.archive_file.zip_axelar_crawler.output_path
  source_code_hash = data.archive_file.zip_axelar_crawler.output_base64sha256
  role             = aws_iam_role.axelarscan_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs14.x"
  timeout          = 900
  memory_size      = 1536
  environment {
    variables = {
      NODE_NO_WARNINGS = 1
      ENVIRONMENT      = var.environment
      LOG_LEVEL        = var.log_level
    }
  }
  kms_key_arn = ""
}

resource "aws_lambda_permission" "axelar_crawler" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.axelar_crawler.function_name
  statement_id  = "AllowCloudwatchEventBusInvoke"
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule_axelar_crawler.arn
}

resource "aws_cloudwatch_event_rule" "schedule_axelar_crawler" {
  name                = "${var.project_name}-axelar-crawler-${var.environment}-rule"
  schedule_expression = "cron(*/10 * * * ? *)"
}

resource "aws_cloudwatch_event_target" "target_axelar_crawler" {
  rule      = aws_cloudwatch_event_rule.schedule_axelar_crawler.name
  target_id = aws_lambda_function.axelar_crawler.id
  arn       = aws_lambda_function.axelar_crawler.arn
}

data "archive_file" "zip_evm_crawler" {
  type        = "zip"
  source_dir  = "../../functions/evm-crawler"
  excludes    = ["yarn.lock", ".env.example", ".env", "local.js", "sync.js"]
  output_path = "${var.project_name}-evm-crawler.zip"
}

resource "aws_lambda_function" "evm_crawler" {
  function_name    = "${var.project_name}-evm-crawler-${var.environment}"
  filename         = data.archive_file.zip_evm_crawler.output_path
  source_code_hash = data.archive_file.zip_evm_crawler.output_base64sha256
  role             = aws_iam_role.axelarscan_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs14.x"
  timeout          = 630
  memory_size      = 1536
  environment {
    variables = {
      NODE_NO_WARNINGS = 1
      ENVIRONMENT      = var.environment
      LOG_LEVEL        = var.log_level
    }
  }
  kms_key_arn = ""
}

resource "aws_lambda_permission" "evm_crawler" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evm_crawler.function_name
  statement_id  = "AllowCloudwatchEventBusInvoke"
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule_evm_crawler.arn
}

resource "aws_cloudwatch_event_rule" "schedule_evm_crawler" {
  name                = "${var.project_name}-evm-crawler-${var.environment}-rule"
  schedule_expression = "cron(*/10 * * * ? *)"
}

resource "aws_cloudwatch_event_target" "target_evm_crawler" {
  rule      = aws_cloudwatch_event_rule.schedule_evm_crawler.name
  target_id = aws_lambda_function.evm_crawler.id
  arn       = aws_lambda_function.evm_crawler.arn
}
