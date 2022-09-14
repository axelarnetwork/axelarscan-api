variable "aws_region" {
  description = "AWS region"
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "AWS profile"
  default     = "axelarscan.io"
}

variable "package_name" {
  description = "Package name"
  default     = "axelarscan"
}

variable "environment" {
  description = "Environment"
  default     = "mainnet"
}

variable "indexer_username" {
  description = "Indexer username"
  default     = ""
}

variable "indexer_password" {
  description = "Indexer password"
  default     = ""
}

variable "transfers_indexer_username" {
  description = "Transfers indexer username"
  default     = ""
}

variable "transfers_indexer_password" {
  description = "Transfers indexer password"
  default     = ""
}

variable "api_gateway_integration_id" {
  description = "API gateway integration id"
  default     = ""
}

variable "log_level" {
  description = "Log level"
  default     = "debug"
}