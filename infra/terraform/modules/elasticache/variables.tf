variable "vpc_id" {
  description = "ID of the VPC where ElastiCache will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the ElastiCache subnet group"
  type        = list(string)
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "cache_node_type" {
  description = "The compute and memory capacity of the nodes"
  type        = string
  default     = "cache.t3.small" # Good for dev, adjust for production
}

variable "redis_port" {
  description = "The port on which ElastiCache accepts connections"
  type        = number
  default     = 6379
}

variable "redis_version" {
  description = "Redis version to use for the cluster"
  type        = string
  default     = "6.2"
}

variable "apply_immediately" {
  description = "Specifies whether any database modifications are applied immediately"
  type        = bool
  default     = false
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}