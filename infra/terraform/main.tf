provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  name = "uc-hub-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
  enable_vpn_gateway = false

  tags = {
    Project = "uc-hub"
    Environment = var.environment
  }
}

module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_name    = "uc-hub-${var.environment}"
  cluster_version = "1.26"
  subnets         = module.vpc.private_subnets

  vpc_id = module.vpc.vpc_id

  node_groups = {
    application = {
      desired_capacity = 3
      max_capacity     = 5
      min_capacity     = 2

      instance_type = "t3.medium"
      disk_size     = 50

      additional_tags = {
        Project = "uc-hub"
        Environment = var.environment
      }
    }
  }

  tags = {
    Project = "uc-hub"
    Environment = var.environment
  }
}

module "mongodb_atlas" {
  source = "./modules/mongodb_atlas"
  project_name = "uc-hub-${var.environment}"
  mongodb_atlas_api_pub_key = var.mongodb_atlas_api_pub_key
  mongodb_atlas_api_pri_key = var.mongodb_atlas_api_pri_key
  mongodb_atlas_org_id = var.mongodb_atlas_org_id
  environment = var.environment
}

module "redis_elasticache" {
  source = "./modules/elasticache"
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  environment = var.environment
}
