variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "mongodb_atlas_api_pub_key" {
  description = "MongoDB Atlas API Public Key"
  type        = string
}

variable "mongodb_atlas_api_pri_key" {
  description = "MongoDB Atlas API Private Key"
  type        = string
  sensitive   = true
}

variable "mongodb_atlas_org_id" {
  description = "MongoDB Atlas Organization ID"
  type        = string
}
