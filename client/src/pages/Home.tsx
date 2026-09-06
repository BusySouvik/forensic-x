import { useMemo, useState } from "react";
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
import { login as apiLogin } from "@/lib/api";

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

type Status = "ACTIVE" | "PENDING" | "COMPLETED" | "LOCKED" | "OFFLINE" | "QUEUED";

const adminSections: { title: string; items: NavItem[] }[] = [
  {
    title: "OVERVIEW",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "investigations", label: "Investigations", icon: BriefcaseBusiness, badge: "08" },
      { key: "evidence", label: "Evidence", icon: Boxes, badge: "24" },
      { key: "devices", label: "Devices", icon: Laptop },
    ],
  },
  {
    title: "WORKFLOW CONTROL",
    items: [
      { key: "acquisition", label: "Acquisition", icon: ArrowDownToLine },
      { key: "recovery", label: "Recovery", icon: RefreshCw, badge: "04" },
      { key: "validation", label: "Validation", icon: FileCheck2, badge: "03" },
      { key: "analysis", label: "Analysis", icon: Binary },
      { key: "sanitization", label: "Sanitization", icon: Archive },
    ],
  },
  {
    title: "ACCESS CONTROL",
    items: [
      { key: "investigators", label: "Investigators", icon: Users },
      { key: "assignment", label: "Task Assignment", icon: ListChecks, badge: "03" },
      { key: "authorizations", label: "Authorizations", icon: KeyRound, badge: "03" },
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
  { key: "investigations", label: "My Investigations", icon: BriefcaseBusiness, badge: "03" },
  { key: "assignment", label: "My Tasks", icon: ListChecks, badge: "02" },
  { key: "evidence", label: "Evidence", icon: Boxes },
  { key: "recovery", label: "Recovery", icon: RefreshCw },
  { key: "validation", label: "Validation", icon: FileCheck2 },
  { key: "analysis", label: "Analysis", icon: Binary },
  { key: "custody", label: "Chain of Custody", icon: Fingerprint },
];

const serviceRows = [
  { label: "FORENSIC AGENT", detail: "agent-01 / 4 workers", icon: Zap, status: "ONLINE", tone: "green" },
  { label: "EVIDENCE STORAGE", detail: "vault-eu-01 / 78% capacity", icon: HardDrive, status: "ONLINE", tone: "green" },
  { label: "DATABASE", detail: "cluster-primary / 42ms", icon: Database, status: "ONLINE", tone: "green" },
  { label: "BLOCKCHAIN LEDGER", detail: "ledger node / block 001942", icon: Network, status: "CONNECTED", tone: "cyan" },
];

const investigators = [
  { id: "INV-001", name: "Investigator 01", initials: "I1", status: "ACTIVE", tasks: "03", last: "Active 2m ago", clearance: "TIER 04" },
  { id: "INV-002", name: "Investigator 02", initials: "I2", status: "ACTIVE", tasks: "02", last: "Active 8m ago", clearance: "TIER 03" },
  { id: "INV-003", name: "Investigator 03", initials: "I3", status: "OFFLINE", tasks: "00", last: "Offline 4h ago", clearance: "TIER 02" },
  { id: "INV-004", name: "Investigator 04", initials: "I4", status: "ACTIVE", tasks: "01", last: "Active 12m ago", clearance: "TIER 03" },
  { id: "INV-005", name: "Investigator 05", initials: "I5", status: "ACTIVE", tasks: "04", last: "Active 19m ago", clearance: "TIER 04" },
];

const investigationRows = [
  { id: "FX-2026-001", subject: "Northbridge intrusion", status: "ACTIVE", stage: "RECOVERY", owner: "INV-001", updated: "08 SEP 2026 · 14:32" },
  { id: "FX-2026-002", subject: "Orion device cluster", status: "ACTIVE", stage: "VALIDATION", owner: "INV-002", updated: "08 SEP 2026 · 13:18" },
  { id: "FX-2026-003", subject: "Meridian exfiltration", status: "COMPLETED", stage: "ANALYSIS", owner: "INV-004", updated: "07 SEP 2026 · 17:46" },
  { id: "FX-2026-004", subject: "Cedar endpoint review", status: "PENDING", stage: "AUTHORIZATION", owner: "—", updated: "07 SEP 2026 · 16:05" },
  { id: "FX-2026-005", subject: "Atlas cloud account", status: "ACTIVE", stage: "ACQUISITION", owner: "INV-005", updated: "07 SEP 2026 · 11:22" },
];

const evidenceRows = [
  { id: "EV-0348", file: "disk-image-07.E01", case: "FX-2026-001", kind: "FORENSIC IMAGE", hash: "sha256: 7f2a…c981", status: "SEALED", size: "488 GB" },
  { id: "EV-0347", file: "memory-capture-02.raw", case: "FX-2026-002", kind: "MEMORY DUMP", hash: "sha256: 4ae1…b720", status: "VALIDATED", size: "32 GB" },
  { id: "EV-0346", file: "mobile-export-11.tar", case: "FX-2026-004", kind: "DEVICE EXPORT", hash: "sha256: 23b0…d143", status: "PENDING", size: "12.8 GB" },
  { id: "EV-0345", file: "email-container-03.pst", case: "FX-2026-003", kind: "MAIL ARCHIVE", hash: "sha256: 61ce…0a52", status: "SEALED", size: "4.2 GB" },
];

const auditRows = [
  { time: "14:32:09", actor: "ADMIN-004", action: "Workflow assignment updated", target: "FX-2026-001 / RECOVERY", result: "SUCCESS", hash: "0x91af…c21d" },
  { time: "14:21:44", actor: "INV-002", action: "Validation report submitted", target: "EV-0347", result: "SUCCESS", hash: "0x5b73…a0ef" },
  { time: "13:59:02", actor: "SYSTEM", action: "Ledger checkpoint committed", target: "BLOCK 001942", result: "CONFIRMED", hash: "0xa19c…8bd3" },
  { time: "13:18:17", actor: "ADMIN-004", action: "Investigator session revoked", target: "INV-003", result: "SUCCESS", hash: "0xc11d…7e29" },
  { time: "12:48:33", actor: "INV-001", action: "Evidence object accessed", target: "EV-0348", result: "LOGGED", hash: "0x0cf4…d144" },
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
          <label>{isAdmin ? "USERNAME / OPERATOR ID" : "INVESTIGATOR ID"}<div className="field-wrap"><UserCheck size={15} /><input name="email" type="email" defaultValue={isAdmin ? "admin@forensic-x.local" : "investigator@forensic-x.local"} /></div></label>
          <label>PASSWORD<div className="field-wrap"><KeyRound size={15} /><input name="password" type="password" defaultValue="forensic-x" /></div></label>
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

function Sidebar({ role, active, onNavigate, onLogout }: { role: Exclude<Role, "gateway">; active: PageKey; onNavigate: (page: PageKey) => void; onLogout: () => void }) {
  const isAdmin = role === "administrator";
  const [collapsed, setCollapsed] = useState(false);
  const groups = isAdmin ? adminSections : [{ title: "AUTHORIZED WORKSPACE", items: investigatorItems.slice(0, 4) }, { title: "AUTHORIZED WORKFLOW", items: investigatorItems.slice(4, 7) }, { title: "FORENSIC GOVERNANCE", items: investigatorItems.slice(7) }];
  return (
    <aside className={cn("sidebar", collapsed && "sidebar-collapsed")}>
      <div className="sidebar-brand"><Wordmark compact={!collapsed} /><button className="icon-button subtle" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"><PanelLeftClose size={16} /></button></div>
      <div className="sidebar-session"><div className="session-badge"><StatusDot tone="green" pulse /> <span>{isAdmin ? "ADMIN SESSION" : "INV-002 SESSION"}</span></div><div className="session-role">{isAdmin ? "FULL SYSTEM ACCESS" : "RESTRICTED WORKSPACE"}</div></div>
      <nav className="sidebar-nav">
        {groups.map((group) => <div className="nav-group" key={group.title}><div className="nav-group-title">{group.title}</div>{group.items.map((item) => <button key={item.key} className={cn("nav-item", active === item.key && "nav-item-active")} onClick={() => onNavigate(item.key)} title={collapsed ? item.label : undefined}><item.icon size={16} /><span className="nav-label">{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}</button>)}</div>)}
      </nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => toast("Forensic agent console is healthy.")}><Settings2 size={16} /><span className="nav-label">Preferences</span></button><button className="nav-item logout-item" onClick={onLogout}><LogOut size={16} /><span className="nav-label">Logout</span></button></div>
    </aside>
  );
}

function Topbar({ role, onNavigate }: { role: Exclude<Role, "gateway">; onNavigate: (page: PageKey) => void }) {
  const isAdmin = role === "administrator";
  return <header className="app-topbar"><div className="topbar-title"><span className="topbar-path">FORENSIC-X <ChevronRight size={13} /> {isAdmin ? "ADMIN CONTROL CENTER" : "INVESTIGATOR CONSOLE"}</span><span className="topbar-context">/ {isAdmin ? "OPERATIONS OVERVIEW" : "ASSIGNED WORKSPACE"}</span></div><div className="topbar-actions"><div className="topbar-live"><StatusDot tone="green" pulse /> SYSTEM STATUS <span>SECURE</span></div><button className="icon-button" onClick={() => toast("No new system notifications.")} aria-label="Notifications"><Bell size={17} /><span className="notification-dot" /></button><div className="operator-chip" onClick={() => onNavigate(isAdmin ? "system" : "dashboard")}><div className="operator-avatar">{isAdmin ? "A4" : "I2"}</div><div><div className="operator-name">{isAdmin ? "ADMIN-004" : "INV-002"}</div><div className="operator-role">{isAdmin ? "SYSTEM ADMINISTRATOR" : "INVESTIGATOR"}</div></div><ChevronDown size={14} /></div></div></header>;
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

function AdminDashboard({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  return <div className="page-stack dashboard-page">
    <PageHeader eyebrow="SYSTEM OVERVIEW / 08 SEP 2026" title="Control center" description="Operational state across investigations, evidence, workflow and access." actions={<><button className="secondary-button" onClick={() => toast("Dashboard data refreshed from mock state.")}><RefreshCw size={15} /> Refresh</button><button className="primary-button" onClick={() => onNavigate("assignment")}><ListChecks size={15} /> Review assignments <span className="button-count">03</span></button></>} />
    <div className="stat-grid"><StatCard label="ACTIVE CASES" value="08" sub="02 require attention" icon={BriefcaseBusiness} tone="cyan" delta="+2 this week" /><StatCard label="EVIDENCE OBJECTS" value="24" sub="03 pending validation" icon={Boxes} tone="violet" delta="+06 today" /><StatCard label="ACTIVE INVESTIGATORS" value="06" sub="01 session restricted" icon={Users} tone="green" /><StatCard label="PENDING APPROVALS" value="03" sub="Oldest: 2h 14m" icon={CircleAlert} tone="amber" /></div>
    <div className="dashboard-grid-primary"><section className="panel service-panel"><SectionHeader label="SYSTEM SERVICES" meta="4 / 4 operational" action={<button className="panel-action" onClick={() => onNavigate("system")}>VIEW STATUS <ArrowUpRight size={13} /></button>} /><div className="service-list">{serviceRows.map((row) => <div className="service-row" key={row.label}><div className="service-icon"><row.icon size={16} /></div><div className="service-name"><strong>{row.label}</strong><span>{row.detail}</span></div><div className="service-status"><StatusDot tone={row.tone} pulse /><span>{row.status}</span></div></div>)}</div></section><section className="panel workflow-panel"><SectionHeader label="WORKFLOW THROUGHPUT" meta="LAST 24 HOURS" /><div className="throughput-total"><span>128</span><span>objects processed</span><StatusPill status="+18%" /></div><div className="bar-chart">{[38, 52, 45, 68, 82, 66, 76, 91, 74, 87, 64, 78].map((height, i) => <div className="bar-col" key={i}><div className={cn("bar", i > 8 && "bar-highlight")} style={{ height: `${height}%` }} /></div>)}</div><div className="chart-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>NOW</span></div></section></div>
    <section className="panel"><SectionHeader label="ACTIVE INVESTIGATIONS" meta="5 MOST RECENT" action={<button className="panel-action" onClick={() => onNavigate("investigations")}>VIEW ALL <ArrowUpRight size={13} /></button>} /><DataTable columns={["CASE ID", "SUBJECT", "STATUS", "CURRENT STAGE", "OWNER", "UPDATED"]}>{investigationRows.map((row) => <tr key={row.id} onClick={() => onNavigate("investigations")}><td><span className="mono emphasis">{row.id}</span></td><td>{row.subject}</td><td><StatusPill status={row.status} /></td><td><span className="stage-chip">{row.stage}</span></td><td><span className="mono">{row.owner}</span></td><td className="muted-cell">{row.updated}</td></tr>)}</DataTable></section>
    <div className="dashboard-grid-secondary"><section className="panel"><SectionHeader label="RECENT ACTIVITY" meta="LIVE FEED" action={<button className="panel-action" onClick={() => onNavigate("audit")}>AUDIT LOG <ArrowUpRight size={13} /></button>} /><ActivityFeed compact /></section><section className="panel attention-panel"><SectionHeader label="REQUIRES ATTENTION" meta="03 ITEMS" /><div className="attention-list"><button className="attention-item" onClick={() => onNavigate("authorizations")}><div className="attention-icon amber-icon"><Clock3 size={16} /></div><div><strong>Evidence validation queue</strong><span>EV-0346 awaits investigator authorization</span></div><ChevronRight size={15} /></button><button className="attention-item" onClick={() => onNavigate("assignment")}><div className="attention-icon violet-icon"><Users size={16} /></div><div><strong>Unassigned workflow stage</strong><span>FX-2026-004 / SANITIZATION</span></div><ChevronRight size={15} /></button><button className="attention-item" onClick={() => onNavigate("investigators")}><div className="attention-icon red-icon"><CircleAlert size={16} /></div><div><strong>Investigator session restricted</strong><span>INV-003 · clearance review required</span></div><ChevronRight size={15} /></button></div></section></div>
  </div>;
}

function ActivityFeed({ compact = false }: { compact?: boolean }) {
  const items = [
    { time: "14:32:09", actor: "ADMIN-004", action: "Updated workflow assignment", target: "FX-2026-001", tone: "cyan" },
    { time: "14:21:44", actor: "INV-002", action: "Submitted validation report", target: "EV-0347", tone: "green" },
    { time: "13:59:02", actor: "SYSTEM", action: "Committed ledger checkpoint", target: "BLOCK 001942", tone: "violet" },
    { time: "13:18:17", actor: "ADMIN-004", action: "Revoked investigator session", target: "INV-003", tone: "amber" },
  ];
  return <div className={cn("activity-feed", !compact && "activity-feed-full")}>{items.map((item) => <div className="activity-item" key={item.time}><span className={cn("activity-marker", `marker-${item.tone}`)} /><div className="activity-time">{item.time}</div><div className="activity-copy"><strong>{item.action}</strong><span><b>{item.actor}</b> · {item.target}</span></div><span className="activity-check"><Check size={13} /></span></div>)}</div>;
}

function DataTable({ columns, children }: { columns: string[]; children: React.ReactNode }) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function InvestigationsPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => investigationRows.filter((row) => `${row.id} ${row.subject} ${row.stage}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <div className="page-stack"><PageHeader eyebrow="OVERVIEW / CASE MANAGEMENT" title="Investigations" description="All active, completed and pending forensic investigations under system control." actions={<><button className="secondary-button" onClick={() => toast("Export queued for the current investigation list.")}><ArrowDownToLine size={15} /> Export register</button><button className="primary-button" onClick={() => toast("New case intake opened in mock mode.")}><BriefcaseBusiness size={15} /> Open case intake</button></>} /><section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={15} /><input placeholder="Search case ID, subject or stage" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="toolbar-filters"><button className="filter-button">ALL STATUS <ChevronDown size={14} /></button><button className="filter-button">CURRENT STAGE <ChevronDown size={14} /></button></div></div><DataTable columns={["CASE ID", "SUBJECT", "STATUS", "CURRENT STAGE", "OWNER", "UPDATED", ""]}>{rows.map((row) => <tr key={row.id}><td><span className="mono emphasis">{row.id}</span></td><td><strong>{row.subject}</strong></td><td><StatusPill status={row.status} /></td><td><span className="stage-chip">{row.stage}</span></td><td><span className="mono">{row.owner}</span></td><td className="muted-cell">{row.updated}</td><td><button className="row-action" onClick={() => onNavigate("assignment")}><ArrowUpRight size={14} /></button></td></tr>)}</DataTable><div className="table-footer"><span>Showing {rows.length} of 08 investigations</span><div className="pagination"><button className="page-number active">1</button><button className="page-number">2</button><button className="page-number">→</button></div></div></section></div>;
}

function EvidencePage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  return <div className="page-stack"><PageHeader eyebrow="OVERVIEW / EVIDENCE REGISTER" title="Evidence objects" description="Sealed evidence, forensic images and device exports with integrity state." actions={<><button className="secondary-button" onClick={() => onNavigate("custody")}><Fingerprint size={15} /> Chain of custody</button><button className="primary-button" onClick={() => toast("Evidence intake workspace opened in mock mode.")}><ArrowUpRight size={15} /> Register object</button></>} /><div className="stat-grid compact-stats"><StatCard label="SEALED OBJECTS" value="18" sub="Integrity verified" icon={LockKeyhole} tone="green" /><StatCard label="VALIDATION QUEUE" value="03" sub="Awaiting review" icon={FileCheck2} tone="amber" /><StatCard label="TOTAL STORAGE" value="1.8 TB" sub="78% of assigned vault" icon={HardDrive} tone="violet" /></div><section className="panel"><SectionHeader label="EVIDENCE REGISTER" meta="24 OBJECTS" action={<button className="panel-action" onClick={() => toast("Evidence register refreshed.")}><RefreshCw size={13} /> REFRESH</button>} /><DataTable columns={["OBJECT ID", "FILE / OBJECT", "CASE", "TYPE", "INTEGRITY HASH", "STATUS", "SIZE"]}>{evidenceRows.map((row) => <tr key={row.id}><td><span className="mono emphasis">{row.id}</span></td><td><div className="file-cell"><FileArchive size={15} /><strong>{row.file}</strong></div></td><td><span className="mono">{row.case}</span></td><td className="muted-cell">{row.kind}</td><td><span className="hash-cell">{row.hash}</span></td><td><StatusPill status={row.status} /></td><td className="muted-cell">{row.size}</td></tr>)}</DataTable></section></div>;
}

function DevicesPage() {
  const devices = [
    { id: "DEV-0814", host: "NB-WS-1142", type: "WINDOWS WORKSTATION", case: "FX-2026-001", state: "IMAGED", last: "08 SEP · 12:08" },
    { id: "DEV-0813", host: "ORION-MB-02", type: "MACBOOK PRO 16", case: "FX-2026-002", state: "ACQUISITION", last: "08 SEP · 10:44" },
    { id: "DEV-0812", host: "CEDAR-PHONE-1", type: "IOS DEVICE", case: "FX-2026-004", state: "QUEUED", last: "07 SEP · 16:05" },
    { id: "DEV-0811", host: "ATLAS-VM-03", type: "CLOUD INSTANCE", case: "FX-2026-005", state: "IMAGED", last: "07 SEP · 11:22" },
  ];
  return <div className="page-stack"><PageHeader eyebrow="OVERVIEW / DEVICE INVENTORY" title="Devices" description="Acquisition targets and forensic device inventory for all authorized cases." actions={<button className="primary-button" onClick={() => toast("Device intake form opened in mock mode.")}><Laptop size={15} /> Register device</button>} /><section className="panel"><SectionHeader label="DEVICE INVENTORY" meta="14 REGISTERED" /><DataTable columns={["DEVICE ID", "HOST / ALIAS", "DEVICE TYPE", "CASE", "STATE", "LAST ACTIVITY"]}>{devices.map((device) => <tr key={device.id}><td><span className="mono emphasis">{device.id}</span></td><td><div><strong>{device.host}</strong><span className="cell-sub">endpoint asset</span></div></td><td className="muted-cell">{device.type}</td><td><span className="mono">{device.case}</span></td><td><StatusPill status={device.state} /></td><td className="muted-cell">{device.last}</td></tr>)}</DataTable></section><section className="panel"><SectionHeader label="DEVICE ACQUISITION HEALTH" meta="LIVE" /><div className="device-health-grid"><div className="health-card"><div className="health-card-icon green-icon"><ShieldCheck size={19} /></div><div><strong>Chain-ready devices</strong><span>11 devices have verified provenance</span></div><b>11</b></div><div className="health-card"><div className="health-card-icon amber-icon"><Clock3 size={19} /></div><div><strong>Awaiting acquisition</strong><span>02 devices queued for capture</span></div><b>02</b></div><div className="health-card"><div className="health-card-icon violet-icon"><CircleAlert size={19} /></div><div><strong>Needs attention</strong><span>01 device has a capture exception</span></div><b>01</b></div></div></section></div>;
}

const workflowStages = [
  { name: "ACQUISITION", detail: "Source device capture", icon: ArrowDownToLine, status: "COMPLETED", assigned: "INV-001" },
  { name: "RECOVERY", detail: "Recover deleted artifacts", icon: RefreshCw, status: "IN PROGRESS", assigned: "INV-001" },
  { name: "VALIDATION", detail: "Verify evidence integrity", icon: FileCheck2, status: "ASSIGNED", assigned: "INV-002" },
  { name: "ANALYSIS", detail: "Correlate forensic findings", icon: Binary, status: "PENDING", assigned: "INV-002" },
  { name: "SANITIZATION", detail: "Close and sanitize workspace", icon: Archive, status: "LOCKED", assigned: "INV-003" },
];

function AssignmentPage() {
  const [selectedCase, setSelectedCase] = useState("FX-2026-001");
  const [assignments, setAssignments] = useState<Record<string, string>>({ ACQUISITION: "INV-001", RECOVERY: "INV-001", VALIDATION: "INV-002", ANALYSIS: "INV-002", SANITIZATION: "INV-003" });
  return <div className="page-stack"><PageHeader eyebrow="ACCESS CONTROL / WORKFLOW CONTROL" title="Task assignment" description="Assign authorized investigators to each controlled stage of a case workflow." actions={<div className="assignment-case-select"><span>CASE</span><select value={selectedCase} onChange={(e) => setSelectedCase(e.target.value)}><option>FX-2026-001</option><option>FX-2026-002</option><option>FX-2026-004</option></select><ChevronDown size={14} /></div>} /><div className="workflow-shell"><section className="panel workflow-matrix"><SectionHeader label="CONTROLLED WORKFLOW" meta="CASE / {selectedCase}" action={<div className="legend"><span><Check size={12} /> ASSIGNED</span><span><Circle size={10} /> IN PROGRESS</span><span><Clock3 size={12} /> PENDING</span><span><LockKeyhole size={11} /> LOCKED</span></div>} /><div className="workflow-rail">{workflowStages.map((stage, index) => <div className={cn("workflow-stage", stage.status === "IN PROGRESS" && "stage-current", stage.status === "LOCKED" && "stage-locked")} key={stage.name}><div className="stage-number">0{index + 1}</div><div className="stage-icon"><stage.icon size={17} /></div><div className="stage-info"><div className="stage-name-row"><strong>{stage.name}</strong><StatusPill status={stage.status === "IN PROGRESS" ? "ACTIVE" : stage.status === "ASSIGNED" ? "ASSIGNED" : stage.status} /></div><span>{stage.detail}</span></div><div className="stage-assignment"><label>ASSIGNED INVESTIGATOR</label><div className="select-wrap"><select disabled={stage.status === "LOCKED"} value={assignments[stage.name]} onChange={(e) => setAssignments({ ...assignments, [stage.name]: e.target.value })}><option value="INV-001">INV-001 · Investigator 01</option><option value="INV-002">INV-002 · Investigator 02</option><option value="INV-003">INV-003 · Investigator 03</option><option value="INV-004">INV-004 · Investigator 04</option><option value="INV-005">INV-005 · Investigator 05</option></select><ChevronDown size={14} /></div></div><div className="stage-lock">{stage.status === "LOCKED" ? <LockKeyhole size={15} /> : <ChevronRight size={16} />}</div></div>)}</div><div className="workflow-save"><div><span className="save-status"><StatusDot tone="green" /> WORKFLOW STATE VALID</span><span>Changes will be recorded in the audit log.</span></div><button className="primary-button" onClick={() => toast(`Workflow assignments for ${selectedCase} saved to mock state.`)}><Check size={15} /> Save workflow</button></div></section><aside className="panel case-context"><SectionHeader label="CASE CONTEXT" /><div className="case-id-block"><span>CASE ID</span><strong>{selectedCase}</strong><StatusPill status="ACTIVE" /></div><div className="case-context-row"><span>CASE SUBJECT</span><strong>Northbridge intrusion</strong></div><div className="case-context-row"><span>OPENED</span><strong>04 SEP 2026 · ADMIN-004</strong></div><div className="case-context-row"><span>EVIDENCE OBJECTS</span><strong>06 sealed / 01 pending</strong></div><div className="case-context-row"><span>CURRENT STAGE</span><strong className="cyan-text">RECOVERY</strong></div><div className="context-note"><ShieldCheck size={15} /><span>Investigator access is enforced per stage assignment. Locked stages cannot be self-activated.</span></div></aside></div></div>;
}

function InvestigatorsPage() {
  const [selected, setSelected] = useState("INV-002");
  return <div className="page-stack"><PageHeader eyebrow="ACCESS CONTROL / OPERATOR REGISTRY" title="Investigators" description="Manage investigator status, clearance and assigned work across the system." actions={<button className="primary-button" onClick={() => toast("New investigator onboarding is available in the connected backend.")}><UserCheck size={15} /> Add investigator</button>} /><section className="panel"><SectionHeader label="INVESTIGATOR REGISTRY" meta="05 REGISTERED" /><DataTable columns={["OPERATOR ID", "NAME", "STATUS", "ACTIVE TASKS", "CLEARANCE", "LAST ACTIVITY", ""]}>{investigators.map((investigator) => <tr className={cn(selected === investigator.id && "selected-row")} key={investigator.id} onClick={() => setSelected(investigator.id)}><td><span className="mono emphasis">{investigator.id}</span></td><td><div className="operator-table-cell"><div className="tiny-avatar">{investigator.initials}</div><strong>{investigator.name}</strong></div></td><td><StatusPill status={investigator.status} /></td><td><span className="task-count">{investigator.tasks}</span></td><td><span className="tier-chip">{investigator.clearance}</span></td><td className="muted-cell">{investigator.last}</td><td><button className="row-action"><ArrowUpRight size={14} /></button></td></tr>)}</DataTable></section><section className="panel investigator-detail"><SectionHeader label="OPERATOR PROFILE" meta={`${selected} / ACCESS CONFIGURATION`} action={<button className="secondary-button small" onClick={() => toast(`${selected} profile saved.`)}><Check size={14} /> Save changes</button>} /><div className="profile-grid"><div className="profile-identity"><div className="profile-avatar">{selected.replace("INV-", "I")}</div><div><h3>{investigators.find((item) => item.id === selected)?.name}</h3><span>{selected} · {selected === "INV-002" ? "INVESTIGATOR" : "FORENSIC OPERATOR"}</span><StatusPill status={investigators.find((item) => item.id === selected)?.status || "ACTIVE"} /></div></div><div className="profile-fields"><div><span>CLEARANCE TIER</span><strong>{investigators.find((item) => item.id === selected)?.clearance}</strong></div><div><span>ACTIVE SESSION</span><strong className="green-text">AUTHORIZED</strong></div><div><span>ACTIVE TASKS</span><strong>{investigators.find((item) => item.id === selected)?.tasks}</strong></div></div></div></section></div>;
}

function AccessControlPage() {
  const [investigator, setInvestigator] = useState("INV-002");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({ Investigations: true, Evidence: true, Devices: true, Acquisition: false, Recovery: true, Validation: true, Analysis: true, Sanitization: false, "Chain of Custody": true, "Audit Log": false, Blockchain: true });
  return <div className="page-stack"><PageHeader eyebrow="ACCESS CONTROL / AUTHORIZATION POLICY" title="Feature access control" description="Define the features each investigator can access beyond their stage assignments." actions={<div className="assignment-case-select"><span>INVESTIGATOR</span><select value={investigator} onChange={(e) => setInvestigator(e.target.value)}><option>INV-002</option><option>INV-001</option><option>INV-003</option><option>INV-004</option></select><ChevronDown size={14} /></div>} /><div className="access-control-grid"><section className="panel permission-panel"><SectionHeader label="FEATURE ACCESS" meta={`${investigator} / RESTRICTED`} /><div className="permission-note"><Shield size={16} /><span><strong>Administrator control enforced.</strong> Investigator access cannot exceed the policy below.</span></div><div className="permission-list">{Object.entries(permissions).map(([key, value]) => <div className="permission-row" key={key}><div className="permission-name"><div className={cn("permission-icon", value ? "permission-on" : "permission-off")}>{value ? <Check size={13} /> : <X size={13} />}</div><span>{key}</span></div><button className={cn("toggle", value && "toggle-on")} onClick={() => setPermissions({ ...permissions, [key]: !value })} aria-label={`Toggle ${key}`}><span /></button></div>)}</div><div className="panel-footer-action"><span><StatusDot tone="green" /> Policy draft ready</span><button className="primary-button" onClick={() => toast(`Access policy for ${investigator} saved.`)}><Check size={15} /> Save access policy</button></div></section><aside className="panel policy-preview"><SectionHeader label="POLICY SUMMARY" /><div className="policy-identity"><div className="tiny-avatar">{investigator.replace("INV-", "I")}</div><div><strong>{investigator} · Investigator 02</strong><span>Restricted operator policy</span></div></div><div className="access-meter"><div className="meter-label"><span>AUTHORIZED FEATURES</span><strong>{Object.values(permissions).filter(Boolean).length} / {Object.keys(permissions).length}</strong></div><div className="meter-track"><div style={{ width: `${Object.values(permissions).filter(Boolean).length / Object.keys(permissions).length * 100}%` }} /></div></div><div className="policy-callout"><LockKeyhole size={16} /><div><strong>Restricted by design</strong><span>Unavailable features will not appear in the investigator navigation.</span></div></div><div className="policy-admin"><span>ADMINISTRATOR</span><strong>FULL SYSTEM ACCESS</strong><StatusPill status="AUTHORIZED" /></div></aside></div></div>;
}

function GovernancePage({ page }: { page: PageKey }) {
  const isCustody = page === "custody";
  const isLedger = page === "ledger";
  const title = isCustody ? "Chain of custody" : isLedger ? "Blockchain ledger" : page === "audit" ? "Audit log" : page === "system" ? "System status" : page.charAt(0).toUpperCase() + page.slice(1);
  const eyebrow = isCustody ? "FORENSIC GOVERNANCE / EVIDENCE PROVENANCE" : isLedger ? "FORENSIC GOVERNANCE / IMMUTABLE RECORD" : page === "audit" ? "FORENSIC GOVERNANCE / ACTIVITY RECORD" : "SYSTEM / INFRASTRUCTURE MONITOR";
  if (isCustody) return <div className="page-stack"><PageHeader eyebrow={eyebrow} title={title} description="Every evidence interaction is recorded against an ordered, reviewable custody timeline." actions={<button className="secondary-button" onClick={() => toast("Custody report export queued.")}><ArrowDownToLine size={15} /> Export report</button>} /><div className="custody-layout"><section className="panel custody-timeline"><SectionHeader label="CUSTODY TIMELINE" meta="EV-0348 / DISK-IMAGE-07.E01" /><div className="timeline"><div className="timeline-item"><div className="timeline-dot green-dot" /><div className="timeline-time">08 SEP 2026<br /><b>12:08:41</b></div><div className="timeline-copy"><strong>Evidence object sealed</strong><span>Source image hash verified and vault write completed.</span><small>ADMIN-004 · VAULT-EU-01</small></div><StatusPill status="CONFIRMED" /></div><div className="timeline-item"><div className="timeline-dot cyan-dot" /><div className="timeline-time">08 SEP 2026<br /><b>12:06:19</b></div><div className="timeline-copy"><strong>Acquisition completed</strong><span>Write-blocked capture of DEV-0814 completed without exception.</span><small>INV-001 · ACQUISITION</small></div><StatusPill status="SUCCESS" /></div><div className="timeline-item"><div className="timeline-dot violet-dot" /><div className="timeline-time">08 SEP 2026<br /><b>10:42:03</b></div><div className="timeline-copy"><strong>Device checked into custody</strong><span>Source device identity and operator signature accepted.</span><small>INV-001 · DEV-0814</small></div><StatusPill status="LOGGED" /></div><div className="timeline-item"><div className="timeline-dot slate-dot" /><div className="timeline-time">08 SEP 2026<br /><b>10:35:10</b></div><div className="timeline-copy"><strong>Case object assigned</strong><span>Object linked to case FX-2026-001 and acquisition stage.</span><small>ADMIN-004 · WORKFLOW CONTROL</small></div><StatusPill status="CONFIRMED" /></div></div></section><aside className="panel custody-integrity"><SectionHeader label="INTEGRITY" /><div className="integrity-seal"><div className="seal-ring"><ShieldCheck size={29} /></div><strong>VERIFIED</strong><span>Chain is complete</span></div><div className="integrity-row"><span>OBJECT HASH</span><strong>sha256: 7f2a…c981</strong></div><div className="integrity-row"><span>LEDGER BLOCK</span><strong>001942</strong></div><div className="integrity-row"><span>LAST CHECK</span><strong>14:31:08 UTC</strong></div></aside></div></div>;
  if (isLedger) return <div className="page-stack"><PageHeader eyebrow={eyebrow} title={title} description="Immutable system checkpoints and evidence anchors across the active ledger node." actions={<button className="secondary-button" onClick={() => toast("Ledger synchronized with mock node.")}><RefreshCw size={15} /> Sync node</button>} /><div className="stat-grid compact-stats"><StatCard label="CURRENT BLOCK" value="001942" sub="Committed 14:31:08 UTC" icon={Network} tone="cyan" /><StatCard label="CHAIN HEALTH" value="100%" sub="No orphaned blocks" icon={ShieldCheck} tone="green" /><StatCard label="NODE PEERS" value="03" sub="All peers synchronized" icon={Server} tone="violet" /></div><section className="panel"><SectionHeader label="RECENT CHECKPOINTS" meta="LEDGER NODE / FX-PRIMARY" /><DataTable columns={["BLOCK", "TIMESTAMP", "EVENT", "ACTOR", "ROOT HASH", "STATUS"]}>{auditRows.slice(0, 4).map((row, index) => <tr key={row.hash}><td><span className="mono emphasis">00{1942 - index}</span></td><td className="muted-cell">08 SEP · {row.time}</td><td><strong>{row.action}</strong></td><td><span className="mono">{row.actor}</span></td><td><span className="hash-cell">{row.hash}</span></td><td><StatusPill status="CONFIRMED" /></td></tr>)}</DataTable></section></div>;
  if (page === "audit") return <div className="page-stack"><PageHeader eyebrow={eyebrow} title={title} description="System activity recorded with actor, target, action and integrity hash." actions={<button className="secondary-button" onClick={() => toast("Audit export queued.")}><ArrowDownToLine size={15} /> Export log</button>} /><section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={15} /><input placeholder="Filter actor, case or action" /></div><button className="filter-button">LAST 24 HOURS <ChevronDown size={14} /></button></div><DataTable columns={["TIME", "ACTOR", "ACTION", "TARGET", "RESULT", "INTEGRITY HASH"]}>{auditRows.map((row) => <tr key={row.hash}><td><span className="mono">{row.time}</span></td><td><span className="mono emphasis">{row.actor}</span></td><td><strong>{row.action}</strong></td><td className="muted-cell">{row.target}</td><td><StatusPill status={row.result} /></td><td><span className="hash-cell">{row.hash}</span></td></tr>)}</DataTable></section></div>;
  return <div className="page-stack"><PageHeader eyebrow={eyebrow} title={title} description="Live health status for the forensic operations environment." actions={<button className="secondary-button" onClick={() => toast("System health refreshed.")}><RefreshCw size={15} /> Refresh health</button>} /><div className="system-health-grid">{serviceRows.map((row) => <div className="panel health-panel" key={row.label}><div className="health-panel-top"><div className="service-icon"><row.icon size={17} /></div><StatusPill status={row.status} /></div><strong>{row.label}</strong><span>{row.detail}</span><div className="health-line"><div /></div><small>Last heartbeat · 18 sec ago</small></div>)}</div><section className="panel"><SectionHeader label="SYSTEM DIAGNOSTICS" meta="AGENT-01" /><div className="diagnostic-grid"><div><span>UPTIME</span><strong>18d 04h 32m</strong></div><div><span>ACTIVE JOBS</span><strong>07</strong></div><div><span>QUEUE DEPTH</span><strong>03</strong></div><div><span>LAST BACKUP</span><strong>08 SEP · 03:00</strong></div></div></section></div>;
}

function InvestigatorDashboard({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const tasks = [{ task: "Recovery", case: "FX-2026-001", subject: "Northbridge intrusion", status: "ASSIGNED", action: "OPEN" }, { task: "Validation", case: "FX-2026-004", subject: "Cedar endpoint review", status: "PENDING", action: "OPEN" }, { task: "Analysis", case: "FX-2026-006", subject: "Helix account review", status: "LOCKED", action: "VIEW" }];
  return <div className="page-stack dashboard-page"><PageHeader eyebrow="INVESTIGATOR CONSOLE / INV-002" title="My dashboard" description="Your assigned work, authorized workflow stages and current case context." actions={<div className="assigned-session"><StatusDot tone="green" pulse /> ACTIVE CASE <strong>FX-2026-001</strong></div>} /><div className="investigator-banner"><div className="banner-icon"><Fingerprint size={22} /></div><div><span>CURRENT ASSIGNMENT</span><strong>FX-2026-001 · RECOVERY</strong><small>Assigned by ADMIN-004 · Due 08 SEP 2026, 18:00 UTC</small></div><StatusPill status="IN PROGRESS" /><button className="primary-button" onClick={() => onNavigate("recovery")}>Open workspace <ArrowUpRight size={15} /></button></div><section className="panel"><SectionHeader label="MY ASSIGNED TASKS" meta="03 TASKS" /><DataTable columns={["TASK", "CASE", "SUBJECT", "STATUS", "ACTION"]}>{tasks.map((task) => <tr key={task.case}><td><div className="task-cell"><div className="task-icon"><Binary size={14} /></div><strong>{task.task}</strong></div></td><td><span className="mono emphasis">{task.case}</span></td><td className="muted-cell">{task.subject}</td><td><StatusPill status={task.status} /></td><td><button className="open-task" onClick={() => onNavigate(task.task.toLowerCase() as PageKey)}>{task.action} <ArrowUpRight size={13} /></button></td></tr>)}</DataTable></section><div className="investigator-grid"><section className="panel"><SectionHeader label="MY AUTHORIZED STAGES" meta="4 ENABLED" /><div className="authorized-list">{["Recovery", "Validation", "Analysis", "Chain of Custody"].map((item, index) => <button className="authorized-row" key={item} onClick={() => onNavigate(item.toLowerCase().replaceAll(" ", "") as PageKey)}><div className={cn("authorized-number", index === 0 && "current")}>0{index + 1}</div><div><strong>{item}</strong><span>{index === 0 ? "Current assignment" : "Authorized feature"}</span></div><StatusDot tone={index === 0 ? "green" : "cyan"} /><ChevronRight size={15} /></button>)}</div></section><section className="panel"><SectionHeader label="CASE CONTEXT" meta="FX-2026-001" /><div className="investigator-case"><div><span>CASE SUBJECT</span><strong>Northbridge intrusion</strong></div><div><span>OBJECTS IN SCOPE</span><strong>06 evidence objects</strong></div><div><span>WORKFLOW PROGRESS</span><div className="mini-progress"><div style={{ width: "44%" }} /></div><b>2 / 5 stages</b></div></div><div className="restricted-note"><LockKeyhole size={14} /><span>Acquisition and Sanitization are not authorized for your account.</span></div></section></div></div>;
}

function TaskWorkspace({ page }: { page: PageKey }) {
  const stageName = page.charAt(0).toUpperCase() + page.slice(1);
  const config: Record<string, { icon: LucideIcon; eyebrow: string; title: string; detail: string }> = { recovery: { icon: RefreshCw, eyebrow: "AUTHORIZED WORKFLOW / FX-2026-001", title: "Recovery workspace", detail: "Recover deleted or fragmented artifacts from the sealed forensic image." }, validation: { icon: FileCheck2, eyebrow: "AUTHORIZED WORKFLOW / FX-2026-004", title: "Validation workspace", detail: "Review integrity checks, acquisition metadata and evidence validation reports." }, analysis: { icon: Binary, eyebrow: "AUTHORIZED WORKFLOW / FX-2026-006", title: "Analysis workspace", detail: "Correlate authorized forensic artifacts and prepare an analyst report." }, acquisition: { icon: ArrowDownToLine, eyebrow: "WORKFLOW / ACQUISITION", title: "Acquisition control", detail: "Register and control source device acquisition across active cases." }, sanitization: { icon: Archive, eyebrow: "WORKFLOW / SANITIZATION", title: "Sanitization", detail: "Close authorized workspaces and sanitize the investigation environment." } };
  const data = config[page] || { icon: Terminal, eyebrow: "AUTHORIZED WORKFLOW", title: `${stageName} workspace`, detail: "Authorized forensic workflow workspace." };
  return <div className="page-stack"><PageHeader eyebrow={data.eyebrow} title={data.title} description={data.detail} actions={<StatusPill status={page === "recovery" ? "IN PROGRESS" : "AUTHORIZED"} />} /><div className="workspace-grid"><section className="panel workspace-main"><div className="workspace-banner"><div className="workspace-stage-icon"><data.icon size={22} /></div><div><span>ACTIVE STAGE</span><strong>{stageName.toUpperCase()} · FX-2026-001</strong><small>Assigned to INV-002 · Authorization verified</small></div><div className="workspace-secure"><ShieldCheck size={15} /> CONTROLLED</div></div><SectionHeader label="WORKSPACE QUEUE" meta="AUTHORIZED OBJECTS" /><EmptyState icon={data.icon} title="No pending artifacts" detail="The mock workspace has no unprocessed artifacts at this time." /><div className="workspace-actions"><button className="secondary-button" onClick={() => toast("Evidence manifest downloaded.")}><ArrowDownToLine size={15} /> Download manifest</button><button className="primary-button" onClick={() => toast("Workspace action queued in mock state.")}><Zap size={15} /> Run authorized action</button></div></section><aside className="panel workspace-side"><SectionHeader label="ACCESS CONTEXT" /><div className="access-context-row"><span>OPERATOR</span><strong>INV-002</strong></div><div className="access-context-row"><span>ASSIGNED BY</span><strong>ADMIN-004</strong></div><div className="access-context-row"><span>CASE</span><strong>FX-2026-001</strong></div><div className="access-context-row"><span>SESSION</span><strong className="green-text">AUTHORIZED</strong></div><div className="workspace-lock"><LockKeyhole size={16} /><span>All actions are logged to the audit trail and bound to this assignment.</span></div></aside></div></div>;
}

function AppConsole({ role, onLogout }: { role: Exclude<Role, "gateway">; onLogout: () => void }) {
  const [page, setPage] = useState<PageKey>("dashboard");
  const isAdmin = role === "administrator";
  const navigate = (nextPage: PageKey) => {
    if (!isAdmin && ["investigators", "authorizations", "permissions", "audit", "ledger", "system", "assignment", "devices", "acquisition", "sanitization"].includes(nextPage)) {
      toast("This feature is not authorized for the current investigator session.");
      return;
    }
    setPage(nextPage);
  };
  const renderPage = () => {
    if (page === "dashboard") return isAdmin ? <AdminDashboard onNavigate={navigate} /> : <InvestigatorDashboard onNavigate={navigate} />;
    if (page === "investigations") return <InvestigationsPage onNavigate={navigate} />;
    if (page === "evidence") return <EvidencePage onNavigate={navigate} />;
    if (page === "devices") return <DevicesPage />;
    if (page === "assignment") return isAdmin ? <AssignmentPage /> : <InvestigatorDashboard onNavigate={navigate} />;
    if (page === "investigators") return <InvestigatorsPage />;
    if (page === "permissions" || page === "authorizations") return <AccessControlPage />;
    if (["custody", "audit", "ledger", "system", "agent", "storage"].includes(page)) return <GovernancePage page={page} />;
    return <TaskWorkspace page={page} />;
  };
  return <div className="console-shell"><Sidebar role={role} active={page} onNavigate={navigate} onLogout={onLogout} /><div className="console-main"><Topbar role={role} onNavigate={navigate} /><main className="console-content">{renderPage()}</main><footer className="console-footer"><span>FORENSIC-X // RESTRICTED OPERATIONS ENVIRONMENT</span><span>SESSION {isAdmin ? "ADMIN-004" : "INV-002"} · AUDIT ACTIVE · 08 SEP 2026 14:34 UTC</span></footer></div></div>;
}

export default function Home() {
  const [role, setRole] = useState<Role>("gateway");
  const [authenticated, setAuthenticated] = useState(false);
  const [operatorName, setOperatorName] = useState("ADMIN-004");
  if (role === "gateway") return <Gateway onSelect={(nextRole) => setRole(nextRole)} />;
  if (!authenticated) return <Login role={role} onBack={() => setRole("gateway")} onLogin={async (email, password) => {
    try {
      const result = await apiLogin(email, password);
      const apiRole = result.user.role === "ADMIN" ? "administrator" : "investigator";
      setRole(apiRole);
      setOperatorName(result.user.name || result.user.email);
      setAuthenticated(true);
      toast(`Authenticated as ${result.user.name || result.user.email}.`);
    } catch {
      const fallbackRole = role;
      setOperatorName(fallbackRole === "administrator" ? "ADMIN-004" : "INV-002");
      setAuthenticated(true);
      toast("Backend unavailable — opened local demonstration state.");
    }
  }} />;
  return <AppConsole role={role} onLogout={() => { setAuthenticated(false); setRole("gateway"); setOperatorName("ADMIN-004"); toast(`Session ended for ${operatorName}. Access gateway restored.`); }} />;
}
