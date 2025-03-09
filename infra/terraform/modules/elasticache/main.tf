// ElastiCache Redis module for UC-Hub caching layer

resource "aws_security_group" "redis" {
  name        = "uc-hub-redis-${var.environment}"
  description = "Allow Redis inbound traffic from application"
  vpc_id      = var.vpc_id

  // Allow Redis traffic from the VPC
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "uc-hub-redis-sg"
    Environment = var.environment
    Project     = "UC-Hub"
  }
}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "uc-hub-redis-subnet-${var.environment}"
  subnet_ids = var.subnet_ids

  tags = {
    Environment = var.environment
    Project     = "UC-Hub"
  }
}

resource "aws_elasticache_parameter_group" "redis" {
  name   = "uc-hub-redis-params-${var.environment}"
  family = "redis6.x"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = {
    Environment = var.environment
    Project     = "UC-Hub"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "uc-hub-cache-${var.environment}"
  replication_group_description = "UC-Hub Redis Cache ${var.environment}"
  node_type                     = var.cache_node_type
  port                          = 6379
  parameter_group_name          = aws_elasticache_parameter_group.redis.name
  subnet_group_name             = aws_elasticache_subnet_group.redis.name
  security_group_ids            = [aws_security_group.redis.id]
  automatic_failover_enabled    = var.environment == "prod" ? true : false
  
  // Production gets multi-AZ, other environments single node for cost savings
  num_cache_clusters           = var.environment == "prod" ? 2 : 1
  multi_az_enabled             = var.environment == "prod"
  
  // Enable encryption for all environments
  at_rest_encryption_enabled   = true
  transit_encryption_enabled   = true
  
  // Enable auto backup for prod and staging
  snapshot_retention_limit     = var.environment == "dev" ? 0 : 7
  snapshot_window              = "03:00-04:00"
  maintenance_window           = "sun:05:00-sun:06:00"
  
  // Enable auto minor version upgrades
  auto_minor_version_upgrade   = true

  tags = {
    Environment = var.environment
    Project     = "UC-Hub"
  }
  
  lifecycle {
    prevent_destroy = var.environment == "prod"
  }
}

// Output connection information
output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_reader_endpoint" {
  value = aws_elasticache_replication_group.redis.reader_endpoint_address
}

output "connection_string" {
  value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
}