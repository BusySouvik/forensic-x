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
  type Authorization,
  type Device,
  type Investigation,
  type Workflow,
  type AcquisitionJob,
  type WorkingCopy,
  type RecoveryJob,
  type RecoveryCertificate,
  type SanitizationJob,
  getHealth,
  getCurrentUser,
  login as apiLogin,
  clearAccessToken,
  decideAuthorization,
  listAcquisitions,
  listAuthorizations,
  listDevices,
  listInvestigations,
  listInvestigators,
  getWorkflow,
  listWorkingCopies,
  listRecoveryJobs,
  listRecoveryCertificates,
  listSanitizationJobs,
  saveWorkflow,
  startAnalysis as apiStartAnalysis,
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
  investigators: Array<{ id: string; name: string }>;
  authorizations: Authorization[];
  devices: Device[];
  workflow: Workflow | null;
  acquisitions: AcquisitionJob[];
  workingCopies: WorkingCopy[];
  recoveryJobs: RecoveryJob[];
  certificates: RecoveryCertificate[];
  sanitizationJobs: SanitizationJob[];
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

function AdminDashboard({ onNavigate, snapshot }: { onNavigate: (page: PageKey) => void; snapshot: BackendSnapshot }) {
  if (snapshot.loading || snapshot.error) return <div className="page-stack"><PageHeader eyebrow="SYSTEM OVERVIEW" title="Control center" description="Live state from the FORENSIC-X backend." /><ConsoleState snapshot={snapshot} /></div>;
  const pending = snapshot.authorizations.filter((item) => item.status === "PENDING").length;
  return <div className="page-stack dashboard-page">
    <PageHeader eyebrow="SYSTEM OVERVIEW / LIVE BACKEND" title="Control center" description="Operational state across investigations, access, devices and controlled workflow." actions={<><button className="secondary-button" onClick={() => window.location.reload()}><RefreshCw size={15} /> Refresh</button><button className="primary-button" onClick={() => onNavigate("authorizations")}><ListChecks size={15} /> Review requests <span className="button-count">{pending}</span></button></>} />
    <div className="stat-grid"><StatCard label="INVESTIGATIONS" value={String(snapshot.investigations.length).padStart(2, "0")} sub="Returned by backend" icon={BriefcaseBusiness} tone="cyan" /><StatCard label="MASTER EVIDENCE" value="—" sub="No list endpoint exposed" icon={Boxes} tone="violet" /><StatCard label="INVESTIGATORS" value={String(snapshot.investigators.length).padStart(2, "0")} sub="Backend user registry" icon={Users} tone="green" /><StatCard label="PENDING APPROVALS" value={String(pending).padStart(2, "0")} sub="Authorization requests" icon={CircleAlert} tone="amber" /></div>
    <div className="dashboard-grid-primary"><section className="panel service-panel"><SectionHeader label="SYSTEM SERVICES" meta={snapshot.health?.status === "ok" ? "API ONLINE" : "UNAVAILABLE"} action={<button className="panel-action" onClick={() => onNavigate("system")}>VIEW STATUS <ArrowUpRight size={13} /></button>} /><div className="service-list"><div className="service-row"><div className="service-icon"><Server size={16} /></div><div className="service-name"><strong>FORENSIC-X API</strong><span>{snapshot.health?.service || "health endpoint unavailable"}</span></div><div className="service-status"><StatusDot tone={snapshot.health?.status === "ok" ? "green" : "red"} pulse /><span>{snapshot.health?.status === "ok" ? "OPERATIONAL" : "UNAVAILABLE"}</span></div></div><div className="service-row"><div className="service-icon"><Database size={16} /></div><div className="service-name"><strong>Evidence registry</strong><span>Listing endpoint is not exposed</span></div><div className="service-status"><StatusDot tone="amber" /><span>UNAVAILABLE</span></div></div></div></section><section className="panel workflow-panel"><SectionHeader label="WORKFLOW STATE" meta="LIVE RECORDS" /><div className="throughput-total"><span>{snapshot.acquisitions.length + snapshot.recoveryJobs.length}</span><span>tracked operation jobs</span><StatusPill status="BACKEND" /></div><div className="workflow-summary"><div><span>WORKING COPIES</span><strong>{snapshot.workingCopies.length}</strong></div><div><span>RECOVERY CERTIFICATES</span><strong>{snapshot.certificates.length}</strong></div><div><span>SANITIZATION JOBS</span><strong>{snapshot.sanitizationJobs.length}</strong></div></div></section></div>
    <section className="panel"><SectionHeader label="ACTIVE INVESTIGATIONS" meta="BACKEND REGISTER" action={<button className="panel-action" onClick={() => onNavigate("investigations")}>VIEW ALL <ArrowUpRight size={13} /></button>} /><DataTable columns={["CASE ID", "TITLE", "STATUS", "CREATED", "CREATED BY"]}>{snapshot.investigations.map((item) => <tr key={item.id}><td><span className="mono emphasis">{item.investigationNumber}</span></td><td><strong>{item.title}</strong><span className="cell-sub">{item.id}</span></td><td><StatusPill status={item.status} /></td><td className="muted-cell">{formatDate(item.createdAt)}</td><td><span className="mono">{item.createdBy}</span></td></tr>)}</DataTable>{snapshot.investigations.length === 0 && <EmptyState icon={BriefcaseBusiness} title="No investigations returned" detail="Create an investigation through the backend before using this workspace." />}</section>
  </div>;
}

function InvestigationsPage({ snapshot }: { snapshot: BackendSnapshot }) {
  const [query, setQuery] = useState("");
  const rows = snapshot.investigations.filter((item) => `${item.investigationNumber} ${item.title} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-stack"><PageHeader eyebrow="CASE MANAGEMENT / LIVE REGISTER" title="Investigations" description="Investigation records returned by the existing backend." /><section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={15} /><input placeholder="Search case number, title or status" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div><DataTable columns={["CASE ID", "TITLE", "DESCRIPTION", "STATUS", "CREATED", "UPDATED"]}>{rows.map((item) => <tr key={item.id}><td><span className="mono emphasis">{item.investigationNumber}</span><span className="cell-sub">{item.id}</span></td><td><strong>{item.title}</strong></td><td className="muted-cell">{item.description || "—"}</td><td><StatusPill status={item.status} /></td><td className="muted-cell">{formatDate(item.createdAt)}</td><td className="muted-cell">{formatDate(item.updatedAt)}</td></tr>)}</DataTable>{rows.length === 0 && <EmptyState icon={BriefcaseBusiness} title="No matching investigations" detail="The backend returned no records for this filter." />}<div className="table-footer"><span>Showing {rows.length} of {snapshot.investigations.length} investigations</span></div></section></div>;
}

function EvidencePage() {
  return <div className="page-stack"><PageHeader eyebrow="EVIDENCE REGISTER" title="Master E01 evidence" description="Evidence integrity is only shown when returned by a backend endpoint." /><section className="panel"><UnavailableState feature="Master evidence register" detail="The existing API exposes acquisition output references and storage metadata by ID, but no endpoint lists evidence records or returns a master E01 register. No hashes, sizes or statuses are fabricated here." /></section></div>;
}

function DevicesPage({ snapshot }: { snapshot: BackendSnapshot }) {
  return <div className="page-stack"><PageHeader eyebrow="DEVICE INVENTORY / LIVE REGISTER" title="Devices" description="Acquisition targets returned by the existing device endpoint." /><section className="panel"><SectionHeader label="DEVICE INVENTORY" meta={`${snapshot.devices.length} RETURNED`} /><DataTable columns={["DEVICE IDENTIFIER", "TYPE", "MANUFACTURER", "MODEL", "SERIAL", "CAPACITY", "STATUS"]}>{snapshot.devices.map((device) => <tr key={device.id}><td><span className="mono emphasis">{device.deviceIdentifier}</span><span className="cell-sub">{device.id}</span></td><td>{device.deviceType}</td><td className="muted-cell">{device.manufacturer || "—"}</td><td className="muted-cell">{device.model || "—"}</td><td className="mono muted-cell">{device.serialNumber || "—"}</td><td className="muted-cell">{device.capacity || "—"}</td><td><StatusPill status={device.status} /></td></tr>)}</DataTable>{snapshot.devices.length === 0 && <EmptyState icon={Laptop} title="No devices returned" detail="Select an investigation with registered devices or create one through the backend." />}</section></div>;
}

function AssignmentPage({ snapshot }: { snapshot: BackendSnapshot }) {
  const selectedCase = selectActiveInvestigation(snapshot.investigations);
  const workflow = snapshot.workflow;
  const [assignments, setAssignments] = useState({ acquisitionInvestigatorId: workflow?.acquisitionInvestigatorId || "", recoveryInvestigatorId: workflow?.recoveryInvestigatorId || "", validationInvestigatorId: workflow?.validationInvestigatorId || "", analysisInvestigatorId: workflow?.analysisInvestigatorId || "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAssignments({ acquisitionInvestigatorId: workflow?.acquisitionInvestigatorId || "", recoveryInvestigatorId: workflow?.recoveryInvestigatorId || "", validationInvestigatorId: workflow?.validationInvestigatorId || "", analysisInvestigatorId: workflow?.analysisInvestigatorId || "" });
  }, [workflow]);
  const rows = workflow ? [["ACQUISITION", workflow.acquisitionInvestigatorId], ["RECOVERY", workflow.recoveryInvestigatorId], ["VALIDATION", workflow.validationInvestigatorId], ["ANALYSIS", workflow.analysisInvestigatorId]] : [];
  const updateAssignment = (stage: keyof typeof assignments, value: string) => setAssignments((current) => ({ ...current, [stage]: value }));
  const configure = async () => {
    if (!selectedCase || Object.values(assignments).some((value) => !value)) return;
    setSaving(true);
    try {
      await saveWorkflow(selectedCase.id, assignments);
      toast("Workflow configuration saved by backend.");
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Workflow configuration failed.");
    } finally {
      setSaving(false);
    }
  };
  const workflowContent = workflow
    ? <DataTable columns={["STAGE", "ASSIGNED INVESTIGATOR", "VERSION", "UPDATED"]}>{rows.map(([stage, investigator]) => <tr key={stage}><td><span className="stage-chip">{stage}</span></td><td className="mono">{investigator}</td><td>{workflow.version}</td><td className="muted-cell">{formatDate(workflow.updatedAt)}</td></tr>)}</DataTable>
    : <UnavailableState feature="Workflow assignment" detail={selectedCase ? "No workflow record was returned for the selected investigation." : "The backend returned no investigations to select."} />;
  return <div className="page-stack">
    <PageHeader eyebrow="WORKFLOW CONTROL / LIVE ASSIGNMENT" title="Task assignment" description="The backend exposes one workflow record per investigation with four assigned stages." actions={selectedCase ? <div className="assignment-case-select"><span>CASE</span><strong>{selectedCase.investigationNumber}</strong></div> : undefined} />
    <section className="panel">
      <SectionHeader label="CONTROLLED WORKFLOW" meta={selectedCase ? selectedCase.id : "NO CASE SELECTED"} />
      {workflowContent}
      {selectedCase && snapshot.investigators.length > 0 && <div className="workflow-config-form"><div className="mini-heading">CONFIGURE ASSIGNMENTS</div>{([['acquisitionInvestigatorId', 'ACQUISITION'], ['recoveryInvestigatorId', 'RECOVERY'], ['validationInvestigatorId', 'VALIDATION'], ['analysisInvestigatorId', 'ANALYSIS']] as const).map(([stage, label]) => <label key={stage}>{label}<select value={assignments[stage]} onChange={(event) => updateAssignment(stage, event.target.value)}><option value="">Select investigator</option>{snapshot.investigators.map((investigator) => <option key={investigator.id} value={investigator.id}>{investigator.name} ({investigator.id})</option>)}</select></label>)}<button className="primary-button" disabled={saving || Object.values(assignments).some((value) => !value)} onClick={() => void configure()}>{saving ? "Saving…" : "Save workflow configuration"}</button></div>}
      <div className="context-note"><ShieldCheck size={15} /><span>Assignment changes are governed by the existing admin-only workflow endpoint; this view does not invent client-side permissions.</span></div>
    </section>
  </div>;
}

function InvestigatorsPage({ snapshot }: { snapshot: BackendSnapshot }) {
  return <div className="page-stack"><PageHeader eyebrow="OPERATOR REGISTRY / ADMIN" title="Investigators" description="Investigator accounts returned by the existing administrator endpoint." /><section className="panel"><SectionHeader label="INVESTIGATOR REGISTRY" meta={`${snapshot.investigators.length} RETURNED`} /><DataTable columns={["USER ID", "NAME", "ROLE SOURCE"]}>{snapshot.investigators.map((investigator) => <tr key={investigator.id}><td><span className="mono emphasis">{investigator.id}</span></td><td><strong>{investigator.name}</strong></td><td className="muted-cell">GET /admin/users</td></tr>)}</DataTable>{snapshot.investigators.length === 0 && <EmptyState icon={Users} title="No investigators returned" detail="The administrator endpoint returned an empty registry." />}</section><section className="panel"><UnavailableState feature="Investigator profiles and clearance" detail="The repository contains investigator profile schema and creation validation, but no admin GET endpoint returns profile, clearance, session or task details." /></section></div>;
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
  const labels: Record<string, string> = { custody: "Chain of custody", ledger: "Blockchain ledger", audit: "Audit log", agent: "Forensic agent" };
  return <div className="page-stack"><PageHeader eyebrow="FORENSIC GOVERNANCE" title={labels[page] || "Governance"} description="This screen is intentionally explicit about backend coverage." /><section className="panel"><UnavailableState feature={labels[page] || "Governance feature"} detail="This feature is not exposed by the current backend. No custody events, audit rows, ledger blocks or blockchain verification are fabricated." /></section></div>;
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
  const runAnalysis = async () => {
    if (!investigationId) return;
    setActionState("running");
    try { await apiStartAnalysis(investigationId); setActionState("success"); toast("Analysis start accepted by backend."); }
    catch (error) { setActionState("error"); toast(error instanceof Error ? error.message : "Analysis start failed."); }
  };
  const content = page === "analysis"
    ? <div className="workspace-actions"><button className="primary-button" disabled={!investigationId || actionState === "running"} onClick={runAnalysis}><ArrowDownToLine size={15} /> {actionState === "running" ? "Starting…" : "Start authorized analysis"}</button><UnavailableState feature="Analysis results" detail="The backend exposes the start action but no analysis-result listing endpoint." /></div>
    : page === "validation"
      ? <UnavailableState feature="Validation queue" detail="The backend exposes certificate validation actions but no validation queue listing endpoint." />
      : page === "acquisition"
        ? <EmptyState icon={Icon} title={`${snapshot.acquisitions.length} acquisition job(s) returned`} detail="Use the backend request schema with an approved acquisition authorization; no acquisition is started from fabricated UI state." />
        : page === "recovery"
          ? <EmptyState icon={Icon} title={`${snapshot.recoveryJobs.length} recovery job(s) returned`} detail="Recovery results are explicitly pending validation until the backend returns authoritative artifacts." />
          : page === "sanitization"
            ? <EmptyState icon={Icon} title={`${snapshot.sanitizationJobs.length} sanitization job(s) returned`} detail="The sanitization router is not mounted in the API index, so execution is unavailable from this frontend." />
            : <EmptyState icon={Icon} title="No operation records" detail="No backend records are available for this stage." />;
  return <div className="page-stack"><PageHeader eyebrow="AUTHORIZED WORKFLOW" title={title} description="Live operation records only; no client-side execution is simulated." actions={<StatusPill status={snapshot.user.role === "ADMIN" ? "ADMIN SESSION" : "ASSIGNED ACCESS"} />} /><section className="panel workspace-main"><div className="workspace-banner"><div className="workspace-stage-icon"><Icon size={22} /></div><div><span>BACKEND RECORDS</span><strong>{title.toUpperCase()}</strong><small>{snapshot.investigations[0] ? snapshot.investigations[0].investigationNumber : "No investigation selected"}</small></div></div>{content}</section></div>;
}

function AppConsole({ role, onLogout }: { role: Exclude<Role, "gateway">; onLogout: () => void }) {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [snapshot, setSnapshot] = useState<BackendSnapshot>({ user: { id: "", email: "", name: "", role: role === "administrator" ? "ADMIN" : "INVESTIGATOR" }, health: null, investigations: [], investigators: [], authorizations: [], devices: [], workflow: null, acquisitions: [], workingCopies: [], recoveryJobs: [], certificates: [], sanitizationJobs: [], unavailable: [], loading: true, error: null });
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
        const [healthResult, investigatorsResult, authorizationsResult, devicesResult, workflowResult, acquisitionsResult, workingCopiesResult, recoveryJobsResult, certificatesResult, sanitizationJobsResult] = await Promise.all([
          optional("health", getHealth, null),
          isAdmin ? optional("investigators", listInvestigators, { users: [] }) : Promise.resolve({ users: [] }),
          isAdmin ? optional("authorizations", () => listAuthorizations(), { authorizations: [] }) : Promise.resolve({ authorizations: [] }),
          activeInvestigationId ? optional("devices", () => listDevices(activeInvestigationId), { devices: [] }) : Promise.resolve({ devices: [] }),
          activeInvestigationId ? optional<{ workflow: Workflow | null }>("workflow", () => getWorkflow(activeInvestigationId), { workflow: null }) : Promise.resolve({ workflow: null }),
          activeInvestigationId ? optional("acquisitions", () => listAcquisitions(activeInvestigationId), { acquisitions: [] }) : Promise.resolve({ acquisitions: [] }),
          activeInvestigationId ? optional("working copies", () => listWorkingCopies(activeInvestigationId), { workingCopies: [] }) : Promise.resolve({ workingCopies: [] }),
          activeInvestigationId ? optional("recovery jobs", () => listRecoveryJobs(activeInvestigationId), { recoveryJobs: [] }) : Promise.resolve({ recoveryJobs: [] }),
          activeInvestigationId ? optional("recovery certificates", () => listRecoveryCertificates(activeInvestigationId), { certificates: [] }) : Promise.resolve({ certificates: [] }),
          activeInvestigationId ? optional("sanitization", () => listSanitizationJobs(activeInvestigationId), { sanitizationJobs: [] }) : Promise.resolve({ sanitizationJobs: [] }),
        ]);
        if (!active) return;
        setSnapshot({ user: userResult.user, health: healthResult, investigations: investigationsResult.investigations, investigators: investigatorsResult.users, authorizations: authorizationsResult.authorizations, devices: devicesResult.devices, workflow: workflowResult.workflow, acquisitions: acquisitionsResult.acquisitions, workingCopies: workingCopiesResult.workingCopies, recoveryJobs: recoveryJobsResult.recoveryJobs, certificates: certificatesResult.certificates, sanitizationJobs: sanitizationJobsResult.sanitizationJobs, unavailable, loading: false, error: null });
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
    if (page === "investigations") return <InvestigationsPage snapshot={snapshot} />;
    if (page === "evidence") return <EvidencePage />;
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
