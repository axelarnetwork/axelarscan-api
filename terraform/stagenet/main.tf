terraform {
  backend "s3" {
    bucket = "axelar-terraform"
    key    = "services/axelarscan/stagenet/terraform.tfstate"
    region = "us-east-2"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.31"
    }
  }
  required_version = ">= 1.6.6"
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Owner       = "Axelarscan"
      Environment = var.environment
      Terraform   = true
    }
  }
}

data "aws_api_gateway_domain_name" "stagenet" {
  domain_name = "stagenet.api.axelarscan.io"
}

locals {
  url_subpath_api_mapping = "api" # map apigw to url subpath /api from aws_api_gateway_domain_name
}

resource "aws_iam_role" "lambda_role" {
  name = "${var.package_name}-${var.environment}-role"
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
            Effect   = "Deny"
            Resource = "*"
          },
        ]
        Version = "2012-10-17"
      }
    )
  }
}

resource "aws_lambda_function" "function" {
  function_name = "${var.package_name}-${var.environment}"
  package_type  = "Image"
  image_uri     = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/${var.ecr_repository_name}:${var.tag}"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 30
  memory_size   = 512
  publish       = true
  environment {
    variables = {
      NODE_NO_WARNINGS      = 1
      ENVIRONMENT           = var.environment
      AWS_REGION            = var.aws_region
      INDEXER_SECRET_ARN    = var.indexer_secret_arn
      LOG_LEVEL             = var.log_level
      DD_LAMBDA_HANDLER     = "dist/index.handler"
      DD_SITE               = "datadoghq.com"
      DD_API_KEY_SECRET_ARN = var.datadog_api_key_secret_arn
      DD_TRACE_ENABLED      = false
      DD_ENHANCED_METRICS   = false
      DD_ENV                = var.environment
      DD_SERVICE            = "${var.package_name}-${var.environment}"
      DD_VERSION            = var.tag
    }
  }
  image_config {
    command = [
      "node_modules/datadog-lambda-js/dist/handler.handler",
    ]
  }
  kms_key_arn = ""
}

resource "aws_lambda_provisioned_concurrency_config" "config" {
  function_name                     = aws_lambda_function.function.function_name
  provisioned_concurrent_executions = 10
  qualifier                         = aws_lambda_function.function.version
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.package_name}-${var.environment}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_headers = ["*"]
    allow_methods = ["*"]
  }
  route_key = "ANY /${aws_lambda_function.function.function_name}"
  target    = aws_lambda_function.function.arn
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  connection_type        = "INTERNET"
  description            = "Lambda Integration - terraform"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.function.invoke_arn
  integration_type       = "AWS_PROXY"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_stage" "stagenet" {
  api_id      = aws_apigatewayv2_api.api.id
  auto_deploy = true
  name        = var.environment
}

resource "aws_apigatewayv2_api_mapping" "stagenet" {
  api_id          = aws_apigatewayv2_api.api.id
  domain_name     = data.aws_api_gateway_domain_name.stagenet.id
  stage           = aws_apigatewayv2_stage.stagenet.id
  api_mapping_key = local.url_subpath_api_mapping
}

resource "aws_apigatewayv2_route" "route" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "route_method" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /{method}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}
