## Architecture Overview

### Multi-Tenancy Strategy
- How do you isolate tenants?
- Where is tenant context set and checked?
- How do you prevent cross-tenant data leaks?
- Middleware vs. repository-level filtering approach

### Database Schema
- Models and relationships (Drizzle schema)
- Why you added specific fields beyond core requirements
- Index strategy: which fields indexed, why?
- Any denormalized fields for performance
- Migration strategy

### Permission Model
- How are permissions enforced? (middleware, service, repository)
- Where do permission checks happen?
- Can permissions be bypassed? (Should be no)
- How do you test permission boundaries?

### Async Processing with BullMQ
- Which jobs exist and what do they do?
- Idempotency strategy: how do you prevent duplicate processing?
- Retry logic: exponential backoff? Max retries? How to recover?
- Transaction safety: atomic operations?
- How do you know if a job failed?
- Dead letter queue handling

### Performance Optimization
- Query optimization: eager loading strategy with Drizzle
- Pagination approach (offset vs. cursor)
- Indexes and why you chose them
- Redis caching strategy (if implemented)
- Any benchmarks/query analysis

### Testing Strategy
- Unit vs. integration tests
- Critical paths tested thoroughly
- Edge cases covered
- Security testing: permission bypass attempts tested
- Async testing: idempotency verified
- Test environment setup (test database, Redis)

### API Design
- RESTful conventions followed
- Error response format
- Validation approach (Zod)
- Request/response types

### Development & Deployment
- Environment variables needed
- How to run locally (setup instructions)
- How to run migrations
- How to start workers
- Deployment considerations (Railway, Replit, etc.)

### Trade-offs Made
- What did you prioritize?
- Known limitations?
- Technical debt incurred

### What You'd Do With More Time
- Performance optimizations not implemented?
- Additional features?
- Testing coverage gaps?
- Monitoring and observability improvements
