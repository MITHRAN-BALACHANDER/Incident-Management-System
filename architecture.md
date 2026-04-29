# PulseGuard Incident Management System — Architecture

PulseGuard is a production-grade, event-driven Incident Management System (IMS) designed to handle high-throughput signal bursts (up to 10,000 signals/sec), correlate them via a sliding window debounce engine, and manage incidents through a strict state machine with real-time WebSocket telemetry.

---

## 1. High-Level Architecture Flow

The system consists of a NestJS backend and a Next.js frontend, orchestrated via Apache Kafka, Redis, PostgreSQL, and MongoDB.

```mermaid
graph TD
    %% Ingestion & Backpressure
    Client[Client / Alert Sources] -->|POST /signals| Ingestion[Ingestion API (Load Shedder)]
    Ingestion -->|1. Drop P2 if Overloaded\n2. Key: componentId| KafkaIn[Kafka Topic: signal-ingested]
    
    %% Async Processing
    KafkaIn -->|Batch Consumed| Worker[Signal Processor Consumer]
    Worker -.->|Fire & Forget| Mongo[(MongoDB: Time-Series)]
    
    %% Debouncing & Concurrency
    Worker -->|RPUSH + EXPIRE| Redis[(Redis: Debounce Window)]
    Worker -->|Delay TTL| KafkaFlush[Kafka Topic: signal-flush]
    
    %% Final Processing & DB write
    KafkaFlush -->|Redlock Acquire| Worker
    Worker -->|Circuit Breaker Protected| Postgres[(PostgreSQL: WorkItems)]
    
    %% Output & Alerting
    Worker -->|Emit via Socket.io| Gateway[WebSocket Gateway]
    Worker -->|Concurrent Promise.allSettled| Alert[Alert Strategies: Email/Slack]
    
    %% Error Handling
    Worker -- Max 5 Retries Exceeded --> DLQ[Kafka Topic: signal-ingested.DLT]
    
    %% Frontend
    Gateway -->|WS: incident.created| Frontend[Next.js Dashboard UI]
```

---

## 2. Core Subsystems

### A. Ingestion & Load Shedding (`ingestion` module)
- **Role:** The system's front door. Accepts incoming signals and immediately returns `202 Accepted` to minimize latency.
- **Resilience:** Implements a Throttler (500 req/sec per IP) and a **Load Shedder**. If the local ingestion rate exceeds processing capacity (> 5,000/sec), it drops non-critical `P2` traffic with a `503 Service Unavailable`, preserving resources for `P0` and `P1` signals.

### B. Event Queueing (`queue` module)
- **Tech:** Apache Kafka (via `kafkajs`).
- **Ordering:** The Kafka producer uses the `componentId` as the strict partition key. This guarantees that all signals belonging to a single component are routed to the same partition, ensuring strict chronological processing and preventing race conditions (e.g., a "resolved" signal being processed before an "open" signal).

### C. Async Processor Fleet (`processor` module)
- **Role:** The heavy lifter. A NestJS Kafka microservice configured to consume from up to 100 partitions concurrently.
- **Dead Letter Queue (DLQ):** If processing fails for a message 5 times, it is routed to a dedicated `signal-ingested.DLT` topic for manual review or replay via the `replay-dlq.ts` script.

### D. Debounce Engine (`debounce` module)
- **Tech:** Redis Pipelines (`RPUSH` + `EXPIRE`).
- **Role:** Prevents incident noise. When a signal arrives, it is appended to a list in Redis with a severity-based Time-To-Live (TTL): `P0: 5s`, `P1: 10s`, `P2: 30s`. A "flush" event is scheduled. When the TTL expires, all accumulated signals for that component are atomicly flushed (`LRANGE` + `DEL`) and grouped into a single `WorkItem`.

### E. Database Layer & Memory Safety
- **PostgreSQL (via Prisma 7 pg-adapter):** The source of truth for `WorkItems` and `RCA`s. 
- **Opossum Circuit Breaker:** All writes to Postgres are protected by a circuit breaker. If the DB failure rate hits 50% over 5 seconds, the breaker opens, rejecting requests instantly and preventing Node.js memory exhaustion from hanging queries.
- **MongoDB Time-Series:** Raw signals are dumped asynchronously into a Mongoose Time-Series collection (`granularity: 'seconds'`) for high-performance dashboard analytics (e.g., signals per minute).

### F. Workflow & Concurrency Control (`workflow` module)
- **Role:** Manages the strict state machine (`OPEN -> INVESTIGATING -> RESOLVED -> CLOSED`).
- **Optimistic Locking:** The `WorkItem` table utilizes a `@version` column. Status transitions perform an `updateMany` checking both `id` and `version`. If a concurrent update occurs, a `ConflictException` is thrown to prevent lost updates.
- **Distributed Locking:** Uses `redlock` around the debounce window flush process, guaranteeing that two horizontal workers cannot simultaneously flush the same component and create duplicate incidents.

### G. Alert Strategies (`alert` module)
- **Role:** Implements the Strategy Pattern (`EmailStrategy`, `SlackStrategy`).
- **Execution:** Alerts are fired concurrently using `Promise.allSettled`, isolating failures so a dead SMTP server does not break the Slack webhook.

### H. RCA Verification (`rca` module)
- **Role:** Enforces post-mortem compliance. 
- **Logic:** The `WorkflowService` mathematically guarantees an incident cannot transition to `CLOSED` without a valid RCA linked to it. The `MTTR` is calculated dynamically as the exact delta between `WorkItem.createdAt` and RCA submission time.

---

## 3. Data Models

### PostgreSQL (`schema.prisma`)
```prisma
model WorkItem {
  id          String   @id @default(uuid())
  componentId String
  status      WorkItemStatus @default(OPEN)
  severity    Severity
  version     Int      @default(1) // Optimistic Lock
  createdAt   DateTime @default(now())
  rca         RCA?
}

model RCA {
  id              String   @id @default(uuid())
  workItemId      String   @unique
  rootCause       String
  fixApplied      String
  preventionSteps String
  mttr            Float    // Milliseconds
}
```

### MongoDB Time-Series (`signal.schema.ts`)
```typescript
@Schema({
  timeseries: {
    timeField: 'timestamp',
    metaField: 'componentId',
    granularity: 'seconds',
  },
})
export class Signal {
  componentId: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}
```

---

## 4. Frontend Dashboard
Located in the `/frontend` directory, built with **Next.js 14**, TailwindCSS, and Socket.io-client.
- **Live Feed:** Connects via WebSocket to receive real-time updates when an incident is created or its state changes.
- **Incident Inspector:** Clicking an incident shows its raw Kafka signals fetched from MongoDB.
- **State Control:** Allows users to progress incidents through the state machine. Triggers an RCA submission form when attempting to resolve/close an incident.
