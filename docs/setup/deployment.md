# UC-Hub Deployment Guide

This guide provides instructions for deploying the UC-Hub project to production environments using Kubernetes.

## Prerequisites

Before you begin, ensure you have the following:

- **Kubernetes cluster** (AKS, EKS, GKE, or self-hosted)
- **kubectl** configured to access your cluster
- **Helm** (v3 or later)
- **Docker registry** access
- **Domain name** for the application
- **SSL certificates** for secure communication
- **PostgreSQL database** (managed service or self-hosted)
- **Redis** (managed service or self-hosted)

## Deployment Architecture

The UC-Hub deployment consists of the following components:

- **Backend API** (GraphQL + gRPC)
- **Frontend** (React.js)
- **AI Models Service**
- **Kong API Gateway**
- **PostgreSQL** (with TimescaleDB extension)
- **Redis**
- **Prometheus** and **Grafana** for monitoring
- **ArgoCD** for continuous deployment

## Deployment Options

### Option 1: Helm Chart (Recommended)

The UC-Hub project provides a Helm chart for easy deployment to Kubernetes.

#### Install Helm Chart

```bash
# Add UC-Hub Helm repository
helm repo add uc-hub https://defi-oracle-tooling.github.io/uc-hub/charts
helm repo update

# Install UC-Hub
helm install uc-hub uc-hub/uc-hub \
  --namespace uc-hub \
  --create-namespace \
  --set global.domain=your-domain.com \
  --set global.environment=production \
  --values your-values.yaml
```

Create a `your-values.yaml` file with your custom configuration:

```yaml
global:
  domain: your-domain.com
  environment: production
  imageRegistry: your-registry.com
  imagePullSecrets:
    - name: registry-credentials

backend:
  replicas: 3
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi
  env:
    JWT_SECRET: your-jwt-secret
    REFRESH_TOKEN_SECRET: your-refresh-token-secret
    ENCRYPTION_KEY: your-encryption-key

frontend:
  replicas: 3
  resources:
    requests:
      cpu: 200m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

aiModels:
  replicas: 2
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 2000m
      memory: 4Gi

database:
  # Use external database (recommended for production)
  external:
    enabled: true
    host: your-postgres-host.com
    port: 5432
    database: uc_hub
    username: postgres
    existingSecret: postgres-credentials
    sslMode: require

redis:
  # Use external Redis (recommended for production)
  external:
    enabled: true
    host: your-redis-host.com
    port: 6379
    existingSecret: redis-credentials
    useTLS: true

apiGateway:
  replicas: 2
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi

monitoring:
  enabled: true
  prometheus:
    retention: 15d
  grafana:
    adminPassword: your-grafana-password

ssl:
  enabled: true
  # Use cert-manager (recommended)
  certManager:
    enabled: true
    issuer: letsencrypt-prod
  # Or use existing certificates
  existingCertificate:
    enabled: false
    secretName: tls-certificate

platformIntegrations:
  teams:
    enabled: true
    clientId: your-teams-client-id
    existingSecret: teams-credentials
  whatsapp:
    enabled: true
    phoneNumberId: your-whatsapp-phone-number-id
    existingSecret: whatsapp-credentials
  zoom:
    enabled: true
    accountId: your-zoom-account-id
    existingSecret: zoom-credentials
  googleMeet:
    enabled: true
    projectId: your-google-meet-project-id
    existingSecret: google-meet-credentials
  sms:
    enabled: true
    provider: twilio
    phoneNumber: your-twilio-phone-number
    existingSecret: twilio-credentials
```

#### Create Kubernetes Secrets

Create secrets for database credentials:

```bash
kubectl create secret generic postgres-credentials \
  --namespace uc-hub \
  --from-literal=password=your-postgres-password

kubectl create secret generic redis-credentials \
  --namespace uc-hub \
  --from-literal=password=your-redis-password
```

Create secrets for platform integrations:

```bash
kubectl create secret generic teams-credentials \
  --namespace uc-hub \
  --from-literal=client-secret=your-teams-client-secret \
  --from-literal=tenant-id=your-teams-tenant-id

kubectl create secret generic whatsapp-credentials \
  --namespace uc-hub \
  --from-literal=api-key=your-whatsapp-api-key \
  --from-literal=api-secret=your-whatsapp-api-secret

kubectl create secret generic zoom-credentials \
  --namespace uc-hub \
  --from-literal=client-secret=your-zoom-client-secret

kubectl create secret generic google-meet-credentials \
  --namespace uc-hub \
  --from-literal=client-secret=your-google-meet-client-secret

kubectl create secret generic twilio-credentials \
  --namespace uc-hub \
  --from-literal=account-sid=your-twilio-account-sid \
  --from-literal=auth-token=your-twilio-auth-token
```

### Option 2: ArgoCD (GitOps Approach)

UC-Hub can be deployed using ArgoCD for a GitOps approach to continuous deployment.

#### Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

#### Create ArgoCD Application

Create an ArgoCD application manifest:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: uc-hub
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/Defi-Oracle-Tooling/uc-hub.git
    targetRevision: main
    path: infra/kubernetes
    helm:
      valueFiles:
        - values-production.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: uc-hub
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

Apply the ArgoCD application:

```bash
kubectl apply -f argocd-application.yaml
```

### Option 3: Manual Kubernetes Deployment

For manual deployment, you can use the Kubernetes manifests provided in the repository.

```bash
# Create namespace
kubectl create namespace uc-hub

# Apply Kubernetes manifests
kubectl apply -f infra/kubernetes/namespace.yaml
kubectl apply -f infra/kubernetes/secrets.yaml
kubectl apply -f infra/kubernetes/configmaps.yaml
kubectl apply -f infra/kubernetes/services.yaml
kubectl apply -f infra/kubernetes/deployments.yaml
kubectl apply -f infra/kubernetes/ingress.yaml
```

## Database Migration

Before deploying the application, you need to run database migrations:

```bash
# Using Helm
helm upgrade --install uc-hub-migrations uc-hub/uc-hub-migrations \
  --namespace uc-hub \
  --set database.host=your-postgres-host.com \
  --set database.port=5432 \
  --set database.name=uc_hub \
  --set database.username=postgres \
  --set database.existingSecret=postgres-credentials

# Or using kubectl
kubectl apply -f infra/kubernetes/jobs/migrations.yaml
```

## SSL Configuration

### Option 1: cert-manager (Recommended)

Install cert-manager:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.10.0/cert-manager.yaml
```

Create a ClusterIssuer for Let's Encrypt:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

Apply the ClusterIssuer:

```bash
kubectl apply -f cluster-issuer.yaml
```

### Option 2: Using Existing Certificates

If you have existing certificates, create a TLS secret:

```bash
kubectl create secret tls tls-certificate \
  --namespace uc-hub \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

## Monitoring Setup

The UC-Hub deployment includes Prometheus and Grafana for monitoring.

### Access Grafana

```bash
# Get Grafana admin password
kubectl get secret --namespace uc-hub uc-hub-grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode

# Port forward Grafana service
kubectl port-forward --namespace uc-hub svc/uc-hub-grafana 3000:80
```

Access Grafana at `http://localhost:3000` and log in with username `admin` and the password retrieved above.

## Scaling

UC-Hub components can be scaled horizontally to handle increased load:

```bash
# Scale backend
kubectl scale deployment uc-hub-backend --replicas=5 -n uc-hub

# Scale frontend
kubectl scale deployment uc-hub-frontend --replicas=5 -n uc-hub

# Scale AI models service
kubectl scale deployment uc-hub-ai-models --replicas=3 -n uc-hub

# Scale API gateway
kubectl scale deployment uc-hub-api-gateway --replicas=3 -n uc-hub
```

For automatic scaling, you can use Horizontal Pod Autoscaler (HPA):

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: uc-hub-backend
  namespace: uc-hub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: uc-hub-backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

Apply the HPA:

```bash
kubectl apply -f hpa.yaml
```

## Backup and Disaster Recovery

### Database Backup

Set up regular database backups:

```bash
# Using Helm
helm upgrade --install uc-hub-backup uc-hub/uc-hub-backup \
  --namespace uc-hub \
  --set schedule="0 2 * * *" \
  --set database.host=your-postgres-host.com \
  --set database.port=5432 \
  --set database.name=uc_hub \
  --set database.username=postgres \
  --set database.existingSecret=postgres-credentials \
  --set storage.bucket=your-backup-bucket \
  --set storage.existingSecret=backup-credentials

# Or using kubectl
kubectl apply -f infra/kubernetes/cronjobs/backup.yaml
```

### Kubernetes Resource Backup

Use Velero for Kubernetes resource backup:

```bash
# Install Velero
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.5.0 \
  --bucket your-backup-bucket \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1 \
  --secret-file ./credentials-velero

# Create a backup
velero backup create uc-hub-backup --include-namespaces uc-hub

# Schedule regular backups
velero schedule create uc-hub-daily-backup \
  --schedule="0 1 * * *" \
  --include-namespaces uc-hub \
  --ttl 720h
```

## Multi-Region Deployment

For high availability and disaster recovery, you can deploy UC-Hub across multiple regions:

1. Deploy UC-Hub in each region
2. Set up database replication across regions
3. Use global load balancing (e.g., AWS Global Accelerator, GCP Global Load Balancer)
4. Configure failover mechanisms

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n uc-hub
```

### View Pod Logs

```bash
kubectl logs -f deployment/uc-hub-backend -n uc-hub
kubectl logs -f deployment/uc-hub-frontend -n uc-hub
kubectl logs -f deployment/uc-hub-ai-models -n uc-hub
kubectl logs -f deployment/uc-hub-api-gateway -n uc-hub
```

### Check Service Endpoints

```bash
kubectl get endpoints -n uc-hub
```

### Check Ingress Status

```bash
kubectl get ingress -n uc-hub
kubectl describe ingress uc-hub-ingress -n uc-hub
```

### Check Certificate Status

```bash
kubectl get certificates -n uc-hub
kubectl describe certificate uc-hub-tls -n uc-hub
```

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Velero Documentation](https://velero.io/docs/)
- [UC-Hub Architecture Overview](../architecture/overview.md)
- [UC-Hub Security Features](../architecture/security.md)
