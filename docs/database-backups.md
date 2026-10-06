# Database backups

Administration → Database backups lists encrypted PostgreSQL archives, newest first. Only full administrators can view, create or restore backups. Restoring replaces data for **all stores**, including users and passwords. Images already in S3 are not included in a database archive.

## Schedule and retention

The backend checks once a minute and creates one scheduled backup per calendar day in `America/Santiago`, starting at 00:00 (including daylight-saving changes). If the backend is offline, the missing daily backup is taken when it next runs. Files at least 14 × 24 hours old are deleted from this environment's backup prefix. Manual and pre-restore safety backups have the same retention. Enable an S3 lifecycle rule as a second retention mechanism if the server could be offline for extended periods.

## Configuration

The backend needs PostgreSQL 15 client tools (the production Dockerfile installs them), Redis, and these private environment variables:

Backend dependencies: `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, and `ioredis` 5.x. These are installed in the sibling backend package and lockfile. Copying only the server-module source into a different backend also requires installing those dependencies and the PostgreSQL client tools.

```
BACKUPS_ENABLED=true
BACKUP_BUCKET=your-private-database-backup-bucket
BACKUP_NAMESPACE=production
BACKUP_ENCRYPTION_KEY=<64 hex characters generated securely once>
```

Optional `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` override existing S3 connection settings; AWS instance credentials can be used when no static keys are configured. Do not use the public image bucket. Enable Block Public Access on AWS. Grant only list/get/put/delete and multipart-upload permissions for `database/production/`. Do not expose backup objects through a public CDN.

Keep the encryption key in a separate secret manager or password manager; losing it makes these backups unusable. Rotation requires retaining old keys or re-encrypting archives. Backups use AES-256-GCM with a random nonce and SHA-256 integrity verification before restoring. Namespace and key must remain stable across deployments. Use a separate namespace and key for local development.

Locally run `node scripts/configure-local-backups.mjs` from the backend. This creates a private MinIO bucket and adds missing configuration to `.env`. It uses the existing PostgreSQL container's client tools. `BACKUP_POSTGRES_CONTAINER` is local-only; leave it unset in production. Optionally `BACKUP_PG_BIN` selects a native client installation.

## Restore behavior

1. Select a backup and type RESTORE. Work is queued in Redis and starts within a minute.
2. The server decrypts and checks the archive and requires a matching database schema. After a schema migration, older backups require an operator-assisted restore with a matching backend version.
3. Maintenance blocks normal requests, drains active requests/imports and takes a fresh safety snapshot. This deployment supports **one shared-mode backend process**; do not enable CMS restore across multiple replicas or external database writers without coordinating their shutdown.
4. `pg_restore --single-transaction --clean --if-exists` restores atomically. Failure rolls back the transaction. Cache is cleared before reopening service.
5. A failed/interrupted restore keeps maintenance enabled if it reached that phase. Inspect the database and operation status, then use Resume service. Never automatically repeat an uncertain restore. Redis runner leases expire after an hour following an abrupt crash; status then reports the interruption.

Pending/in-progress state lives in Redis, outside the database being restored. Keep Redis persistent. This is a full logical database backup, not point-in-time recovery; changes after the selected snapshot are lost. Preserve infrastructure configuration and S3 media independently.

Production activation requires configuring the private bucket/key in the backend environment and deploying the backend before the CMS. This does not modify any existing image-bucket lifecycle policy. In a versioned backup bucket, also expire noncurrent versions and delete markers through bucket lifecycle rules; application cleanup alone only creates delete markers.

Reference: https://www.postgresql.org/docs/15/app-pgrestore.html
