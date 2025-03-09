variable "project_name" {
  description = "The name of the MongoDB Atlas project"
  type        = string
}

variable "mongodb_atlas_org_id" {
  description = "MongoDB Atlas Organization ID"
  type        = string
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

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS region for MongoDB Atlas cluster"
  type        = string
  default     = "US_WEST_2"
}

variable "instance_size" {
  description = "Instance size for MongoDB Atlas cluster"
  type        = string
  default     = "M10" # Free tier for dev, adjust for production
}

variable "mongodb_version" {
  description = "MongoDB major version"
  type        = string
  default     = "6.0"
}

variable "db_user_password" {
  description = "Password for the database user"
  type        = string
  sensitive   = true
}

variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks to allow access to MongoDB Atlas"
  type        = list(string)
  default     = ["0.0.0.0/0"] # Allow all for development, restrict for production
}