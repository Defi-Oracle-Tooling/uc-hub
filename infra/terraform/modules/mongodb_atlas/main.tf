// MongoDB Atlas Terraform module for UC-Hub

terraform {
  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.9.0"
    }
  }
}

provider "mongodbatlas" {
  public_key  = var.mongodb_atlas_api_pub_key
  private_key = var.mongodb_atlas_api_pri_key
}

resource "mongodbatlas_project" "uc_hub" {
  name   = var.project_name
  org_id = var.mongodb_atlas_org_id
}

resource "mongodbatlas_cluster" "uc_hub_cluster" {
  project_id = mongodbatlas_project.uc_hub.id
  name       = "${var.project_name}-cluster"

  provider_name               = "AWS"
  provider_region_name        = var.region
  provider_instance_size_name = var.instance_size
  mongo_db_major_version      = var.mongodb_version
  
  cluster_type = "REPLICASET"
  replication_specs {
    num_shards = 1
    regions_config {
      region_name     = var.region
      electable_nodes = 3
      priority        = 7
      read_only_nodes = 0
    }
  }

  backup_enabled               = true
  pit_enabled                  = var.environment == "prod" ? true : false
  auto_scaling_disk_gb_enabled = true
  
  // Apply tags for better resource management
  tags {
    key   = "Environment"
    value = var.environment
  }
  
  tags {
    key   = "Project"
    value = "UC-Hub"
  }
}

// Create database user
resource "mongodbatlas_database_user" "uc_hub_db_user" {
  username           = "uc-hub-app-user"
  password           = var.db_user_password
  project_id         = mongodbatlas_project.uc_hub.id
  auth_database_name = "admin"

  // Permissions for the user (read-write to the application database)
  roles {
    role_name     = "readWrite"
    database_name = "uc-hub"
  }
  
  // Add admin role for the metrics database if in production
  dynamic "roles" {
    for_each = var.environment == "prod" ? [1] : []
    content {
      role_name     = "readWrite"
      database_name = "uc-hub-metrics"
    }
  }
  
  // Add additional security settings in production
  scopes {
    name = mongodbatlas_cluster.uc_hub_cluster.name
    type = "CLUSTER"
  }
}

// Configure network access
resource "mongodbatlas_project_ip_access_list" "cluster_access" {
  project_id = mongodbatlas_project.uc_hub.id
  
  dynamic "cidr_block" {
    for_each = var.allowed_cidr_blocks
    content {
      cidr_block = cidr_block.value
      comment    = "Allow access from ${var.environment} environment"
    }
  }
}

// Enable Private Link for production environments
resource "mongodbatlas_privatelink_endpoint" "uc_hub_privatelink" {
  count          = var.environment == "prod" || var.environment == "staging" ? 1 : 0
  project_id     = mongodbatlas_project.uc_hub.id
  provider_name  = "AWS"
  region         = var.region
}

output "connection_string" {
  value     = mongodbatlas_cluster.uc_hub_cluster.connection_strings[0].standard_srv
  sensitive = true
}

output "cluster_id" {
  value = mongodbatlas_cluster.uc_hub_cluster.id
}

output "project_id" {
  value = mongodbatlas_project.uc_hub.id
}