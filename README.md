FORENSIC-X

### Integrated Digital Forensics & Evidence Management Platform

FORENSIC-X is a digital forensics platform designed to provide investigators with a centralized environment for digital evidence acquisition, recovery, examination, chain-of-custody management, evidence integrity verification, and secure sanitization.

The project aims to bring multiple digital forensic operations into a single, structured workflow while maintaining evidence integrity and traceability throughout the investigation lifecycle.

---

## 🚀 Live Demo

**Demo:** https://demo.trikstarevitrace.in/

> The current deployment is intended for demonstration and evaluation purposes.

---

## 🎯 Problem Statement

Digital forensic investigations often involve multiple tools and disconnected workflows for:

- Evidence acquisition
- Deleted-file recovery
- Evidence examination
- Hash generation and verification
- Chain-of-custody tracking
- Evidence storage
- Reporting
- Secure data sanitization

Managing these operations across different tools can make investigations difficult to track and can increase the risk of losing important metadata or compromising evidence integrity.

FORENSIC-X aims to provide a unified digital forensic workstation that organizes these processes into a single workflow.

---

## 💡 Our Solution

FORENSIC-X provides a centralized interface for managing digital forensic investigations.

The platform is designed around the following workflow:

```text
Investigation
     ↓
Case Creation
     ↓
Evidence Acquisition
     ↓
Evidence Examination
     ↓
Recovery / Analysis
     ↓
Integrity Verification
     ↓
Chain of Custody
     ↓
Evidence Ledger
     ↓
Report Generation
     ↓
Secure Sanitization
✨ Key Features
📁 Case Management

Create and manage individual forensic cases.

Each case can contain:

Case identification
Investigation metadata
Evidence records
Investigation status
Reports
Chain-of-custody information
💾 Evidence Acquisition

Designed to support the structured acquisition of digital evidence from supported sources.

Potential sources include:

Storage drives
Mobile devices
External storage
Disk images
Selected folders/files

The acquisition workflow is designed to preserve evidence metadata and maintain traceability.

🔍 Deleted File Recovery

FORENSIC-X is designed to support recovery workflows for deleted digital files.

For supported devices and acquisition methods, investigators can select the relevant storage location and perform recovery analysis.

Example workflow:

Device
  ↓
Select Source
  ↓
Acquire / Analyze
  ↓
Identify Deleted Data
  ↓
Recover
  ↓
Verify
  ↓
Store as Evidence
🔐 Evidence Integrity

Evidence integrity is a critical component of digital forensics.

FORENSIC-X is designed to use cryptographic hashing to verify that evidence has not been modified.

Example:

Original Evidence
       ↓
   SHA-256 Hash
       ↓
 Evidence Record
       ↓
Later Verification
       ↓
Hash Comparison

If the calculated hash changes, the evidence can be flagged for further investigation.

⛓️ Chain of Custody

FORENSIC-X provides a structured Chain of Custody workflow to track evidence handling.

Events can include:

Evidence acquisition
Evidence transfer
Evidence access
Evidence analysis
Evidence storage
Evidence export

Example:

Evidence Acquired
       ↓
Investigator A
       ↓
Forensic Analysis
       ↓
Investigator B
       ↓
Report Generation

The objective is to maintain a traceable history of evidence throughout the investigation.

📒 Evidence Ledger

The Evidence Ledger provides a structured record of evidence-related operations.

The future backend implementation can maintain:

Evidence ID
Case ID
Hash
Timestamp
Action
Investigator
Evidence location
Chain-of-custody information
🧹 Secure Sanitization

FORENSIC-X includes a sanitization workflow for controlled removal of data.

The system is intended to distinguish between different sanitization targets, such as:

Database
   ↓
Stored Evidence

OR

Storage Drive
   ↓
Selected Data

OR

Acquired Evidence
   ↓
Selected Evidence Object

Sanitization operations should only be performed after explicit authorization and confirmation.

🖥️ Application Modules

The current interface contains the following major modules:

Dashboard
Cases
Acquisition
Recovery
Evidence
Chain of Custody
Evidence Ledger
Sanitization
Reports
Settings
🏗️ System Architecture

The current application is primarily a web-based frontend.

The planned complete architecture is:

                 ┌─────────────────────┐
                 │       User          │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   FORENSIC-X UI    │
                 │     React/Vite      │
                 └──────────┬──────────┘
                            │
                         REST API
                            │
                            ▼
                 ┌─────────────────────┐
                 │      Backend        │
                 │  Business Logic     │
                 └──────────┬──────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌───────────┐  ┌───────────┐
        │ Database │  │ Evidence  │  │ Forensic  │
        │          │  │ Storage   │  │ Processing│
        └──────────┘  └───────────┘  └───────────┘
🛠️ Technology Stack
Frontend
React
TypeScript
Vite
Tailwind CSS
Wouter
shadcn/ui
Backend

The project currently contains an Express server structure.

Planned backend functionality includes:

REST APIs
Authentication
Case management
Evidence management
Database operations
Evidence integrity verification
Chain-of-custody management
Forensic processing
Database

A persistent database layer is planned for the complete backend implementation.

Potential data entities include:

Users
Cases
Evidence
Evidence Hashes
Chain of Custody Events
Reports
Audit Logs
Deployment

Current deployment architecture:

Domain
   ↓
DNS
   ↓
Vercel
   ↓
FORENSIC-X Web Application
📂 Project Structure
forensic-x/
│
├── client/
│   ├── public/
│   │   └── favicon.svg
│   │
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── ...
│
├── server/
│   └── index.ts
│
├── shared/
│
├── patches/
│
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
├── tsconfig.json
└── README.md
⚙️ Installation
Prerequisites

Make sure the following are installed:

Node.js
pnpm
Git
Clone the Repository
git clone https://github.com/BusySouvik/forensic-x.git

Enter the project directory:

cd forensic-x
Install Dependencies
pnpm install
Run Development Server
pnpm dev

The development server will start locally.

🏭 Production Build

Build the project using:

pnpm build
🔌 API Architecture

The planned backend exposes REST APIs between the frontend and backend.

Example:

GET /api/cases
POST /api/cases
GET /api/cases/:id

GET /api/evidence
POST /api/evidence
GET /api/evidence/:id

GET /api/reports/:id
POST /api/reports

Example request flow:

Frontend
   │
   │ GET /api/cases
   ▼
Backend
   │
   │ Database Query
   ▼
Database
   │
   │ Case Data
   ▼
Backend
   │
   │ JSON Response
   ▼
Frontend
🔒 Security Considerations

Digital forensic applications handle potentially sensitive evidence.

FORENSIC-X is designed with the following security principles in mind:

Authentication

Only authorized investigators should be able to access protected functionality.

Authorization

Users should only be able to perform operations permitted by their role.

Evidence Integrity

Cryptographic hashes should be generated and verified for evidence objects.

Audit Logging

Important operations should be recorded with timestamps and user information.

Secure Secrets

API keys, database credentials, and other secrets must never be committed to the source repository.

Data Protection

Sensitive evidence should be stored using appropriate access controls and encryption mechanisms.

🔐 Cryptographic Integrity

A cryptographic hash can be represented as:

H = SHA-256(Evidence)

During verification:

Current Hash == Stored Hash
        ↓
      Valid

If:

Current Hash != Stored Hash
        ↓
Evidence Integrity Warning

This allows investigators to detect unexpected changes to evidence.

🧪 Current Status
Frontend

🟢 Implemented

The FORENSIC-X dashboard and major interface modules are available in the current demonstration deployment.

Deployment

🟢 Implemented

The application is deployed through Vercel with a custom domain.

Backend

🟡 In Development

The current server structure primarily supports serving the application. The complete forensic backend/API layer is planned as the project progresses.

Database

🟡 Planned

A persistent database layer will be integrated for real case and evidence management.

Advanced Forensic Operations

🟡 Planned / In Development

Future implementation includes deeper integration for:

Device acquisition
Deleted-file recovery
Evidence processing
Cryptographic verification
Evidence ledger
Secure sanitization
Automated report generation
🚀 Future Scope

FORENSIC-X can be expanded with:

📱 Mobile device forensic acquisition
💽 Disk imaging
🔍 Advanced deleted-file recovery
🧬 File signature analysis
🔐 Advanced cryptographic verification
⛓️ Immutable evidence ledger
🤖 AI-assisted forensic analysis
📊 Automated forensic reports
👥 Role-based investigator access
📝 Complete audit logging
☁️ Secure evidence storage
🔗 Blockchain-backed evidence verification
🧹 Advanced secure data sanitization
🎓 SIH Objective

FORENSIC-X is developed as a technology solution for modernizing and centralizing digital forensic workflows.

The objective is to reduce fragmented forensic processes and provide investigators with a unified platform for managing digital evidence while maintaining:

Integrity
   +
Traceability
   +
Security
   +
Accountability
   +
Efficiency
👥 Contributors

FORENSIC-X Team

Developed as part of the Smart India Hackathon (SIH).

📜 License

This project is currently intended for educational, research, and demonstration purposes.

⭐ Project

If you find the project useful, consider giving the repository a ⭐ on GitHub.

FORENSIC-X — Integrated Digital Evidence Workstation
