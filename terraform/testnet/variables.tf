variable "tag" {
  description = "Docker image tag (commit SHA)"
  type        = string

  validation {
    # Expect a full git commit SHA: exactly 40 lowercase hex characters
    condition     = can(regex("^[0-9a-f]{40}$", var.tag))
    error_message = "Variable \"tag\" must be a full git commit SHA (exactly 40 lowercase hex characters)."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "aws_account_id" {
  description = "AWS Account ID"
  type        = string
  sensitive   = true
}

variable "package_name" {
  description = "Package name"
  type        = string
  default     = "axelarscan-api"
}

variable "environment" {
  description = "Environment"
  type        = string
  default     = "testnet"
}

variable "log_level" {
  description = "Log level"
  type        = string
  default     = "info"
}

variable "ecr_repository_name" {
  description = "ECR repository name for the Docker image"
  type        = string
  default     = "axelarscan-api"
}

variable "datadog_api_key_secret_arn" {
  description = "ARN of the Datadog API key secret in AWS Secrets Manager"
  type        = string
  sensitive   = true
}

variable "indexer_secret_arn" {
  description = "ARN of the indexer credentials secret in AWS Secrets Manager"
  type        = string
  sensitive   = true
}
