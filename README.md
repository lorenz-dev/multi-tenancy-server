## Architecture Overview

### Multi-Tenancy Strategy
- How do you isolate tenants?
> AsyncLocalStorage maintains tenant context throughout request lifecycle. Repository injects tenant context to auto-filter query. 

- Where is tenant context set and checked?
> Set in a middleware after jwt extraction. Check automatically in repository.

- How do you prevent cross-tenant data leaks?
> JWT contains `organizationId` which is then automatically injected to auto-filter query. 

- Middleware vs. repository-level filtering approach
> Repository enforce filtering, middleware sets the context.

### Database Schema
- Models and relationships (Drizzle schema)
> All tables include `organizationId` for tenant isolation.
> `organizations` → `claims` (1:N)
> `organizations` → `patientHistories` (1:N)
> `claims` → `claimsAudit` (1:N)

- Why you added specific fields beyond core requirements
> `claimsAudit` table for full audit trail. `processedAt` in `patientHistories` for idempotency tracking.

- Index strategy: which fields indexed, why?
> All start with `organizationId` for tenant-scoped performance.
> Composite indexes:
> `(organizationId, createdAt)` for sorted listings
> `(organizationId, status)` for filtering
> `(organizationId, patientId)` for patient queries
> `(organizationId, assignedProcessorId)` for processor assignments

- Any denormalized fields for performance
> None - all fields follow normalized schema per assessment requirements.

- Migration strategy
> Drizzle Kit migrations in `/drizzle` directory. Separate migration client ensures single-connection execution.

### Permission Model
- How are permissions enforced? (middleware, service, repository)
> Service layer. `ClaimsService` has `checkReadPermission()` and `checkUpdatePermission()` methods that inspect user role and claim ownership. Repository provides tenant isolation, service enforces RBAC.

- Where do permission checks happen?
> Service layer before all read/update operations. Admin sees all org claims. Processor sees only assigned claims. Provider sees only their claims. Patient sees only their claims. Read-only roles blocked from updates.

- Can permissions be bypassed? (Should be no)
> No. JWT-based auth required for all `/api` routes. Tenant context immutable after middleware setup. Service layer throws `ForbiddenError` on permission violations. Repository filtering prevents cross-tenant access.

- How do you test permission boundaries?
> Test each role attempting to access other users' claims within same org and across orgs. Verify processors can't access unassigned claims, providers/patients are read-only, and approved/paid claims are immutable.

### Async Processing with BullMQ
- Which jobs exist and what do they do?
> All triggered by patient history events.
> `patient-admission` moves status (submitted → under_review)
> `patient-discharge` moves status (pending → approved)
> `treatment-initiated` moves status (find related claims, update status).

- Idempotency strategy: how do you prevent duplicate processing?
> Job ID format: `{eventType}-{eventId}`. Check `patientHistories.processedAt` field. If not null, skip processing.
> Mark processed after successful claim updates within same transaction.

- Retry logic: exponential backoff? Max retries? How to recover?
> 3 max retries, exponential backoff (2s base delay).
> BullMQ handles retry scheduling. Failed jobs retained for 24h+ for manual inspection/requeue.

- Transaction safety: atomic operations?
> Yes, claim updates and `processedAt` marking happen within single database transaction.
> Rollback on failure prevents partial updates.

- How do you know if a job failed?
> BullMQ emits `failed` events logged by worker.
> Failed jobs visible in queue metrics.

- Dead letter queue handling
> BullMQ retains failed jobs after max retries.
> No automated DLQ processing. Manual requeue possible via BullMQ dashboard/CLI.

### Performance Optimization
- Query optimization: eager loading strategy with Drizzle
> Single-table queries with selective field fetching and composite indexes for efficient tenant-scoped operations.

- Pagination approach (offset vs. cursor)
> Simple `limit`/`offset` for typical use cases.

- Indexes and why you chose them
> All composite indexes start with `organizationId` for tenant-scoped query performance.

- Redis caching strategy (if implemented)
> Cache individual claims (5min TTL) and list results (1min TTL). Invalidate on write operations.

- Any benchmarks/query analysis
> No formal benchmarking implemented yet.

### Testing Strategy
- Unit vs. integration tests                                                                                                               
> Integration tests via Vitest + Supertest. Test full request/response cycles with real database.                                                         
> Unit tests for utility functions and validators.

- Critical paths tested thoroughly
> Claim CRUD, status updates, bulk operations, role-based filtering, cross-tenant isolation, job idempotency, cache invalidation, concurrent updates, failure recovery, rollback behavior.

- Edge cases covered
> Input validation: Negative/zero amounts, invalid codes, missing fields, special characters, extremely large values.
> Pagination: Zero/negative limits, offset beyond count, last page handling.
> Filtering: Invalid dates, reversed ranges, non-existent IDs, multiple filters with no matches.
> Bulk operations: Empty arrays, duplicates, mixed valid/invalid IDs, 100+ claim updates.
> Authentication: Expired/malformed tokens, missing headers, Bearer prefix validation.
> Concurrency: Two processors updating same claim, concurrent reads/writes, cache consistency, race conditions.

- Security testing: permission bypass attempts tested
> Test JWT tampering, cross-org access via ID manipulation, processor role escalation, direct repository access without context, cache poisoning.

- Async testing: idempotency verified
> Process same event multiple times, verify only one update occurs, `processedAt` prevents duplicates, transaction safety.

- Test environment setup (test database, Redis)
> Separate and clean test database and redis instance running in docker container.

### API Design
- RESTful conventions followed
> Standard HTTP verbs: GET (read), POST (create), PATCH (update).
> Proper status codes (200, 201, 400, 403, 404, 422, 500).

- Error response format
> `{ error: { message: string, code: string, details?: any } }`.
> Custom error classes map to HTTP status codes.
> Stack traces excluded in production.

- Validation approach (Zod)
> Validate request at controller entry. Returns 400 on validation errors.

- Request/response types
> TypeScript interfaces in `/types` directory.
> Consistent format;
> `{ data: T }` for success
> `{ error: {...} }` for errors.

### Development & Deployment
- Environment variables needed
> # Database
> DATABASE_URL=postgresql://postgres:postgres@localhost:5432/claims_db
> DB_POOL_MIN=2
> DB_POOL_MAX=10
>
# Redis
> REDIS_URL=redis://localhost:6379
> REDIS_CACHE_TTL_CLAIM=300
> REDIS_CACHE_TTL_LIST=60
>
# JWT
> JWT_SECRET=your-secret-key-change-in-production
> JWT_EXPIRES_IN=7d
>
# App
> PORT=3000
> WORKER_PORT=3002
> NODE_ENV=development
>
> # Logging
> LOG_LEVEL=info
>
> # Metrics
> ENABLE_METRICS=true
> METRICS_PATH=/metrics
>
# Cache
> ENABLE_CACHE=true
>
> # BullMQ
> BULLMQ_CONCURRENCY=5
> BULLMQ_MAX_RETRIES=3
> BULLMQ_BACKOFF_DELAY_MS=2000

- How to run locally (setup instructions)
> cp .env.example .env
> run dev locally `./start.sh` - concurrently runs api server and worker

- How to run migrations
> `yarn db:migrate` (create migrations)

- How to start workers
> Separate process run `yarn worker`

- Deployment considerations (Railway, Replit, etc.)
> No deployment

### Trade-offs Made
- What did you prioritize?
> Security (tenant isolation, RBAC) and reliability (job idempotency)

- Known limitations?
> Offset pagination doesn't scale to millions of pages.
> No rate limiting per tenant.
> Cache invalidation is pattern-based, not fine-grained.

- Technical debt incurred
> Audit table grows unbounded.
> Worker process single-instance (no horizontal scaling).

### What You'd Do With More Time
- Performance optimizations not implemented?
> Cursor-based pagination.

- Additional features?
> Rate limiting per tenant
> Graphql support

- Testing coverage gaps?
> e2e tests

- Monitoring and observability improvements
> Prometheus/Grafana dashboards, distributed tracing (OpenTelemetry), structured log aggregation (ELK), alerting on SLA violations, APM integration, job queue health monitoring.
