import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Binary,
  BookOpenCheck,
  Boxes,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  Clock3,
  Database,
  FileArchive,
  FileCheck2,
  Fingerprint,
  HardDrive,
  KeyRound,
  Laptop,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  UserCheck,
  UserPlus,
  UserCog,
  Users,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  type ApiUser,
  type Investigator,
  type Authorization,
  type Device,
  type Investigation,
  type Workflow,
  type AcquisitionJob,
  type WorkingCopy,
  type RecoveryJob,
  type RecoveryCertificate,
  type SanitizationJob,
  type EvidenceRecord,
  type RecoveredArtifact,
  type AuditEvent,
  type AnalysisJob,
  getHealth,
  getCurrentUser,
  login as apiLogin,
  createInvestigation,
  createDevice,
  clearAccessToken,
  decideAuthorization,
  listAcquisitions,
  listAuthorizations,
  listDevices,
  listInvestigations,
  listInvestigators,
  createInvestigator,
  updateInvestigatorStatus,
  getWorkflow,
  listWorkingCopies,
  listRecoveryJobs,
  listRecoveryCertificates,
  listSanitizationJobs,
  saveWorkflow,
  startAnalysis as apiStartAnalysis,
  listEvidence,
  listRecoveredArtifacts,
  listAuditEvents,
  listAnalysisJobs,
  createAnalysisJob,
  validateCertificate,
  rejectCertificate,
  recoveredArtifactDownloadUrl,
} from "@/lib/api";

type Role = "gateway" | "administrator" | "investigator";
type PageKey =
  | "dashboard"
  | "investigations"
  | "evidence"
  | "devices"
  | "acquisition"
  | "recovery"
  | "validation"
  | "analysis"
  | "sanitization"
  | "investigators"
  | "assignment"
  | "authorizations"
  | "permissions"
  | "custody"
  | "audit"
  | "ledger"
  | "agent"
  | "storage"
  | "system";

type NavItem = { key: PageKey; label: string; icon: LucideIcon; badge?: string };

type BackendSnapshot = {
  user: ApiUser;
  health: { status: string; service: string; timestamp: string } | null;
  investigations: Investigation[];
  investigators: Investigator[];
  authorizations: Authorization[];
  devices: Device[];
  workflow: Workflow | null;
  acquisitions: AcquisitionJob[];
  workingCopies: WorkingCopy[];
  recoveryJobs: RecoveryJob[];
  certificates: RecoveryCertificate[];
  sanitizationJobs: SanitizationJob[];
  evidence: EvidenceRecord[];
  artifacts: RecoveredArtifact[];
  auditEvents: AuditEvent[];
  analysisJobs: AnalysisJob[];
  unavailable: string[];
  loading: boolean;
  error: string | null;
};

type Status = "ACTIVE" | "PENDING" | "COMPLETED" | "LOCKED" | "OFFLINE" | "QUEUED";

const adminSections: { title: string; items: NavItem[] }[] = [
  {
    title: "OVERVIEW",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "investigations", label: "Investigations", icon: BriefcaseBusiness },
      { key: "evidence", label: "Evidence", icon: Boxes },
      { key: "devices", label: "Devices", icon: Laptop },
    ],
  },
  {
    title: "WORKFLOW CONTROL",
    items: [
      { key: "acquisition", label: "Acquisition", icon: ArrowDownToLine },
      { key: "recovery", label: "Recovery", icon: RefreshCw },
      { key: "validation", label: "Validation", icon: FileCheck2 },
      { key: "analysis", label: "Analysis", icon: Binary },
      { key: "sanitization", label: "Sanitization", icon: Archive },
    ],
  },
  {
    title: "ACCESS CONTROL",
    items: [
      { key: "investigators", label: "Investigators", icon: Users },
      { key: "assignment", label: "Task Assignment", icon: ListChecks },
      { key: "authorizations", label: "Authorizations", icon: KeyRound },
      { key: "permissions", label: "Permissions", icon: SlidersHorizontal },
    ],
  },
  {
    title: "FORENSIC GOVERNANCE",
    items: [
      { key: "custody", label: "Chain of Custody", icon: Fingerprint },
      { key: "audit", label: "Audit Log", icon: BookOpenCheck },
      { key: "ledger", label: "Blockchain Ledger", icon: Network },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { key: "agent", label: "Forensic Agent", icon: Zap },
      { key: "storage", label: "Storage", icon: HardDrive },
      { key: "system", label: "System Status", icon: Server },
    ],
  },
];

const investigatorItems: NavItem[] = [
  { key: "dashboard", label: "My Dashboard", icon: LayoutDashboard },
  { key: "investigations", label: "My Investigations", icon: BriefcaseBusiness },
  { key: "assignment", label: "My Tasks", icon: ListChecks },
  { key: "evidence", label: "Evidence", icon: Boxes },
  { key: "recovery", label: "Recovery", icon: RefreshCw },
  { key: "validation", label: "Validation", icon: FileCheck2 },
  { key: "analysis", label: "Analysis", icon: Binary },
  { key: "custody", label: "Chain of Custody", icon: Fingerprint },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function StatusDot({ tone = "green", pulse = false }: { tone?: string; pulse?: boolean }) {
  return <span className={cn("status-dot", `status-${tone}`, pulse && "status-pulse")} />;
}

function StatusPill({ status }: { status: Status | string }) {
  const tone = status === "ACTIVE" || status === "ONLINE" || status === "SEALED" || status === "SUCCESS" || status === "CONFIRMED" || status === "CONNECTED" || status === "VALIDATED" ? "green" : status === "PENDING" || status === "QUEUED" || status === "LOGGED" ? "amber" : status === "LOCKED" || status === "OFFLINE" ? "slate" : "cyan";
  return <span className={cn("status-pill", `pill-${tone}`)}><StatusDot tone={tone} />{status}</span>;
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("wordmark", compact && "wordmark-compact")}>
      <div className="wordmark-mark"><span>F</span><span className="mark-cross">×</span></div>
      <div>
        <div className="wordmark-name">FORENSIC<span>–</span>X</div>
        {!compact && <div className="wordmark-sub">DIGITAL FORENSICS SYSTEM</div>}
      </div>
    </div>
  );
}

function Gateway({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="gateway-shell">
      <div className="gateway-grid" />
      <div className="gateway-ambient ambient-a" />
      <div className="gateway-ambient ambient-b" />
      <header className="gateway-topbar">
        <Wordmark />
        <div className="gateway-build"><span>BUILD 2.6.14</span><span className="divider-dot">·</span><span>SECURE ENVIRONMENT</span></div>
      </header>
      <main className="gateway-main">
        <div className="gateway-kicker"><span className="kicker-line" /> SECURE ACCESS GATEWAY <span className="kicker-line" /></div>
        <h1>Authorized operators only.</h1>
        <p className="gateway-intro">Select an access point to continue into the forensic operations environment.</p>
        <div className="access-grid">
          <button className="access-card admin-access" onClick={() => onSelect("administrator")}>
            <div className="access-card-top"><span className="access-index">01</span><ShieldCheck size={18} /></div>
            <div className="access-icon"><UserCog size={32} strokeWidth={1.5} /></div>
            <div className="access-card-copy"><div className="access-role">ADMINISTRATOR ACCESS</div><div className="access-description">System administration<br />&amp; security control</div></div>
            <div className="access-enter">ENTER <ArrowUpRight size={15} /></div>
          </button>
          <button className="access-card investigator-access" onClick={() => onSelect("investigator")}>
            <div className="access-card-top"><span className="access-index">02</span><Fingerprint size={18} /></div>
            <div className="access-icon"><UserCheck size={32} strokeWidth={1.5} /></div>
            <div className="access-card-copy"><div className="access-role">INVESTIGATOR ACCESS</div><div className="access-description">Authorized forensic<br />investigation workspace</div></div>
            <div className="access-enter">ENTER <ArrowUpRight size={15} /></div>
          </button>
        </div>
        <div className="gateway-notice"><div><StatusDot tone="green" pulse /> SECURE CONNECTION</div><div><LockKeyhole size={13} /> ACCESS CONTROL ACTIVE</div><div><Activity size={13} /> AUDIT LOGGING ACTIVE</div></div>
      </main>
      <footer className="gateway-footer"><span>AUTHORIZED ACCESS ONLY</span><span>GOVERNMENT / AUTHORIZED FORENSIC USE</span><span>ALL RIGHTS RESERVED · 2026</span></footer>
    </div>
  );
}

function Login({ role, onBack, onLogin }: { role: Exclude<Role, "gateway">; onBack: () => void; onLogin: (email: string, password: string) => void | Promise<void> }) {
  const isAdmin = role === "administrator";
  return (
    <div className="login-shell">
      <div className="login-backdrop" />
      <div className="login-card">
        <div className="login-head"><Wordmark compact /><button className="icon-button subtle" onClick={onBack} aria-label="Return to gateway"><X size={16} /></button></div>
        <div className="login-rule" />
        <div className="login-eyebrow"><span className="eyebrow-tag">{isAdmin ? "ADMINISTRATIVE ACCESS" : "INVESTIGATOR ACCESS"}</span><StatusPill status="SECURE" /></div>
        <h1>{isAdmin ? "Administrator login" : "Investigator login"}</h1>
        <p className="login-caption">Enter your assigned credentials to authenticate this operator session.</p>
        <form className="login-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onLogin(String(form.get("email") || ""), String(form.get("password") || "")); }}>
          <label>{isAdmin ? "USERNAME / OPERATOR ID" : "INVESTIGATOR ID"}<div className="field-wrap"><UserCheck size={15} /><input name="email" type="email" autoComplete="username" required /></div></label>
          <label>PASSWORD<div className="field-wrap"><KeyRound size={15} /><input name="password" type="password" autoComplete="current-password" required /></div></label>
          <div className="login-options"><label className="checkbox-label"><input type="checkbox" defaultChecked /> <span>Trust this workstation</span></label><button type="button" className="text-link" onClick={() => toast("Contact your system administrator to reset credentials.")}>Credential assistance</button></div>
          <button className="primary-button full" type="submit"><span>AUTHENTICATE SESSION</span><ArrowUpRight size={16} /></button>
        </form>
        <div className="system-status-box"><div className="mini-heading">SYSTEM STATUS</div><div className="status-list"><span><StatusDot tone="green" />SECURE</span><span><StatusDot tone="green" />ACCESS CONTROL ACTIVE</span><span><StatusDot tone="green" />AUDIT LOGGING ACTIVE</span></div></div>
        <div className="login-fineprint"><LockKeyhole size={12} /> Authentication events are recorded against the active ledger.</div>
      </div>
      <div className="login-footer"><span>AUTHORIZED ACCESS ONLY</span><span>FORENSIC-X // RESTRICTED SYSTEM</span></div>
    </div>
  );
}

function Sidebar({ role, user, active, onNavigate, onLogout }: { role: Exclude<Role, "gateway">; user: ApiUser; active: PageKey; onNavigate: (page: PageKey) => void; onLogout: () => void }) {
  const isAdmin = role === "administrator";
  const [collapsed, setCollapsed] = useState(false);
  const groups = isAdmin ? adminSections : [{ title: "AUTHORIZED WORKSPACE", items: investigatorItems.slice(0, 4) }, { title: "AUTHORIZED WORKFLOW", items: investigatorItems.slice(4, 7) }, { title: "FORENSIC GOVERNANCE", items: investigatorItems.slice(7) }];
  return (
    <aside className={cn("sidebar", collapsed && "sidebar-collapsed")}>
      <div className="sidebar-brand"><Wordmark compact={!collapsed} /><button className="icon-button subtle" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"><PanelLeftClose size={16} /></button></div>
      <div className="sidebar-session"><div className="session-badge"><StatusDot tone="green" pulse /> <span>{user.name || user.email} SESSION</span></div><div className="session-role">{isAdmin ? "FULL SYSTEM ACCESS" : "RESTRICTED WORKSPACE"}</div></div>
      <nav className="sidebar-nav">
        {groups.map((group) => <div className="nav-group" key={group.title}><div className="nav-group-title">{group.title}</div>{group.items.map((item) => <button key={item.key} className={cn("nav-item", active === item.key && "nav-item-active")} onClick={() => onNavigate(item.key)} title={collapsed ? item.label : undefined}><item.icon size={16} /><span className="nav-label">{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}</button>)}</div>)}
      </nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => toast("Forensic agent console is healthy.")}><Settings2 size={16} /><span className="nav-label">Preferences</span></button><button className="nav-item logout-item" onClick={onLogout}><LogOut size={16} /><span className="nav-label">Logout</span></button></div>
    </aside>
  );
}

function Topbar({ role, user, onNavigate }: { role: Exclude<Role, "gateway">; user: ApiUser; onNavigate: (page: PageKey) => void }) {
  const isAdmin = role === "administrator";
  return <header className="app-topbar"><div className="topbar-title"><span className="topbar-path">FORENSIC-X <ChevronRight size={13} /> {isAdmin ? "ADMIN CONTROL CENTER" : "INVESTIGATOR CONSOLE"}</span><span className="topbar-context">/ {isAdmin ? "OPERATIONS OVERVIEW" : "ASSIGNED WORKSPACE"}</span></div><div className="topbar-actions"><div className="topbar-live"><StatusDot tone="green" pulse /> SYSTEM STATUS <span>SECURE</span></div><button className="icon-button" onClick={() => toast("No new system notifications.")} aria-label="Notifications"><Bell size={17} /><span className="notification-dot" /></button><div className="operator-chip" onClick={() => onNavigate(isAdmin ? "system" : "dashboard")}><div className="operator-avatar">{(user.name || user.email).slice(0, 2).toUpperCase()}</div><div><div className="operator-name">{user.name || user.email}</div><div className="operator-role">{isAdmin ? "SYSTEM ADMINISTRATOR" : "INVESTIGATOR"}</div></div><ChevronDown size={14} /></div></div></header>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><div className="page-eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function SectionHeader({ label, meta, action }: { label: string; meta?: string; action?: React.ReactNode }) {
  return <div className="section-header"><div className="section-title">{label}{meta && <span>{meta}</span>}</div>{action}</div>;
}

function StatCard({ label, value, sub, icon: Icon, tone = "cyan", delta }: { label: string; value: string; sub: string; icon: LucideIcon; tone?: string; delta?: string }) {
  return <div className={cn("stat-card", `stat-${tone}`)}><div className="stat-top"><div className="stat-label">{label}</div><div className="stat-icon"><Icon size={17} /></div></div><div className="stat-value-row"><div className="stat-value">{value}</div>{delta && <span className="stat-delta">{delta}</span>}</div><div className="stat-sub">{sub}</div><div className="stat-accent" /></div>;
}

function EmptyState({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <div className="empty-state"><Icon size={20} /><div><strong>{title}</strong><span>{detail}</span></div></div>;
}

function UnavailableState({ feature, detail }: { feature: string; detail: string }) {
  return <div className="empty-state unavailable-state"><CircleAlert size={20} /><div><strong>{feature} unavailable</strong><span>{detail}</span></div></div>;
}

function ConsoleState({ snapshot }: { snapshot: BackendSnapshot }) {
  if (snapshot.loading) return <div className="panel"><EmptyState icon={RefreshCw} title="Loading authorized workspace" detail="Fetching current session, investigations, assignments and evidence state from the backend." /></div>;
  if (snapshot.error) return <div className="panel"><UnavailableState feature="Backend connection" detail={snapshot.error} /></div>;
  return null;
}

function DataTable({ columns, children }: { columns: string[]; children: React.ReactNode }) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function investigationLabel(snapshot: BackendSnapshot, id?: string | null) {
  return snapshot.investigations.find((item) => item.id === id)?.investigationNumber || id || "—";
}

function selectActiveInvestigation(investigations: Investigation[]) {
  return investigations.find((item) => item.status === "IN_PROGRESS")
    || investigations.find((item) => item.status === "OPEN")
    || investigations.find((item) => item.status !== "ARCHIVED" && item.status !== "CLOSED")
    || investigations[0];
}

function ForensicPipeline() {
  const stages = [
    ["SOURCE", "Physical evidence"],
    ["ACQUISITION", "Authorized capture"],
    ["MASTER IMAGE", "Protected original"],
    ["WORKING COPY", "Controlled workspace"],
    ["RECOVERY", "Artifact processing"],
    ["VALIDATION", "Independent review"],
    ["ANALYSIS", "Authorized examination"],
  ];
  return <section className="panel pipeline-panel"><SectionHeader label="FORENSIC OPERATING MODEL" meta="CONTROLLED EVIDENCE PATH" /><div className="pipeline-intro"><div><strong>One source. One protected master.</strong><span>Investigators operate on controlled working copies and independent validation gates analysis.</span></div><span className="pipeline-note"><ShieldCheck size={14} /> SEPARATION OF DUTIES ENFORCED</span></div><div className="forensic-pipeline">{stages.map(([label, detail], index) => <div className="pipeline-stage" key={label}><div className="pipeline-node"><span>{String(index + 1).padStart(2, "0")}</span></div><div><strong>{label}</strong><small>{detail}</small></div>{index < stages.length - 1 && <ChevronRight className="pipeline-arrow" size={15} />}</div>)}</div></section>;
}

function AdminDashboard({ onNavigate, snapshot }: { onNavigate: (page: PageKey) => void; snapshot: BackendSnapshot }) {
  if (snapshot.loading || snapshot.error) return <div className="page-stack"><PageHeader eyebrow="SYSTEM OVERVIEW" title="Control center" description="Live state from the FORENSIC-X backend." /><ConsoleState snapshot={snapshot} /></div>;
  const pending = snapshot.authorizations.filter((item) => item.status === "PENDING").length;
  return <div className="page-stack dashboard-page">
    <PageHeader eyebrow="SYSTEM OVERVIEW / LIVE BACKEND" title="Control center" description="Operational state across investigations, access, devices and controlled workflow." actions={<><button className="secondary-button" onClick={() => window.location.reload()}><RefreshCw size={15} /> Refresh</button><button className="primary-button" onClick={() => onNavigate("authorizations")}><ListChecks size={15} /> Review requests <span className="button-count">{pending}</span></button></>} />
    <div className="stat-grid"><StatCard label="INVESTIGATIONS" value={String(snapshot.investigations.length).padStart(2, "0")} sub="Returned by backend" icon={BriefcaseBusiness} tone="cyan" /><StatCard label="MASTER EVIDENCE" value="—" sub="No list endpoint exposed" icon={Boxes} tone="violet" /><StatCard label="INVESTIGATORS" value={String(snapshot.investigators.length).padStart(2, "0")} sub="Backend user registry" icon={Users} tone="green" /><StatCard label="PENDING APPROVALS" value={String(pending).padStart(2, "0")} sub="Authorization requests" icon={CircleAlert} tone="amber" /></div>
    <ForensicPipeline />
    <div className="dashboard-grid-primary"><section className="panel service-panel"><SectionHeader label="SYSTEM SERVICES" meta={snapshot.health?.status === "ok" ? "API ONLINE" : "UNAVAILABLE"} action={<button className="panel-action" onClick={() => onNavigate("system")}>VIEW STATUS <ArrowUpRight size={13} /></button>} /><div className="service-list"><div className="service-row"><div className="service-icon"><Server size={16} /></div><div className="service-name"><strong>FORENSIC-X API</strong><span>{snapshot.health?.service || "health endpoint unavailable"}</span></div><div className="service-status"><StatusDot tone={snapshot.health?.status === "ok" ? "green" : "red"} pulse /><span>{snapshot.health?.status === "ok" ? "OPERATIONAL" : "UNAVAILABLE"}</span></div></div><div className="service-row"><div className="service-icon"><Database size={16} /></div><div className="service-name"><strong>Evidence registry</strong><span>Listing endpoint is not exposed</span></div><div className="service-status"><StatusDot tone="amber" /><span>UNAVAILABLE</span></div></div></div></section><section className="panel workflow-panel"><SectionHeader label="WORKFLOW STATE" meta="LIVE RECORDS" /><div className="throughput-total"><span>{snapshot.acquisitions.length + snapshot.recoveryJobs.length}</span><span>tracked operation jobs</span><StatusPill status="BACKEND" /></div><div className="workflow-summary"><div><span>WORKING COPIES</span><strong>{snapshot.workingCopies.length}</strong></div><div><span>RECOVERY CERTIFICATES</span><strong>{snapshot.certificates.length}</strong></div><div><span>SANITIZATION JOBS</span><strong>{snapshot.sanitizationJobs.length}</strong></div></div></section></div>
    <section className="panel"><SectionHeader label="ACTIVE INVESTIGATIONS" meta="BACKEND REGISTER" action={<button className="panel-action" onClick={() => onNavigate("investigations")}>VIEW ALL <ArrowUpRight size={13} /></button>} /><DataTable columns={["CASE ID", "TITLE", "STATUS", "CREATED", "CREATED BY"]}>{snapshot.investigations.map((item) => <tr key={item.id}><td><span className="mono emphasis">{item.investigationNumber}</span></td><td><strong>{item.title}</strong><span className="cell-sub">{item.id}</span></td><td><StatusPill status={item.status} /></td><td className="muted-cell">{formatDate(item.createdAt)}</td><td><span className="mono">{item.createdBy}</span></td></tr>)}</DataTable>{snapshot.investigations.length === 0 && <EmptyState icon={BriefcaseBusiness} title="No investigations returned" detail="Create an investigation through the backend before using this workspace." />}</section>
  </div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal-panel" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><div className="page-eyebrow">ADMINISTRATION / CONTROLLED CHANGE</div><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>{children}</section></div>;
}

function InvestigationsPage({ snapshot, canCreate = false }: { snapshot: BackendSnapshot; canCreate?: boolean }) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const rows = snapshot.investigations.filter((item) => `${item.investigationNumber} ${item.title} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); try { const created = await createInvestigation({ investigationNumber: String(form.get("investigationNumber")), title: String(form.get("title")), description: String(form.get("description") || ""), status: String(form.get("status")) as Investigation["status"] }); const assignment = { acquisitionInvestigatorId: String(form.get("acquisitionInvestigatorId") || ""), recoveryInvestigatorId: String(form.get("recoveryInvestigatorId") || ""), validationInvestigatorId: String(form.get("validationInvestigatorId") || ""), analysisInvestigatorId: String(form.get("analysisInvestigatorId") || "") }; if (Object.values(assignment).every(Boolean)) await saveWorkflow(created.investigation.id, assignment); toast(Object.values(assignment).every(Boolean) ? "Investigation and operational workflow persisted." : "Investigation created; workflow remains unconfigured."); setCreateOpen(false); window.location.reload(); } catch (error) { toast(error instanceof Error ? error.message : "Investigation creation failed."); } finally { setSaving(false); } };
  return <div className="page-stack"><PageHeader eyebrow="CASE MANAGEMENT / LIVE REGISTER" title="Investigations" description="Investigation records returned by the existing backend." actions={canCreate ? <button className="primary-button" onClick={() => setCreateOpen(true)}><BriefcaseBusiness size={15} /> New investigation</button> : undefined} /><section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={15} /><input placeholder="Search case number, title or status" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div><DataTable columns={["CASE ID", "TITLE", "DESCRIPTION", "STATUS", "CREATED", "UPDATED"]}>{rows.map((item) => <tr key={item.id}><td><span className="mono emphasis">{item.investigationNumber}</span><span className="cell-sub">{item.id}</span></td><td><strong>{item.title}</strong></td><td className="muted-cell">{item.description || "—"}</td><td><StatusPill status={item.status} /></td><td className="muted-cell">{formatDate(item.createdAt)}</td><td className="muted-cell">{formatDate(item.updatedAt)}</td></tr>)}</DataTable>{rows.length === 0 && <EmptyState icon={BriefcaseBusiness} title="No matching investigations" detail="The backend returned no records for this filter." />}<div className="table-footer"><span>Showing {rows.length} of {snapshot.investigations.length} investigations</span></div></section>{createOpen && canCreate && <Modal title="Create investigation" onClose={() => setCreateOpen(false)}><form className="modal-form" onSubmit={submit}><label>CASE REFERENCE<input name="investigationNumber" placeholder="CASE-0042" required /></label><label>CASE TITLE<input name="title" placeholder="Digital evidence investigation" required /></label><label>DESCRIPTION<textarea name="description" placeholder="Operational context and scope" rows={4} /></label><label>INITIAL STATUS<select name="status" defaultValue="OPEN"><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN PROGRESS</option></select></label><div className="form-section-label">OPTIONAL OPERATIONAL WORKFLOW</div><div className="modal-select-grid">{([['acquisitionInvestigatorId', 'ACQUISITION'], ['recoveryInvestigatorId', 'RECOVERY'], ['validationInvestigatorId', 'VALIDATION'], ['analysisInvestigatorId', 'ANALYSIS']] as const).map(([name, label]) => <label key={name}>{label}<select name={name} defaultValue=""><option value="">Leave unconfigured</option>{snapshot.investigators.map((investigator) => <option key={investigator.id} value={investigator.id}>{investigator.name} · {investigator.investigatorId || investigator.id}</option>)}</select></label>)}</div><span className="field-help">Select all four to persist the workflow with this case. Recovery and Validation must be different investigators.</span><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Creating…" : "Create investigation"}</button></div></form></Modal>}</div>;
}

function EvidencePage({ snapshot }: { snapshot: BackendSnapshot }) {
  return <div className="page-stack"><PageHeader eyebrow="EVIDENCE REGISTER / ACTIVE INVESTIGATION" title="Master evidence" description="Authoritative evidence records returned from PostgreSQL with MinIO metadata. Master images remain protected." /><section className="panel"><SectionHeader label="PROTECTED MASTER REGISTER" meta={`${snapshot.evidence.length} RETURNED`} /><DataTable columns={["EVIDENCE", "SOURCE DEVICE", "SHA-256", "SIZE", "STORAGE", "PROTECTION"]}>{snapshot.evidence.map((row) => <tr key={row.evidence.id}><td><strong>{row.evidence.id}</strong><span className="cell-sub">Acquisition {row.evidence.acquisitionJobId}</span></td><td>{row.device?.deviceIdentifier || "Source metadata unavailable"}</td><td className="mono muted-cell">{row.evidence.sha256}</td><td>{row.evidence.size} bytes</td><td><span className="mono">{row.storageObject.bucket}</span><span className="cell-sub">{row.storageObject.objectKey}</span></td><td><StatusPill status="MASTER_IMAGE_PROTECTED" /></td></tr>)}</DataTable>{snapshot.evidence.length === 0 && <EmptyState icon={Boxes} title="No master evidence returned" detail="Only persisted evidence records are shown. Complete an authorized acquisition before a master appears here." />}</section></div>;
}

function DevicesPage({ snapshot }: { snapshot: BackendSnapshot }) {
  const investigationId = snapshot.investigations[0]?.id;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!investigationId) return; const form = new FormData(event.currentTarget); setSaving(true); try { await createDevice(investigationId, { deviceIdentifier: String(form.get("deviceIdentifier")), deviceType: String(form.get("deviceType")), manufacturer: String(form.get("manufacturer") || ""), model: String(form.get("model") || ""), serialNumber: String(form.get("serialNumber") || ""), capacity: String(form.get("capacity") || ""), connectionType: String(form.get("connectionType") || "") }); toast("Registered device persisted by backend."); setOpen(false); window.location.reload(); } catch (error) { toast(error instanceof Error ? error.message : "Device registration failed."); } finally { setSaving(false); } };
  return <div className="page-stack"><PageHeader eyebrow="DEVICE INVENTORY / REGISTERED DEVICES" title="Devices" description="Registered device metadata is persisted in PostgreSQL. Live physical devices remain Agent-only and are never fabricated in the browser." actions={snapshot.user.role === "ADMIN" && investigationId ? <button className="primary-button" onClick={() => setOpen(true)}><Laptop size={15} /> Register device</button> : undefined} /><section className="panel"><SectionHeader label="REGISTERED DEVICE INVENTORY" meta={`${snapshot.devices.length} RETURNED`} /><DataTable columns={["DEVICE IDENTIFIER", "TYPE", "MANUFACTURER", "MODEL", "SERIAL", "CAPACITY", "STATUS"]}>{snapshot.devices.map((device) => <tr key={device.id}><td><span className="mono emphasis">{device.deviceIdentifier}</span><span className="cell-sub">{device.id}</span></td><td>{device.deviceType}</td><td className="muted-cell">{device.manufacturer || "—"}</td><td className="muted-cell">{device.model || "—"}</td><td className="mono muted-cell">{device.serialNumber || "—"}</td><td className="muted-cell">{device.capacity || "—"}</td><td><StatusPill status={device.status} /></td></tr>)}</DataTable>{snapshot.devices.length === 0 && <EmptyState icon={Laptop} title="No registered devices returned" detail="Register a persisted device record or connect the privileged Agent for live enumeration." />}</section>{open && <Modal title="Register device metadata" onClose={() => setOpen(false)}><form className="modal-form" onSubmit={submit}><label>DEVICE IDENTIFIER<input name="deviceIdentifier" required /></label><label>DEVICE TYPE<select name="deviceType" defaultValue="OTHER"><option>HDD</option><option>SSD</option><option>NVME</option><option>USB</option><option>MOBILE</option><option>OPTICAL</option><option>OTHER</option></select></label><label>MANUFACTURER<input name="manufacturer" /></label><label>MODEL<input name="model" /></label><label>SERIAL NUMBER<input name="serialNumber" /></label><label>CAPACITY<input name="capacity" placeholder="1 TB" /></label><label>CONNECTION TYPE<select name="connectionType" defaultValue=""><option value="">Not recorded</option><option>SATA</option><option>USB</option><option>NVME</option><option>NETWORK</option><option>OTHER</option></select></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Registering…" : "Register device"}</button></div></form></Modal>}</div>;
}

function AssignmentPage({ snapshot }: { snapshot: BackendSnapshot }) {
  const selectedCase = selectActiveInvestigation(snapshot.investigations);
  const [workflow, setWorkflow] = useState<Workflow | null>(snapshot.workflow);
  const [assignments, setAssignments] = useState({ acquisitionInvestigatorId: workflow?.acquisitionInvestigatorId || "", recoveryInvestigatorId: workflow?.recoveryInvestigatorId || "", validationInvestigatorId: workflow?.validationInvestigatorId || "", analysisInvestigatorId: workflow?.analysisInvestigatorId || "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setWorkflow(snapshot.workflow);
  }, [snapshot.workflow]);
  useEffect(() => {
    setAssignments({ acquisitionInvestigatorId: workflow?.acquisitionInvestigatorId || "", recoveryInvestigatorId: workflow?.recoveryInvestigatorId || "", validationInvestigatorId: workflow?.validationInvestigatorId || "", analysisInvestigatorId: workflow?.analysisInvestigatorId || "" });
  }, [workflow]);
  const rows = workflow ? [["ACQUISITION", workflow.acquisitionInvestigatorId], ["RECOVERY", workflow.recoveryInvestigatorId], ["VALIDATION", workflow.validationInvestigatorId], ["ANALYSIS", workflow.analysisInvestigatorId]] : [];
  const updateAssignment = (stage: keyof typeof assignments, value: string) => setAssignments((current) => ({ ...current, [stage]: value }));
  const configure = async () => {
    if (!selectedCase || Object.values(assignments).some((value) => !value)) return;
    setSaving(true);
    try {
      const result = await saveWorkflow(selectedCase.id, assignments);
      setWorkflow(result.workflow);
      toast("Workflow configuration saved by backend.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Workflow configuration failed.");
    } finally {
      setSaving(false);
    }
  };
  const workflowContent = workflow
    ? <DataTable columns={["STAGE", "ASSIGNED INVESTIGATOR", "VERSION", "UPDATED"]}>{rows.map(([stage, investigator]) => { const person = snapshot.investigators.find((item) => item.id === investigator); return <tr key={stage}><td><span className="stage-chip">{stage}</span></td><td><strong>{person?.name || "Investigator record unavailable"}</strong><span className="cell-sub mono">{investigator}</span></td><td>{workflow.version}</td><td className="muted-cell">{formatDate(workflow.updatedAt)}</td></tr>; })}</DataTable>
    : <EmptyState icon={ShieldCheck} title="WORKFLOW NOT CONFIGURED" detail={selectedCase ? "Assign eligible investigators below to create the persisted workflow for this investigation." : "The backend returned no investigations to select."} />;
  return <div className="page-stack">
    <PageHeader eyebrow="WORKFLOW CONTROL / LIVE ASSIGNMENT" title="Task assignment" description="The backend exposes one workflow record per investigation with four assigned stages." actions={selectedCase ? <div className="assignment-case-select"><span>CASE</span><strong>{selectedCase.investigationNumber}</strong></div> : undefined} />
    <section className="panel">
      <SectionHeader label="CONTROLLED WORKFLOW" meta={selectedCase ? selectedCase.id : "NO CASE SELECTED"} />
      {workflowContent}
      {selectedCase && snapshot.investigators.length > 0 ? <div className="workflow-config-form"><div className="mini-heading">CONFIGURE ASSIGNMENTS</div>{([['acquisitionInvestigatorId', 'ACQUISITION'], ['recoveryInvestigatorId', 'RECOVERY'], ['validationInvestigatorId', 'VALIDATION'], ['analysisInvestigatorId', 'ANALYSIS']] as const).map(([stage, label]) => <label key={stage}>{label}<select value={assignments[stage]} onChange={(event) => updateAssignment(stage, event.target.value)}><option value="">Select investigator</option>{snapshot.investigators.map((investigator) => <option key={investigator.id} value={investigator.id}>{investigator.name} ({investigator.id})</option>)}</select></label>)}<button className="primary-button" disabled={saving || Object.values(assignments).some((value) => !value)} onClick={() => void configure()}>{saving ? "Saving…" : "Save workflow configuration"}</button></div> : selectedCase ? <UnavailableState feature="Workflow configuration unavailable" detail="No eligible investigators were returned by the Admin investigator endpoint." /> : null}
      <div className="context-note"><ShieldCheck size={15} /><span>Assignment changes are governed by the existing admin-only workflow endpoint; this view does not invent client-side permissions.</span></div>
    </section>
  </div>;
}

function InvestigatorsPage({ snapshot }: { snapshot: BackendSnapshot }) {
  const [admitOpen, setAdmitOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); try { await createInvestigator({ name: String(form.get("name")), email: String(form.get("email")), password: String(form.get("password")), investigatorId: String(form.get("investigatorId")), contactNumber: String(form.get("contactNumber")), designation: String(form.get("designation")), department: String(form.get("department")), specialization: String(form.get("specialization") || "") }); toast("Investigator admitted by backend."); setAdmitOpen(false); window.location.reload(); } catch (error) { toast(error instanceof Error ? error.message : "Investigator admission failed."); } finally { setSaving(false); } };
  return <div className="page-stack"><PageHeader eyebrow="OPERATOR REGISTRY / ADMIN" title="Investigators" description="Investigator accounts and professional identity records returned by the backend." actions={<button className="primary-button" onClick={() => setAdmitOpen(true)}><UserPlus size={15} /> Admit investigator</button>} /><section className="panel"><SectionHeader label="INVESTIGATOR REGISTRY" meta={`${snapshot.investigators.length} RETURNED`} /><DataTable columns={["INVESTIGATOR", "PROFESSIONAL ID", "UNIT / DESIGNATION", "STATUS", "CONTROL"]}>{snapshot.investigators.map((investigator) => <tr key={investigator.id}><td><strong>{investigator.name}</strong><span className="cell-sub">{investigator.email}</span></td><td><span className="mono emphasis">{investigator.investigatorId || "Profile not configured"}</span></td><td><strong>{investigator.department || "—"}</strong><span className="cell-sub">{investigator.designation || "—"}</span></td><td><StatusPill status={investigator.status || "UNKNOWN"} /></td><td><select className="status-select" value={investigator.status || "ACTIVE"} onChange={async (event) => { try { await updateInvestigatorStatus(investigator.id, event.target.value as "ACTIVE" | "INACTIVE" | "ON_LEAVE"); toast("Investigator status updated."); window.location.reload(); } catch (error) { toast(error instanceof Error ? error.message : "Status update failed."); } }}><option value="ACTIVE">ACTIVE</option><option value="ON_LEAVE">ON LEAVE</option><option value="INACTIVE">INACTIVE</option></select></td></tr>)}</DataTable>{snapshot.investigators.length === 0 && <EmptyState icon={Users} title="No investigators returned" detail="Admit an investigator through the Admin control to create a real account and professional profile." />}</section>{admitOpen && <Modal title="Investigator admission" onClose={() => setAdmitOpen(false)}><form className="modal-form" onSubmit={submit}><div className="form-section-label">IDENTITY</div><label>FULL NAME<input name="name" required /></label><label>INVESTIGATOR ID<input name="investigatorId" placeholder="INV-0042" required /></label><label>OFFICIAL EMAIL<input name="email" type="email" required /></label><label>CONTACT NUMBER<input name="contactNumber" required /></label><div className="form-section-label">PROFESSIONAL INFORMATION</div><label>DESIGNATION<input name="designation" required /></label><label>DEPARTMENT / UNIT<input name="department" required /></label><label>SPECIALIZATION<input name="specialization" /></label><div className="form-section-label">INITIAL CREDENTIAL</div><label>TEMPORARY PASSWORD<input name="password" type="password" minLength={8} autoComplete="new-password" required /><span className="field-help">Hashed server-side; the role is fixed to INVESTIGATOR.</span></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAdmitOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Admitting…" : "Admit investigator"}</button></div></form></Modal>}</div>;
}

function AuthorizationsPage({ snapshot }: { snapshot: BackendSnapshot }) {
  const isAdmin = snapshot.user.role === "ADMIN";
  const decide = async (id: string, decision: "approve" | "deny") => {
    try {
      await decideAuthorization(id, decision);
      toast(`Authorization ${decision === "approve" ? "approved" : "denied"} by backend.`);
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : `Authorization ${decision} failed.`);
    }
  };
  return <div className="page-stack"><PageHeader eyebrow="AUTHORIZATION / LIVE REQUESTS" title="Authorization requests" description="Operation authorizations returned by the backend. Approval and denial remain server-enforced." /><section className="panel"><SectionHeader label="OPERATION REQUESTS" meta={`${snapshot.authorizations.length} RETURNED`} /><DataTable columns={["REQUEST", "INVESTIGATION", "OPERATION", "REQUESTED BY", "STATUS", "REQUESTED AT", ""]}>{snapshot.authorizations.map((item) => <tr key={item.id}><td><span className="mono emphasis">{item.id}</span></td><td className="mono">{investigationLabel(snapshot, item.investigationId)}</td><td>{item.operationType}</td><td className="mono">{item.requestedBy}</td><td><StatusPill status={item.status} /></td><td className="muted-cell">{formatDate(item.requestedAt)}</td><td>{isAdmin && item.status === "PENDING" ? <div className="inline-actions"><button className="row-action" aria-label="Approve authorization" onClick={() => void decide(item.id, "approve")}><Check size={14} /></button><button className="row-action" aria-label="Deny authorization" onClick={() => void decide(item.id, "deny")}><X size={14} /></button></div> : null}</td></tr>)}</DataTable>{snapshot.authorizations.length === 0 && <EmptyState icon={Shield} title="No authorization requests" detail="No requests were returned by the backend." />}</section></div>;
}

function GovernancePage({ page, snapshot }: { page: PageKey; snapshot: BackendSnapshot }) {
  if (page === "system") return <div className="page-stack"><PageHeader eyebrow="SYSTEM / HEALTH ENDPOINT" title="System status" description="Only health information exposed by the backend is shown." /><section className="panel"><DataTable columns={["SERVICE", "STATUS", "TIMESTAMP"]}><tr><td>{snapshot.health?.service || "forensic-x"}</td><td><StatusPill status={snapshot.health?.status === "ok" ? "OPERATIONAL" : "UNAVAILABLE"} /></td><td className="muted-cell">{formatDate(snapshot.health?.timestamp)}</td></tr></DataTable></section></div>;
  const labels: Record<string, string> = { custody: "Chain of custody", ledger: "Blockchain ledger", audit: "Audit log", agent: "Forensic agent", storage: "Storage" };
  if (page === "agent") return <div className="page-stack"><PageHeader eyebrow="FORENSIC AGENT / PRIVILEGED INFRASTRUCTURE" title="Forensic agent" description="Live physical-device access remains outside the browser and requires the configured privileged Agent." /><section className="panel"><UnavailableState feature="Privileged Forensic Agent" detail="Agent unavailable. No live physical devices or physical acquisition completion is fabricated." /></section></div>;
  if (page === "storage") return <div className="page-stack"><PageHeader eyebrow="STORAGE / INVESTIGATION CONTEXT" title="Storage" description="Binary evidence remains in MinIO; PostgreSQL stores only metadata and references." /><section className="panel"><SectionHeader label="STORAGE REFERENCES" meta={`${snapshot.evidence.length} MASTER OBJECTS`} /><DataTable columns={["OBJECT", "BUCKET", "SHA-256", "POLICY", "STATUS"]}>{snapshot.evidence.map((row) => <tr key={row.storageObject.id}><td className="mono">{row.storageObject.objectKey}</td><td>{row.storageObject.bucket}</td><td className="mono muted-cell">{row.storageObject.sha256}</td><td><StatusPill status={row.storageObject.deletionPolicy} /></td><td><StatusPill status={row.storageObject.status} /></td></tr>)}</DataTable>{snapshot.evidence.length === 0 && <EmptyState icon={HardDrive} title="No storage objects returned" detail="Storage references appear only after persisted evidence exists for the active investigation." />}</section></div>;
  return <div className="page-stack"><PageHeader eyebrow="FORENSIC GOVERNANCE" title={labels[page] || "Governance"} description="Chronological records returned from PostgreSQL. Fabric status is shown only when persisted by the ledger adapter." /><section className="panel"><SectionHeader label={page === "audit" ? "AUDIT EVENTS" : "CHAIN OF CUSTODY"} meta={`${snapshot.auditEvents.length} EVENTS`} /><DataTable columns={["EVENT", "ACTOR", "RESULT", "DETAILS", "TIMESTAMP"]}>{snapshot.auditEvents.map((row) => <tr key={row.auditEvent.id}><td><strong>{row.auditEvent.eventType}</strong></td><td>{row.actor ? `${row.actor.name} · ${row.actor.role}` : "Actor unavailable"}</td><td><StatusPill status={row.auditEvent.result} /></td><td className="muted-cell">{row.auditEvent.details || "—"}</td><td className="muted-cell">{formatDate(row.auditEvent.createdAt)}</td></tr>)}</DataTable>{snapshot.auditEvents.length === 0 && <EmptyState icon={Fingerprint} title="No operational events returned" detail="The timeline will show persisted acquisition, recovery, validation, analysis and sanitization events for the active investigation." />}</section>{page === "ledger" && <section className="panel"><UnavailableState feature="Fabric validation/sanitization anchors" detail="Fabric anchor unavailable for these lifecycles. PostgreSQL operational events remain authoritative here." /></section>}</div>;
}

function InvestigatorDashboard({ snapshot, onNavigate }: { snapshot: BackendSnapshot; onNavigate: (page: PageKey) => void }) {
  if (snapshot.loading || snapshot.error) return <div className="page-stack"><PageHeader eyebrow="ASSIGNED WORKSPACE" title="Investigator console" description="Live authorization and workflow state." /><ConsoleState snapshot={snapshot} /></div>;
  return <div className="page-stack dashboard-page"><PageHeader eyebrow="ASSIGNED WORKSPACE / LIVE BACKEND" title="Investigator console" description="Your session is authenticated; stage actions remain enforced by the backend." actions={<StatusPill status="AUTHENTICATED" />} /><div className="stat-grid"><StatCard label="CASES RETURNED" value={String(snapshot.investigations.length)} sub="Backend investigation list" icon={BriefcaseBusiness} tone="cyan" /><StatCard label="WORKING COPIES" value={String(snapshot.workingCopies.length)} sub="Visible through endpoint" icon={Boxes} tone="violet" /><StatCard label="RECOVERY JOBS" value={String(snapshot.recoveryJobs.length)} sub="Visible through endpoint" icon={RefreshCw} tone="amber" /><StatCard label="CERTIFICATES" value={String(snapshot.certificates.length)} sub="Validation state returned" icon={FileCheck2} tone="green" /></div><section className="panel"><SectionHeader label="INVESTIGATION REGISTER" meta="BACKEND RESPONSE" action={<button className="panel-action" onClick={() => onNavigate("investigations")}>OPEN REGISTER <ArrowUpRight size={13} /></button>} /><DataTable columns={["CASE", "TITLE", "STATUS", "CREATED"]}>{snapshot.investigations.map((item) => <tr key={item.id}><td className="mono emphasis">{item.investigationNumber}</td><td><strong>{item.title}</strong></td><td><StatusPill status={item.status} /></td><td className="muted-cell">{formatDate(item.createdAt)}</td></tr>)}</DataTable>{snapshot.investigations.length === 0 && <EmptyState icon={BriefcaseBusiness} title="No cases returned" detail="The backend returned no investigations for this authenticated session." />}</section></div>;
}

function TaskWorkspace({ page, snapshot }: { page: PageKey; snapshot: BackendSnapshot }) {
  const labels: Record<string, [string, LucideIcon]> = { acquisition: ["Acquisition", ArrowDownToLine], recovery: ["Recovery", RefreshCw], validation: ["Validation", FileCheck2], analysis: ["Analysis", Binary], sanitization: ["Sanitization", Archive] };
  const [title, Icon] = labels[page] || ["Authorized workspace", ShieldCheck];
  const [actionState, setActionState] = useState<"idle" | "running" | "success" | "error">("idle");
  const investigationId = snapshot.investigations[0]?.id;
  const validatedCertificate = snapshot.certificates.find((certificate) => certificate.status === "VALIDATED");
  const runAnalysis = async () => {
    if (!investigationId || !validatedCertificate) return;
    setActionState("running");
    try { await createAnalysisJob(investigationId, validatedCertificate.id); setActionState("success"); toast("Analysis job persisted in WAITING_FOR_WORKER state."); }
    catch (error) { setActionState("error"); toast(error instanceof Error ? error.message : "Analysis job creation failed."); }
  };
  const accept = async (certificateId: string) => {
    if (!investigationId) return;
    try { await validateCertificate(investigationId, certificateId); toast("Validation decision persisted."); window.location.reload(); }
    catch (error) { toast(error instanceof Error ? error.message : "Certificate validation failed."); }
  };
  const reject = async (certificateId: string) => {
    if (!investigationId) return;
    const reason = window.prompt("Reason for rejection (required):", "");
    if (!reason || !reason.trim()) { toast("A rejection reason is required."); return; }
    try { await rejectCertificate(investigationId, certificateId, reason); toast("Rejection decision persisted."); window.location.reload(); }
    catch (error) { toast(error instanceof Error ? error.message : "Certificate rejection failed."); }
  };
  const content = page === "analysis"
    ? <div className="workspace-actions"><button className="primary-button" disabled={!investigationId || !validatedCertificate || actionState === "running"} onClick={() => void runAnalysis()}><ArrowDownToLine size={15} /> {actionState === "running" ? "Queueing…" : validatedCertificate ? "Queue analysis job" : "Validation required"}</button><DataTable columns={["JOB", "STATUS", "WORKING COPY", "INPUT SHA-256", "CREATED"]}>{snapshot.analysisJobs.map((job) => <tr key={job.id}><td className="mono">{job.id}</td><td><StatusPill status={job.status} /></td><td className="mono">{job.workingCopyId}</td><td className="mono muted-cell">{job.inputSha256 || "—"}</td><td className="muted-cell">{formatDate(job.createdAt)}</td></tr>)}</DataTable>{snapshot.analysisJobs.length === 0 && <UnavailableState feature="Analysis worker" detail="No analysis job exists for this investigation. Jobs remain truthful WAITING_FOR_WORKER until external worker infrastructure is available." />}</div>
    : page === "validation"
      ? <DataTable columns={["CERTIFICATE", "ARTIFACT SHA-256", "STATUS", "CREATED", "DECISION"]}>{snapshot.certificates.map((certificate) => <tr key={certificate.id}><td className="mono">{certificate.id}</td><td className="mono muted-cell">{certificate.artifactSha256 || "—"}</td><td><StatusPill status={certificate.status} /></td><td className="muted-cell">{formatDate(certificate.createdAt)}</td><td>{certificate.status === "READY_FOR_VALIDATION" ? <div className="inline-actions"><button className="row-action" onClick={() => void accept(certificate.id)} aria-label="Accept certificate"><Check size={14} /></button><button className="row-action" onClick={() => void reject(certificate.id)} aria-label="Reject certificate"><X size={14} /></button></div> : <span className="muted-cell">{certificate.validationSignature ? "Signed" : "Pending"}</span>}</td></tr>)}</DataTable>
      : page === "recovery"
        ? <><DataTable columns={["ARTIFACT", "JOB", "METHOD / ENGINE", "SIZE", "SHA-256", "STORAGE", "STATUS"]}>{snapshot.artifacts.map((row) => <tr key={row.artifact.id}><td className="mono">{row.artifact.id}</td><td className="mono">{row.artifact.recoveryJobId}</td><td>{row.artifact.method} / {row.artifact.engine}</td><td>{row.artifact.size ?? "—"}</td><td className="mono muted-cell">{row.artifact.provisionalSha256 || "—"}</td><td>{row.storageObject?.status === "AVAILABLE" ? <a className="text-link" href={investigationId ? recoveredArtifactDownloadUrl(investigationId, row.artifact.id) : "#"}>Download</a> : "Metadata-only"}</td><td><StatusPill status={row.artifact.status} /></td></tr>)}</DataTable>{snapshot.artifacts.length === 0 && <EmptyState icon={Icon} title={`${snapshot.recoveryJobs.length} recovery job(s) returned`} detail="No persisted recovered candidates are available. Results are never fabricated in the console." />}</>
        : page === "acquisition"
          ? <DataTable columns={["JOB", "SOURCE", "STATUS", "SHA-256", "SIZE", "CREATED"]}>{snapshot.acquisitions.map((job) => <tr key={job.id}><td className="mono">{job.id}</td><td>{job.sourceType} · {job.sourceIdentifier}</td><td><StatusPill status={job.status} /></td><td className="mono muted-cell">{job.sha256 || "—"}</td><td>{job.size ?? "—"}</td><td className="muted-cell">{formatDate(job.createdAt)}</td></tr>)}</DataTable>
          : page === "sanitization"
            ? <DataTable columns={["JOB", "TARGET", "METHOD", "STATUS", "VERIFICATION", "CREATED"]}>{snapshot.sanitizationJobs.map((job) => <tr key={job.id}><td className="mono">{job.id}</td><td>{job.targetType} · {job.targetReference}</td><td>{job.sanitizationMethod}</td><td><StatusPill status={job.status} /></td><td className="mono">{job.verificationHash || job.verificationStatus || "—"}</td><td className="muted-cell">{formatDate(job.createdAt)}</td></tr>)}</DataTable>
            : <EmptyState icon={Icon} title="No operation records" detail="No backend records are available for this stage." />;
  return <div className="page-stack"><PageHeader eyebrow="AUTHORIZED WORKFLOW" title={title} description="Live operation records only; no client-side execution is simulated." actions={<StatusPill status={snapshot.user.role === "ADMIN" ? "ADMIN SESSION" : "ASSIGNED ACCESS"} />} /><section className="panel workspace-main"><div className="workspace-banner"><div className="workspace-stage-icon"><Icon size={22} /></div><div><span>BACKEND RECORDS</span><strong>{title.toUpperCase()}</strong><small>{snapshot.investigations[0] ? snapshot.investigations[0].investigationNumber : "No investigation selected"}</small></div></div>{content}</section></div>;
}

function AppConsole({ role, onLogout }: { role: Exclude<Role, "gateway">; onLogout: () => void }) {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [snapshot, setSnapshot] = useState<BackendSnapshot>({ user: { id: "", email: "", name: "", role: role === "administrator" ? "ADMIN" : "INVESTIGATOR" }, health: null, investigations: [], investigators: [], authorizations: [], devices: [], workflow: null, acquisitions: [], workingCopies: [], recoveryJobs: [], certificates: [], sanitizationJobs: [], evidence: [], artifacts: [], auditEvents: [], analysisJobs: [], unavailable: [], loading: true, error: null });
  const isAdmin = role === "administrator";

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const userResult = await getCurrentUser();
        const investigationsResult = await listInvestigations();
        const activeInvestigationId = selectActiveInvestigation(investigationsResult.investigations)?.id;
        const unavailable: string[] = [];
        const optional = async <T,>(label: string, task: () => Promise<T>, emptyValue: T) => {
          try { return await task(); } catch (error) {
            const status = (error as Error & { status?: number }).status;
            if (status === 403) { unavailable.push(`${label} (access denied)`); return emptyValue; }
            if (status === 404) { unavailable.push(`${label} (not exposed or not found)`); return emptyValue; }
            if (status === 409) { unavailable.push(`${label} (workflow/state conflict)`); return emptyValue; }
            if (label === "health") { unavailable.push("health (backend error)"); return emptyValue; }
            throw error;
          }
        };
        const [healthResult, investigatorsResult, authorizationsResult, devicesResult, workflowResult, acquisitionsResult, workingCopiesResult, recoveryJobsResult, certificatesResult, sanitizationJobsResult, evidenceResult, artifactsResult, auditEventsResult, analysisJobsResult] = await Promise.all([
          optional("health", getHealth, null),
          isAdmin ? optional("investigators", listInvestigators, { investigators: [] }) : Promise.resolve({ investigators: [] }),
          isAdmin ? optional("authorizations", () => listAuthorizations(), { authorizations: [] }) : Promise.resolve({ authorizations: [] }),
          activeInvestigationId ? optional("devices", () => listDevices(activeInvestigationId), { devices: [] }) : Promise.resolve({ devices: [] }),
          activeInvestigationId ? optional<{ workflow: Workflow | null }>("workflow", () => getWorkflow(activeInvestigationId), { workflow: null }) : Promise.resolve({ workflow: null }),
          activeInvestigationId ? optional("acquisitions", () => listAcquisitions(activeInvestigationId), { acquisitions: [] }) : Promise.resolve({ acquisitions: [] }),
          activeInvestigationId ? optional("working copies", () => listWorkingCopies(activeInvestigationId), { workingCopies: [] }) : Promise.resolve({ workingCopies: [] }),
          activeInvestigationId ? optional("recovery jobs", () => listRecoveryJobs(activeInvestigationId), { recoveryJobs: [] }) : Promise.resolve({ recoveryJobs: [] }),
          activeInvestigationId ? optional("recovery certificates", () => listRecoveryCertificates(activeInvestigationId), { certificates: [] }) : Promise.resolve({ certificates: [] }),
          activeInvestigationId ? optional("sanitization", () => listSanitizationJobs(activeInvestigationId), { sanitizationJobs: [] }) : Promise.resolve({ sanitizationJobs: [] }),
          activeInvestigationId ? optional("evidence", () => listEvidence(activeInvestigationId), { evidence: [] }) : Promise.resolve({ evidence: [] }),
          activeInvestigationId ? optional("recovered artifacts", () => listRecoveredArtifacts(activeInvestigationId), { artifacts: [] }) : Promise.resolve({ artifacts: [] }),
          activeInvestigationId ? optional("audit events", () => listAuditEvents(activeInvestigationId), { auditEvents: [] }) : Promise.resolve({ auditEvents: [] }),
          activeInvestigationId ? optional("analysis jobs", () => listAnalysisJobs(activeInvestigationId), { analysisJobs: [] }) : Promise.resolve({ analysisJobs: [] }),
        ]);
        if (!active) return;
        setSnapshot({ user: userResult.user, health: healthResult, investigations: investigationsResult.investigations, investigators: investigatorsResult.investigators, authorizations: authorizationsResult.authorizations, devices: devicesResult.devices, workflow: workflowResult.workflow, acquisitions: acquisitionsResult.acquisitions, workingCopies: workingCopiesResult.workingCopies, recoveryJobs: recoveryJobsResult.recoveryJobs, certificates: certificatesResult.certificates, sanitizationJobs: sanitizationJobsResult.sanitizationJobs, evidence: evidenceResult.evidence, artifacts: artifactsResult.artifacts, auditEvents: auditEventsResult.auditEvents, analysisJobs: analysisJobsResult.analysisJobs, unavailable, loading: false, error: null });
      } catch (error) {
        if (active) setSnapshot((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Unable to load the authenticated backend session." }));
      }
    }
    void load();
    return () => { active = false; };
  }, [isAdmin]);

  const navigate = (nextPage: PageKey) => {
    if (!isAdmin && ["investigators", "permissions", "audit", "ledger", "system", "assignment", "devices"].includes(nextPage)) {
      toast("This feature is not authorized for the current investigator session.");
      return;
    }
    setPage(nextPage);
  };
  const renderPage = () => {
    if (page === "dashboard") return isAdmin ? <AdminDashboard onNavigate={navigate} snapshot={snapshot} /> : <InvestigatorDashboard onNavigate={navigate} snapshot={snapshot} />;
    if (page === "investigations") return <InvestigationsPage snapshot={snapshot} canCreate={isAdmin} />;
    if (page === "evidence") return <EvidencePage snapshot={snapshot} />;
    if (page === "devices") return <DevicesPage snapshot={snapshot} />;
    if (page === "assignment") return isAdmin ? <AssignmentPage snapshot={snapshot} /> : <InvestigatorDashboard onNavigate={navigate} snapshot={snapshot} />;
    if (page === "investigators") return <InvestigatorsPage snapshot={snapshot} />;
    if (page === "permissions") return <GovernancePage page={page} snapshot={snapshot} />;
    if (page === "authorizations") return <AuthorizationsPage snapshot={snapshot} />;
    if (["custody", "audit", "ledger", "system", "agent", "storage"].includes(page)) return <GovernancePage page={page} snapshot={snapshot} />;
    return <TaskWorkspace page={page} snapshot={snapshot} />;
  };
  return <div className="console-shell"><Sidebar role={role} user={snapshot.user} active={page} onNavigate={navigate} onLogout={onLogout} /><div className="console-main"><Topbar role={role} user={snapshot.user} onNavigate={navigate} /><main className="console-content">{renderPage()}</main><footer className="console-footer"><span>FORENSIC-X // RESTRICTED OPERATIONS ENVIRONMENT</span><span>SESSION {snapshot.user.name || snapshot.user.email || "AUTHENTICATING"} · BACKEND SESSION · API {snapshot.health?.status || "LOADING"}</span></footer></div></div>;
}

export default function Home() {
  const [role, setRole] = useState<Role>("gateway");
  const [authenticated, setAuthenticated] = useState(false);
  if (role === "gateway") return <Gateway onSelect={(nextRole) => setRole(nextRole)} />;
  if (!authenticated) return <Login role={role} onBack={() => setRole("gateway")} onLogin={async (email, password) => {
    try {
      const result = await apiLogin(email, password);
      const apiRole = result.user.role === "ADMIN" ? "administrator" : "investigator";
      setRole(apiRole);
      setAuthenticated(true);
      toast(`Authenticated as ${result.user.name || result.user.email}.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Authentication failed.");
    }
  }} />;
  return <AppConsole role={role} onLogout={() => { clearAccessToken(); setAuthenticated(false); setRole("gateway"); toast("Session ended. Access gateway restored."); }} />;
}
