# 🛡️ VertexAI Backend — Complete Beginner's Learning Guide (`BACKEND_EXPLAINED.md`)

> **Welcome to your personal reference handbook for the VertexAI Spring Boot 3 Backend.**  
> This document breaks down every single file, annotation, design pattern, and architectural decision in plain, beginner-friendly English with everyday analogies.

---

# Table of Contents
1. [Backend Overview & Architecture](#1-backend-overview--architecture)
2. [Master Glossary of Terms](#2-master-glossary-of-terms)
3. [Infrastructure & Build Files](#3-infrastructure--build-files)
   - [`pom.xml`](#pomxml)
   - [`application.yml`](#applicationyml)
   - [`schema.sql`](#schemasql)
   - [`Dockerfile`](#dockerfile)
   - [`VertexAiApplication.java`](#vertexaiapplicationjava)
4. [JPA Database Entities (The 7 Tables)](#4-jpa-database-entities-the-7-tables)
   - [`User.java`](#userjava)
   - [`Asset.java`](#assetjava)
   - [`ScanJob.java`](#scanjobjava)
   - [`CanonicalVulnerability.java`](#canonicalvulnerabilityjava)
   - [`VulnerabilityIntelligence.java`](#vulnerabilityintelligencejava)
   - [`RiskScore.java`](#riskscorejava)
   - [`RiskTicket.java`](#riskticketjava)
5. [Spring Data JPA Repositories (The Data Access Layer)](#5-spring-data-jpa-repositories-the-data-access-layer)
   - [`UserRepository.java`](#userrepositoryjava)
   - [`AssetRepository.java`](#assetrepositoryjava)
   - [`ScanJobRepository.java`](#scanjobrepositoryjava)
   - [`CanonicalVulnerabilityRepository.java`](#canonicalvulnerabilityrepositoryjava)
   - [`VulnerabilityIntelligenceRepository.java`](#vulnerabilityintelligencerepositoryjava)
   - [`RiskScoreRepository.java`](#riskscorerepositoryjava)
   - [`RiskTicketRepository.java`](#riskticketrepositoryjava)
6. [Data Transfer Objects (DTOs)](#6-data-transfer-objects-dtos)
   - [`LoginRequest.java` & `LoginResponse.java`](#loginrequestjava--loginresponsejava)
   - [`AssetRequest.java` & `AssetResponse.java`](#assetrequestjava--assetresponsejava)
   - [`ScanRequest.java` & `ScanStatusResponse.java`](#scanrequestjava--scanstatusresponsejava)
   - [`ControlActionRequest.java`](#controlactionrequestjava)
   - [`CanonicalFindingResponse.java` (Frozen Schema)](#canonicalfindingresponsejava-frozen-schema)
   - [`DashboardResponse.java`](#dashboardresponsejava)
   - [`AcceptRiskRequest.java`](#acceptriskrequestjava)
   - [`TicketApprovalRequest.java` & `TicketResponse.java`](#ticketapprovalrequestjava--ticketresponsejava)
7. [Security & Authentication Layer (RBAC & JWT)](#7-security--authentication-layer-rbac--jwt)
   - [`JwtTokenProvider.java`](#jwttokenproviderjava)
   - [`JwtAuthenticationFilter.java`](#jwtauthenticationfilterjava)
   - [`CustomUserDetailsService.java`](#customuserdetailsservicejava)
   - [`SecurityConfig.java`](#securityconfigjava)
8. [Configuration & Exception Handling](#8-configuration--exception-handling)
   - [`CorsConfig.java`](#corsconfigjava)
   - [`WebSocketConfig.java`](#websocketconfigjava)
   - [`OpenApiConfig.java`](#openapiconfigjava)
   - [`DataInitializer.java`](#datainitializerjava)
   - [`ResourceNotFoundException.java` & `BadRequestException.java`](#resourcenotfoundexceptionjava--badrequestexceptionjava)
   - [`GlobalExceptionHandler.java`](#globalexceptionhandlerjava)
9. [Agent Gateway Layer (Python AI Bridge)](#9-agent-gateway-layer-python-ai-bridge)
   - [`AgentClient.java`](#agentclientjava)
   - [`HttpAgentClient.java`](#httpagentclientjava)
   - [`MockAgentClient.java`](#mockagentclientjava)
10. [Core Business Services Layer](#10-core-business-services-layer)
    - [`AuthService.java`](#authservicejava)
    - [`AssetService.java`](#assetservicejava)
    - [`ScanService.java`](#scanservicejava)
    - [`PipelineOrchestrator.java` (Human-in-the-Loop Engine)](#pipelineorchestratorjava-human-in-the-loop-engine)
    - [`VulnerabilityService.java`](#vulnerabilityservicejava)
    - [`DashboardService.java`](#dashboardservicejava)
    - [`GitHubTicketingService.java` (Sole GitHub Client)](#githubticketingservicejava-sole-github-client)
11. [REST Controllers (The HTTP Front Doors)](#11-rest-controllers-the-http-front-doors)
    - [`AuthController.java`](#authcontrollerjava)
    - [`AssetController.java`](#assetcontrollerjava)
    - [`ScanController.java`](#scancontrollerjava)
    - [`VulnerabilityController.java`](#vulnerabilitycontrollerjava)
    - [`DashboardController.java`](#dashboardcontrollerjava)
12. [Mock Fixtures & Unit Tests](#12-mock-fixtures--unit-tests)
13. [❓ Questions Asked During the Build (Doubts & Explanations)](#13--questions-asked-during-the-build-doubts--explanations)

---

# 1. Backend Overview & Architecture

### What does this backend actually do?
The **VertexAI Backend** is the central command-and-control engine of the platform. It receives scan requests from the frontend dashboard, verifies user permissions (`ADMIN`, `ANALYST`, `VIEWER`), checks whether a target server is authorized to be scanned, launches the multi-agent AI pipeline, saves all deduplicated vulnerabilities and threat scores in a 7-table PostgreSQL database, pushes real-time status updates to the UI via WebSockets, and acts as the **sole authorized gatekeeper** permitted to create GitHub tickets once a human analyst grants final approval.

### What is Spring Boot, and why are we using it?
**Java** is a strict, strongly-typed programming language known for rock-solid enterprise stability. **Spring Boot** is a framework (a ready-to-use toolbox) that lets developers build production-grade web servers quickly without configuring everything manually. 
* **Spring Boot's role:** *The Bookkeeper & Gatekeeper* — manages security, database transactions, HTTP endpoints, WebSocket broadcasting, and GitHub API dispatching.
* **Python FastAPI's role:** *The Data Scientist* — performs heavy AI/ML computations (parsing XML scanner logs, running the XGBoost false-positive model, looking up live EPSS/KEV threat feeds).
* **Next.js's role:** *The User Interface* — renders charts, graphs, and buttons in the browser. It never connects directly to PostgreSQL or GitHub.

### Plain-Text Request Flow Diagram
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NEXT.JS FRONTEND (User Browser UI)                       │
│    - Clicks "Start Scan"                                                    │
│    - Views Live Flow View Graph via WebSockets (ws://.../ws/pipeline)       │
│    - Clicks "Continue", "Stop", or "Approve Ticket"                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP REST (JSON) / WebSocket
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SPRING BOOT REST CONTROLLERS                          │
│   AuthController, AssetController, ScanController, VulnerabilityController  │
│   (Receives HTTP request, validates JWT token, checks role permissions)     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Calls Java method
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE BUSINESS SERVICES                            │
│   AuthService, AssetService, ScanService, VulnerabilityService, Dashboard   │
│   PipelineOrchestrator (Manages Human-in-the-Loop stage checkpoints)        │
└──────────────┬───────────────────────┬───────────────────────────────┬──────┘
               │                       │                               │
    Calls over HTTP                    │ Reads / Writes Java Objects   │ Only on Final Human Approval
               ▼                       ▼                               ▼
┌─────────────────────────┐  ┌────────────────────────┐  ┌────────────────────┐
│    PYTHON AI AGENTS     │  │    JPA REPOSITORIES    │  │   GITHUB REST API  │
│    (FastAPI :8000)      │  │ (UserRepository, etc.) │  │ (GitHubTicketing-  │
│ Agent 1: Parser (XML)   │  └───────────┬────────────┘  │  Service.java only)│
│ Agent 2: XGBoost Noise  │              │ SQL Queries   │                    │
│ Agent 3: EPSS Threat    │              ▼               │ Creates live Issue │
│ Agent 4: Risk Scoring   │  ┌────────────────────────┐  │ on github.com      │
└─────────────────────────┘  │  POSTGRESQL (7 TABLES) │  └────────────────────┘
                             │ users, assets, scans,  │
                             │ canonical_vulns, intel,│
                             │ risk_scores, tickets   │
                             └────────────────────────┘
```

---

# 2. Master Glossary of Terms

| Term | Plain-English Definition |
| :--- | :--- |
| **Annotation (`@...`)** | A special tag placed above a Java class or variable that gives instructions to the compiler or Spring framework (like a sticky note saying *"Treat this class as a database table"*). |
| **Entity** | A Java class whose variables match the columns of a specific database table (e.g. `User.java` represents the `users` table). |
| **ORM (Object-Relational Mapping)** | A technology (Hibernate) that translates between SQL database rows and Java objects so you don't have to write raw SQL strings. |
| **JPA (Java Persistence API)** | The standard Java specification and toolkit used by Spring Boot to talk to relational databases via ORM. |
| **Repository** | A Java data-access interface that acts like a smart librarian — you declare method names (like `findByUsername`), and Spring automatically writes and runs the SQL queries. |
| **Service** | The "business logic" layer of your app where rules, calculations, security gates, and multi-step workflows live. |
| **Controller** | The "front door" of the backend that receives incoming HTTP web requests from browsers and returns JSON responses. |
| **DTO (Data Transfer Object)** | A lightweight Java data carrier whose sole job is to safely carry data over the network between the frontend and backend without exposing internal database structures. |
| **Bean** | Any Java object that is created, configured, and managed automatically by Spring Boot's internal container. |
| **Dependency Injection (DI)** | A design pattern where Spring automatically provides objects to your class (e.g. passing a `UserRepository` into a `UserService`) instead of you manually writing `new UserRepository()`. |
| **Transaction (`@Transactional`)** | An all-or-nothing database safety wrapper. If any step in a 5-step database operation fails, the whole transaction rolls back to prevent corrupted data. |
| **REST (Representational State Transfer)** | A standard way web applications talk over HTTP using standard methods: `GET` (fetch), `POST` (create/action), `PUT` (update), `DELETE` (remove). |
| **JWT (JSON Web Token)** | A compact, cryptographically-signed digital passcard string proving who you are and what role you have for 24 hours. |
| **CORS (Cross-Origin Resource Sharing)** | A browser security setting where a backend server explicitly permits web pages hosted on a different port/domain (`localhost:3000`) to fetch its API data. |
| **OpenAPI / Swagger** | A standard specification and auto-generated web page (`/swagger-ui/index.html`) that documents all your REST API endpoints with interactive "Try it out" buttons. (Note: NOT related to OpenAI / ChatGPT). |
| **WebSocket** | A permanent, open two-way communication channel between browser and server that lets the backend push live updates instantly without page refreshes. |

---

# 3. Infrastructure & Build Files

---

## 📄 `backend/pom.xml`

### What it is
The master project blueprint and dependency configuration file for Apache Maven (a Project Object Model XML configuration).

### Why it exists
Java projects require external libraries (Spring Boot, database drivers, JWT token generators, validation tools). Instead of manually searching the web and downloading 50 separate `.jar` files, `pom.xml` tells Maven exactly which library versions to download, how to compile Java 17 code, and how to package the final runnable application JAR.

### Full code walkthrough
* `<parent>`: Inherits from `spring-boot-starter-parent` (version `3.2.5`). This gives our project sensible enterprise defaults and curated dependency versions.
* `<properties>`: Specifies `java.version = 17`, MapStruct `1.5.5.Final`, Lombok `1.18.32`, JJWT `0.12.5`, and SpringDoc OpenAPI `2.3.0`.
* `<dependencies>`:
  * `spring-boot-starter-web`: Pulls in embedded Apache Tomcat web server and Spring MVC for building `@RestController` endpoints.
  * `spring-boot-starter-data-jpa`: Pulls in Hibernate ORM to connect Java entities to PostgreSQL.
  * `spring-boot-starter-security`: Provides authentication filters, BCrypt password hashing, and role checks (`hasRole('ADMIN')`).
  * `spring-boot-starter-websocket`: Enables real-time STOMP messaging over WebSockets.
  * `spring-boot-starter-validation`: Jakarta validation annotations (`@NotBlank`, `@Email`, `@Min`, `@Max`).
  * `postgresql`: The official JDBC database driver allowing Java to communicate with PostgreSQL (host port `5433`, container-internal `5432`).
  * `io.jsonwebtoken (jjwt-api, jjwt-impl, jjwt-jackson)`: Cryptographic token generator and parser for authentication.
  * `org.projectlombok:lombok`: Automatically generates getters, setters, constructors, and builders at compile time.
  * `springdoc-openapi-starter-webmvc-ui`: Auto-generates the Swagger UI documentation web page.
* `<build><plugins>`:
  * `maven-compiler-plugin`: Configured with Java 17 source/target and explicit `<annotationProcessorPaths>` for both Lombok and MapStruct so annotation processors run in the correct order during compilation.

### How it connects to the rest of the backend
* Read by Maven and Docker during `mvn clean package` or `docker-compose up --build`.
* Defines every library used by every Java file in the project.
* **If deleted:** Maven cannot build, compile, or run the project.

### Real-world analogy
Think of `pom.xml` like a **Master Construction Blueprint & Parts Order Manifest**. Before builders start constructing a house, the manifest lists every required tool, beam size, and electrical cable brand, instructing the delivery truck (Maven) on what to supply.

---

## 📄 `backend/src/main/resources/application.yml`

### What it is
The central runtime configuration file containing environment variables, database credentials, server ports, and microservice URLs (a YAML configuration file).

### Why it exists
Code should never contain hardcoded passwords, IP addresses, or secret keys. `application.yml` separates configuration from code: it defines default local settings while allowing environment variables (like `DB_HOST` or `JWT_SECRET` in Docker) to override them seamlessly without recompiling Java code.

### Full code walkthrough
```yaml
server:
  port: 8080 # The HTTP port Spring Boot listens on
spring:
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5433}/${DB_NAME:vertexai_db}
    username: ${DB_USER:vertex_user}
    password: ${DB_PASSWORD:vertex_secure_pass}
    driver-class-name: org.postgresql.Driver
```
* `${DB_HOST:localhost}`: Syntax meaning *"Use the `DB_HOST` environment variable if present; otherwise default to `localhost`"*. In Docker Compose, `DB_HOST` is set to `postgres` (the container name).
* `jpa.hibernate.ddl-auto: none`: Prevents Hibernate from altering our authoritative database structure automatically, protecting against accidental schema changes.
* `sql.init.schema-locations: classpath:schema.sql`: Runs our authoritative `schema.sql` on startup.
* `app.jwt.secret` & `expiration-ms`: Sets the cryptographic signing key and 24-hour expiration duration for user login tokens.
* `app.python-agents.base-url`: Sets the URL of the Python FastAPI service (`http://localhost:8000` locally, or `http://agents_service:8000` in Docker).

### How it connects to the rest of the backend
* Injected into Java classes using `@Value("${app.jwt.secret}")` or `@Value("${app.python-agents.base-url}")`.
* Configures Spring Boot's database pool (`HikariCP`) and Tomcat server.
* **If deleted:** Spring Boot will not know where PostgreSQL is, what port to bind to, or how to sign JWT tokens.

### Real-world analogy
Think of `application.yml` like the **Settings Menu on a Smartphone**. You don't rewrite the phone's operating system when you change Wi-Fi networks or adjust screen brightness; you just change the settings file.

---

## 📄 `backend/src/main/resources/schema.sql`

### What it is
The authoritative SQL script that defines the 7 database tables and initial demo seed accounts (a PostgreSQL DDL script).

### Why it exists
Per our architecture specification (`architecture_plan.md` §8), the database structure is strictly frozen to **exactly 7 tables**. This file is executed when the database starts up, creating all tables with their primary keys, foreign keys, and constraints.

### Full code walkthrough
* `CREATE TABLE IF NOT EXISTS users (...)`: Table 1 — Stores user accounts, hashed passwords, and RBAC roles (`CHECK (role IN ('ADMIN', 'ANALYST', 'VIEWER'))`).
* `CREATE TABLE IF NOT EXISTS assets (...)`: Table 2 — Stores servers and websites with criticality ratings (1–5) and authorization flags (`is_authorized`).
* `CREATE TABLE IF NOT EXISTS scan_jobs (...)`: Table 3 — Tracks scan runs with statuses (`PENDING`, `RUNNING`, `WAITING_FOR_HUMAN`, `COMPLETED`, `STOPPED`, `FAILED`) and references `assets(asset_id)`.
* `CREATE TABLE IF NOT EXISTS canonical_vulnerabilities (...)`: Table 4 — Stores clean, deduplicated findings identified by a unique MD5 `fingerprint_hash`.
* `CREATE TABLE IF NOT EXISTS vulnerability_intelligence (...)`: Table 5 — Stores CVE threat intelligence (CISA KEV, EPSS score/percentile, Exploit-DB) with `cve_id` as the primary key.
* `CREATE TABLE IF NOT EXISTS risk_scores (...)`: Table 6 — Stores calculated 0–100 composite risk scores, SLA priority tiers (`P0_CRITICAL` to `P3_LOW`), and AI explainability rationales.
* `CREATE TABLE IF NOT EXISTS risk_tickets (...)`: Table 7 — Stores dispatched GitHub issue URLs created only after human approval.

### How it connects to the rest of the backend
* Executed by PostgreSQL and Spring Boot on startup.
* Maps 1-to-1 with the 7 JPA Entity classes in `com.vertexai.entity`.
* **If deleted:** PostgreSQL will start with an empty database, causing entity mapping errors.

### Real-world analogy
Think of `schema.sql` like the **Filing Cabinet Blueprint in an Accounting Firm**. It defines exactly 7 labeled drawers and the exact format of the folders placed inside each drawer.

---

## 📄 `backend/Dockerfile`

### What it is
The automated container build script that compiles and packages the backend into an isolated, lightweight Docker image (a Multi-Stage Dockerfile).

### Why it exists
To run the backend on any computer (Mac, Windows, Linux server, or cloud) without requiring the developer to manually install Java 17, Maven, or PostgreSQL tools locally. It uses a **multi-stage build** to keep the final image secure and tiny (~150MB instead of ~900MB).

### Full code walkthrough
* `FROM maven:3.9-eclipse-temurin-17 AS build`: Stage 1 (Build environment) containing full Java 17 and Maven tools.
* `COPY pom.xml .` + `RUN mvn dependency:go-offline`: Downloads dependencies first and caches them as a Docker layer for fast subsequent builds.
* `COPY src ./src` + `RUN mvn clean package -DskipTests`: Compiles the Java source code and packages `target/backend-0.0.1-SNAPSHOT.jar`.
* `FROM eclipse-temurin:17-jre`: Stage 2 (Lightweight runtime) containing only the minimal Java Runtime Environment with multi-architecture support (Apple Silicon ARM64 + Intel x86_64).
* `COPY --from=build /app/target/*.jar app.jar`: Copies only the compiled JAR from Stage 1 into Stage 2, leaving behind all build tools and source files.
* `EXPOSE 8080` + `ENTRYPOINT ["java", "-jar", "app.jar"]`: Launches the application on port 8080.

### How it connects to the rest of the backend
* Executed by `docker-compose up --build backend`.
* Packages all Java classes, resources, and configuration into a runnable container.

### Real-world analogy
Think of a multi-stage Dockerfile like a **Commercial Bakery vs. a Bread Delivery Van**. The large commercial bakery with heavy flour mixers and ovens (Stage 1 Build) bakes the bread. Only the final baked bread loaves are loaded into the lightweight delivery van (Stage 2 Runtime) to be shipped to customers.

---

## 📄 `backend/src/main/java/com/vertexai/VertexAiApplication.java`

### What it is
The master bootstrap entry point for the entire Spring Boot application (the `@SpringBootApplication` Main Class).

### Why it exists
Every Java program needs a `public static void main(String[] args)` method where execution starts. This class tells Spring Boot to initialize its application context, start the embedded Tomcat web server, scan all packages for components, and connect to PostgreSQL.

### Full code walkthrough
```java
package com.vertexai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class VertexAiApplication {
    public static void main(String[] args) {
        SpringApplication.run(VertexAiApplication.class, args);
    }
}
```
* `@SpringBootApplication`: A meta-annotation combining:
  * `@Configuration`: Flags the class as a source of bean definitions.
  * `@EnableAutoConfiguration`: Automatically configures Tomcat, database connections, and security based on `pom.xml`.
  * `@ComponentScan`: Automatically scans `com.vertexai` and all sub-packages (`controller`, `service`, `repository`, etc.) to find and load all `@Service`, `@Repository`, and `@RestController` classes.

### How it connects to the rest of the backend
* The root parent class that launches everything.
* **If deleted:** The Java Virtual Machine cannot start the backend application.

### Real-world analogy
Think of this file like the **Ignition Button in a Car**. Pressing the button starts the engine, turns on the electrical systems, connects the fuel lines, and puts the car into a ready-to-drive state.

---

# 4. JPA Database Entities (The 7 Tables)

All 7 entities live in `com.vertexai.entity` and share standard Lombok annotations:
* `@Data`: Generates getters, setters, `equals()`, `hashCode()`, and `toString()` methods behind the scenes.
* `@Entity`: Tells JPA/Hibernate that this Java class maps directly to a PostgreSQL table.
* `@NoArgsConstructor` & `@AllArgsConstructor`: Generates default and full constructors.
* `@Builder`: Enables the clean builder pattern (e.g. `User.builder().username("admin").build()`).

---

## 📄 `backend/src/main/java/com/vertexai/entity/User.java`
* **What it is:** A JPA Entity mapping to the `users` table.
* **Why it exists:** Stores user accounts, BCrypt-hashed passwords, and RBAC roles (`ADMIN`, `ANALYST`, `VIEWER`).
* **Code highlights:**
  * `@Id @GeneratedValue(strategy = GenerationType.AUTO) private UUID userId;`: Primary key UUID.
  * `@Column(name = "password_hash") private String passwordHash;`: Stores the encrypted password.
  * `@Column(name = "role") private String role;`: Stores permission level.
* **Connects to:** `UserRepository.java`, `CustomUserDetailsService.java`, `AuthService.java`.
* **Analogy:** A company employee ID card record.

---

## 📄 `backend/src/main/java/com/vertexai/entity/Asset.java`
* **What it is:** A JPA Entity mapping to the `assets` table.
* **Why it exists:** Represents a monitored server, web app, or IP address, tracking its business criticality (1 to 5) and scan authorization status.
* **Code highlights:**
  * `private String hostname;`: Domain name or host (e.g. `api.company.com`).
  * `private Integer criticalityRating;`: 1 (low) to 5 (mission-critical) — used by Agent 4 for risk scoring.
  * `private Boolean isAuthorized;`: Security switch. If `false`, scans are blocked.
* **Connects to:** `AssetRepository.java`, `AssetService.java`, `ScanJob.java`.
* **Analogy:** A vehicle registration card in a transport fleet.

---

## 📄 `backend/src/main/java/com/vertexai/entity/ScanJob.java`
* **What it is:** A JPA Entity mapping to the `scan_jobs` table.
* **Why it exists:** Records every vulnerability scan execution, which server was scanned, tools used, and current lifecycle state.
* **Code highlights:**
  * `@ManyToOne @JoinColumn(name = "asset_id") private Asset asset;`: Foreign Key linking back to the scanned server.
  * `private String status;`: Tracks status (`PENDING`, `RUNNING`, `WAITING_FOR_HUMAN`, `COMPLETED`, `STOPPED`, `FAILED`).
  * `private String scannersUsed;`: Lists tools run (e.g. `"NMAP,NUCLEI,OWASP_ZAP"`).
* **Connects to:** `ScanJobRepository.java`, `ScanService.java`, `PipelineOrchestrator.java`.
* **Analogy:** A patient's medical chart in a hospital tracking checkup progress.

---

## 📄 `backend/src/main/java/com/vertexai/entity/CanonicalVulnerability.java`
* **What it is:** A JPA Entity mapping to the `canonical_vulnerabilities` table.
* **Why it exists:** Stores unique, deduplicated vulnerabilities discovered by scanners after Agent 2 filters noise.
* **Code highlights:**
  * `@Column(name = "fingerprint_hash", unique = true) private String fingerprintHash;`: MD5 hash preventing duplicate findings.
  * `private String cveId;` & `private String vulnerabilityName;`: Identifiers (e.g. `CVE-2021-44228`).
  * `private Double falsePositiveProb;` & `private Boolean isSuppressed;`: Machine learning noise-reduction flags.
* **Connects to:** `CanonicalVulnerabilityRepository.java`, `VulnerabilityService.java`, `PipelineOrchestrator.java`.
* **Analogy:** A detective's master incident report combining multiple witness statements into one clean case file.

---

## 📄 `backend/src/main/java/com/vertexai/entity/VulnerabilityIntelligence.java`
* **What it is:** A JPA Entity mapping to the `vulnerability_intelligence` table.
* **Why it exists:** Stores real-world threat telemetry per CVE fetched by Agent 3 (CISA KEV, EPSS score, Exploit-DB).
* **Code highlights:**
  * `@Id @Column(name = "cve_id") private String cveId;`: Primary key is the CVE string itself.
  * `private Boolean isCisaKev;`: `true` if active in the wild per CISA KEV.
  * `private Double epssScore;`: 0.0 to 1.0 probability of exploitation in the next 30 days.
* **Connects to:** `VulnerabilityIntelligenceRepository.java`, `PipelineOrchestrator.java`, `VulnerabilityService.java`.
* **Analogy:** A criminal most-wanted bulletin identifying armed and dangerous fugitives.

---

## 📄 `backend/src/main/java/com/vertexai/entity/RiskScore.java`
* **What it is:** A JPA Entity mapping to the `risk_scores` table.
* **Why it exists:** Stores the 0–100 composite risk score, SLA priority tier, and explainable rationale calculated by Agent 4.
* **Code highlights:**
  * `@ManyToOne @JoinColumn(name = "finding_id") private CanonicalVulnerability finding;`: Links to the vulnerability.
  * `private Double compositeRiskScore;`: 0.0 to 100.0 contextual risk score.
  * `private String priorityLevel;`: `P0_CRITICAL`, `P1_HIGH`, `P2_MEDIUM`, `P3_LOW`.
  * `private String explainableRationale;`: Human-readable AI reasoning explaining why the score was assigned.
* **Connects to:** `RiskScoreRepository.java`, `PipelineOrchestrator.java`, `DashboardService.java`.
* **Analogy:** An insurance risk assessment report calculating risk points and written rationale.

---

## 📄 `backend/src/main/java/com/vertexai/entity/RiskTicket.java`
* **What it is:** A JPA Entity mapping to the `risk_tickets` table.
* **Why it exists:** Stores records of created GitHub issue tickets dispatched after Final Human Approval.
* **Code highlights:**
  * `@ManyToOne @JoinColumn(name = "finding_id") private CanonicalVulnerability finding;`: Links to the fixed finding.
  * `private String externalTicketUrl;`: Live web link to the GitHub issue.
  * `private LocalDateTime slaDeadline;`: Mandatory resolution timestamp based on priority tier.
* **Connects to:** `RiskTicketRepository.java`, `GitHubTicketingService.java`.
* **Analogy:** A certified courier delivery receipt with a tracking number and delivery URL.

---

# 5. Spring Data JPA Repositories (The Data Access Layer)

All 7 repositories live in `com.vertexai.repository` and extend `JpaRepository<Entity, IdType>`. They provide standard database operations (`save`, `findById`, `findAll`, `deleteById`) without writing SQL.

* **`UserRepository.java`**: Finds users by username (`findByUsername`) and email (`findByEmail`) for login authentication.
* **`AssetRepository.java`**: Finds authorized servers (`findByIsAuthorizedTrue`) and checks hostname uniqueness (`existsByHostname`).
* **`ScanJobRepository.java`**: Queries historical scans for an asset (`findByAsset_AssetId`) and by status (`findByStatus`).
* **`CanonicalVulnerabilityRepository.java`**: Finds findings by MD5 fingerprint (`findByFingerprintHash`), filters active findings (`findByIsSuppressedFalse`), and counts suppressed findings for noise reduction stats.
* **`VulnerabilityIntelligenceRepository.java`**: Extends `JpaRepository<VulnerabilityIntelligence, String>` with CVE string primary key.
* **`RiskScoreRepository.java`**: Calculates average risk across all findings (`calculateAverageRiskScore()`) and fetches top threats sorted by risk score descending (`findTopThreatsOrdered()`).
* **`RiskTicketRepository.java`**: Checks if a ticket already exists for a finding (`existsByFinding_FindingId`) to prevent duplicate GitHub issues.

---

# 6. Data Transfer Objects (DTOs)

DTOs live in `com.vertexai.dto`. They carry structured JSON data over HTTP without exposing internal database entities.

* **`LoginRequest.java` & `LoginResponse.java`**: Input credentials (`username`, `password`) and output auth data (`token`, `username`, `role`).
* **`AssetRequest.java` & `AssetResponse.java`**: Input validation for registering servers and output structure for displaying server cards.
* **`ScanRequest.java` & `ScanStatusResponse.java`**: Input for triggering scans (`assetId`, `scanners`) and output polling response returning current stage (1–4), status, and agent review output.
* **`ControlActionRequest.java`**: Validates Human-in-the-Loop commands (`@Pattern(regexp = "^(CONTINUE|STOP)$")`).
* **`CanonicalFindingResponse.java`**: **The Frozen Schema** matching `integration_plan.md` §5 byte-for-byte with Jackson `@JsonProperty` annotations (`finding_id`, `fingerprint_hash`, `cve_id`, `is_cisa_kev`, `epss_score`, `composite_risk_score`, `priority_level`, `sla_deadline`, `explainable_rationale`).
* **`DashboardResponse.java`**: Carries live computed KPI metrics (`security_score`, `total_findings`, `suppressed_findings`, `active_findings`, `noise_reduction_percent`, `top_threats`).
* **`AcceptRiskRequest.java`**: Validates written justifications (`@NotBlank`) when an `ADMIN` accepts business risk.
* **`TicketApprovalRequest.java` & `TicketResponse.java`**: Validates human approval decisions (`approved: true`) and returns the dispatched GitHub issue URL.

---

# 7. Security & Authentication Layer (RBAC & JWT)

All security classes live in `com.vertexai.security`.

---

## 📄 `JwtTokenProvider.java`
* **What it is:** Cryptographic token generator and parser (a Spring `@Component`).
* **Why it exists:** Mints signed 24-hour JWT tokens upon login and validates incoming tokens using HMAC-SHA secret key cryptography.
* **Key methods:**
  * `generateToken(username, role)`: Builds and signs the JWT string.
  * `validateToken(token)`: Checks cryptographic signature and expiration.
  * `getUsernameFromToken(token)` & `getRoleFromToken(token)`: Extracts identity and permissions.

---

## 📄 `JwtAuthenticationFilter.java`
* **What it is:** HTTP request interceptor (a Spring `OncePerRequestFilter`).
* **Why it exists:** Intercepts every incoming HTTP request, extracts the `Authorization: Bearer <token>` header, verifies the token with `JwtTokenProvider`, and sets the user's authenticated identity and role in Spring's `SecurityContextHolder`.

---

## 📄 `CustomUserDetailsService.java`
* **What it is:** Database-to-Spring-Security adapter (a Spring `@Service` implementing `UserDetailsService`).
* **Why it exists:** Bridges our PostgreSQL `users` table with Spring Security's internal user format, converting user roles into granted authorities (`"ROLE_ADMIN"`, `"ROLE_ANALYST"`, `"ROLE_VIEWER"`).

---

## 📄 `SecurityConfig.java`
* **What it is:** Master firewall and RBAC configuration class (a Spring `@Configuration`).
* **Why it exists:** Enforces endpoint access rules:
  * Public: `POST /api/auth/login`, `/actuator/health`, `/swagger-ui/**`.
  * Admin only: `POST /api/vulnerabilities/*/accept-risk`.
  * Analyst / Admin: `POST /api/scans/*/control`, `POST /api/assets`, `POST /api/scans`, `POST /api/vulnerabilities/*/ticket`.
  * Authenticated (any role): All `GET /api/**` endpoints.

---

# 8. Configuration & Exception Handling

* **`CorsConfig.java`**: Whitelists the Next.js frontend (`http://localhost:3000`) so web browsers do not block cross-origin REST API requests.
* **`WebSocketConfig.java`**: Opens a real-time STOMP messaging broker at `ws://localhost:8080/ws/pipeline` with topic `/topic/pipeline` for live status streaming.
* **`OpenApiConfig.java`**: Configures interactive OpenAPI / Swagger documentation at `/swagger-ui/index.html` with JWT Bearer token support.
* **`DataInitializer.java`**: A `CommandLineRunner` component that seeds default demo accounts (`admin`, `analyst`, `viewer` with password `admin123`) using the active `PasswordEncoder` bean on startup.
* **`ResourceNotFoundException.java` & `BadRequestException.java`**: Custom unchecked exceptions mapping to `404 Not Found` and `400 Bad Request`.
* **`GlobalExceptionHandler.java`**: A `@RestControllerAdvice` safety net catching all exceptions across the application and formatting them into standard JSON error objects.

---

# 9. Agent Gateway Layer (Python AI Bridge)

Classes live in `com.vertexai.agent`.

* **`AgentClient.java`**: The Java interface contract defining the 4 agent methods:
  * `parseReports()` $\rightarrow$ Agent 1 (Parser)
  * `reduceNoise()` $\rightarrow$ Agent 2 (Noise Reduction / XGBoost)
  * `enrichThreats()` $\rightarrow$ Agent 3 (Threat Intel / EPSS / KEV)
  * `scoreAndPrepareTicket()` $\rightarrow$ Agent 4 (Risk Scoring & Ticket Prep)
* **`HttpAgentClient.java`**: The live network client using Spring's `RestTemplate` to call Python FastAPI microservices at `http://agents_service:8000/api/v1/agent/...`.
* **`MockAgentClient.java`**: The offline simulation client returning static JSON fixtures from `mocks/agent1_response.json` through `agent4_response.json` for testing without running Python.

---

# 10. Core Business Services Layer

Classes live in `com.vertexai.service`.

* **`AuthService.java`**: Validates login passwords via `AuthenticationManager` and issues signed JWT tokens.
* **`AssetService.java`**: Enforces hostname uniqueness, validates criticality ratings, and manages asset records.
* **`ScanService.java`**: Acts as the **Asset Authorization Gate** (verifying `is_authorized == true`), creates `ScanJob` rows, and triggers the asynchronous pipeline.
* **`PipelineOrchestrator.java`**: The **Human-in-the-Loop Workflow Engine**. Manages in-memory stage progression (Stage 1 $\rightarrow$ 2 $\rightarrow$ 3 $\rightarrow$ 4), pauses at `WAITING_FOR_HUMAN` checkpoints, halts pipelines on `STOP`, persists findings to PostgreSQL, and broadcasts real-time WebSocket updates.
* **`VulnerabilityService.java`**: Joins `canonical_vulnerabilities`, `vulnerability_intelligence`, and `risk_scores` into unified finding responses and handles risk acceptance.
* **`DashboardService.java`**: Computes live organizational security scores ($100 - \text{avg risk}$), noise reduction percentages, and top threats directly from database records.
* **`GitHubTicketingService.java`**: The **sole authorized GitHub REST API client** in the entire system. Invoked strictly after Final Human Approval (`approved == true`) to create live issues on GitHub and persist records in `risk_tickets`.

---

# 11. REST Controllers (The HTTP Front Doors)

Controllers live in `com.vertexai.controller` and expose the 10 frozen REST endpoints:

1. **`AuthController.java`**: `POST /api/auth/login` (Public)
2. **`AssetController.java`**: `POST /api/assets`, `GET /api/assets`, `GET /api/assets/{id}`
3. **`ScanController.java`**: `POST /api/scans`, `GET /api/scans/{id}`, `POST /api/scans/{id}/control`
4. **`VulnerabilityController.java`**: `GET /api/vulnerabilities`, `POST /api/vulnerabilities/{id}/accept-risk`, `POST /api/vulnerabilities/{id}/ticket`
5. **`DashboardController.java`**: `GET /api/dashboard`

---

# 12. Mock Fixtures & Unit Tests

* **`mocks/agent1_response.json`**: 5 sample parsed findings from Nmap, Nuclei, and ZAP.
* **`mocks/agent2_response.json`**: 4 deduplicated canonical findings with MD5 fingerprints and XGBoost false-positive probabilities.
* **`mocks/agent3_response.json`**: Findings enriched with CISA KEV (`true`) and EPSS scores (`0.975`).
* **`mocks/agent4_response.json`**: Scored findings with composite risk score (`96.5`), priority (`P0_CRITICAL`), 24-hour SLA deadline, explainable rationale, and prepared ticket payload.
* **`VertexAiApplicationTests.java`**: JUnit 5 test suite asserting that the composite risk formula, SLA timer logic, and Human-in-the-Loop security gates pass with 100% green checks.

---

# 13. ❓ Questions Asked During the Build (Doubts & Explanations)

---

### Q: What do `@Data`, `@Entity`, `@Table`, `@NoArgsConstructor`, `@AllArgsConstructor`, and `@Builder` mean, and why are they all used together on one entity class?
**A:** They eliminate hundreds of lines of tedious Java boilerplate code while connecting the class to the database:
* `@Entity`: Tells JPA/Hibernate: *"This Java class represents a database table."*
* `@Table(name = "...")`: Specifies the exact SQL table name in PostgreSQL.
* `@Data`: A Lombok annotation that auto-generates all getters (`getId()`), setters (`setName()`), `toString()`, and `equals()` methods in the background.
* `@NoArgsConstructor`: Generates a blank constructor (`new User()`), which Hibernate strictly requires to instantiate database rows.
* `@AllArgsConstructor`: Generates a constructor with all fields, required by the Builder pattern.
* `@Builder`: Enables the clean builder syntax (`User.builder().username("admin").build()`), making object creation readable and safe.

---

### Q: Why do we need `@Id`, `@GeneratedValue`, `@Column`, `@ManyToOne`, `@JoinColumn`, `columnDefinition`, `@Builder.Default`, and `@PrePersist` on `ScanJob.java`?
**A:** Each annotation handles a specific database mapping rule:
* `@Id` & `@GeneratedValue`: Marks the Primary Key and tells the database to generate a unique UUID automatically.
* `@Column`: Maps Java `camelCase` variables to SQL `snake_case` columns (e.g. `scannersUsed` $\rightarrow$ `scanners_used`).
* `@ManyToOne` & `@JoinColumn(name = "asset_id")`: Creates a relational **Foreign Key**. Many scan jobs can target the one same server (`Asset`).
* `columnDefinition = "TEXT"`: Tells PostgreSQL to use an unlimited `TEXT` column instead of a limited `VARCHAR(255)` for large scanner lists.
* `@Builder.Default`: Ensures default values (like `status = "PENDING"`) are preserved when creating objects using the `@Builder` pattern.
* `@PrePersist`: A lifecycle hook that automatically sets `startedAt = LocalDateTime.now()` right before the row is inserted into PostgreSQL.

---

### Q: What does `@Configuration` do, and why do we use it?
**A:** `@Configuration` tells Spring Boot: *"This class contains system setup instructions and bean definitions."* When the app starts, Spring reads these classes first to configure system-wide infrastructure like security firewalls (`SecurityConfig`), CORS rules (`CorsConfig`), and WebSocket brokers (`WebSocketConfig`).

---

### Q: What does `CorsConfig.java` do, and why do we need CORS at all?
**A:** Web browsers have a security rule called the **Same-Origin Policy**. If your frontend website is running on port `3000` (`localhost:3000`) and tries to fetch data from a backend on port `8080` (`localhost:8080`), the browser blocks the request by default because the ports are different. `CorsConfig` sends an official permission header to the browser saying: *"I officially permit `localhost:3000` to make API calls to me."*

---

### Q: What does `OpenApiConfig.java` do — is OpenAPI related to OpenAI / ChatGPT?
**A:** **No, OpenAPI is NOT related to OpenAI or ChatGPT.** 
* **OpenAI** is the artificial intelligence company that makes ChatGPT.
* **OpenAPI (formerly Swagger)** is an open industry standard for describing REST APIs. `OpenApiConfig.java` auto-generates an interactive web page at `http://localhost:8080/swagger-ui/index.html` with built-in "Try it out" buttons so you can test all API endpoints directly in your browser without downloading Postman.

---

### Q: What is "Service logic" — why use the Controller $\rightarrow$ Service $\rightarrow$ Repository layering instead of putting everything in the Controller?
**A:** This is the **Separation of Concerns** design pattern:
1. **Controller (The Front Desk):** Only handles HTTP requests, URL routes, and JSON conversion.
2. **Service (The Business Office):** Handles calculations, authorization checks, AI coordination, and multi-step workflows.
3. **Repository (The Storage Vault):** Only handles database queries.

**Why not put everything in the Controller?** If you put database queries and business logic inside the controller, your code becomes messy, impossible to unit test, and cannot be reused across different endpoints or background schedulers.

---

### Q: What does `@Transactional` do, and what is the difference between `@Transactional` and `@Transactional(readOnly = true)`?
**A:** 
* **`@Transactional` (Read-Write):** Wraps operations in an all-or-nothing database transaction.  
  * *Bank Transfer Analogy:* If you transfer \$100 from Account A to Account B, the system must (1) deduct \$100 from A and (2) add \$100 to B. If step 2 crashes, `@Transactional` rolls back step 1 so money is never lost.
* **`@Transactional(readOnly = true)`:** Used for search/fetch queries (like `getAllAssets()`). It tells the database: *"I am only reading data, not modifying anything."* This allows the database to optimize memory and skip dirty-checking, making queries much faster.

---

### Q: What is method chaining / Fluent API syntax, and how is it different from the Builder pattern (`@Builder`)?
**A:** 
* **Fluent API / Method Chaining (seen in `OpenApiConfig.java`):** Every method returns the same object (`return this;`), allowing you to chain calls together: `new OpenAPI().info(...).addSecurityItem(...)`.
* **Builder Pattern (`@Builder`):** Uses a dedicated separate helper class (`UserBuilder`) that collects fields one by one and instantiates the final immutable object at the very end when `.build()` is called.

---

### Q: How is the 4-agent Human-in-the-Loop workflow started, and why does it run asynchronously?
**A:** `ScanService.startScan(...)` saves the `ScanJob` row and publishes a `ScanStartedEvent`. `PipelineOrchestrator.onScanStarted(...)` consumes it with `@TransactionalEventListener(phase = AFTER_COMMIT)` **plus** `@Async`, so the workflow runs on a background thread and the REST controller returns HTTP `202 Accepted` in milliseconds while the agents keep working and streaming updates over WebSockets.

The `AFTER_COMMIT` phase is not cosmetic. An earlier version invoked the `@Async` pipeline directly from inside the `@Transactional` `startScan` method, so the worker thread could begin before the transaction committed and could not see the `scan_jobs` row it was meant to update. Because that update used `Optional.ifPresent(...)`, the write was discarded with no log and no exception — the database stayed on `RUNNING` forever while the in-memory cache advanced, so HITL gates never opened in the UI. Deferring to `AFTER_COMMIT` removes the race, and `updateScanJobProgress(...)` now logs an ERROR if the row is ever missing.

---

### Q: Where did the Composite Risk Score formula come from, and what should I tell the panel if they ask?
**A:** Our formula is based on the **Contextual Risk-Based Vulnerability Management (RBVM)** framework standard (NIST SP 800-30, FIRST.org EPSS v3, and CISA KEV BOD 22-01):
$$\text{Score} = \left(\frac{\text{CVSS}}{10} \times 30\right) + (\text{EPSS} \times 35) + \text{KEV\_Bonus} + \left(\frac{\text{Asset\_Criticality}}{5} \times 20\right)$$
* **What to tell the panel:** *"Historically, CVSS alone caused alert fatigue because it only measures theoretical severity in a lab. Our formula combines 4 real-world dimensions: CVSS (30% technical severity), EPSS (35% probability of exploit in the next 30 days), CISA KEV (+25 emergency bonus for active weaponization), and Asset Criticality (+20 points for business impact). This ensures engineers fix what is actively dangerous first."*
