import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Google Fonts injection ─────────────────────────────────── */
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap";
document.head.appendChild(fontLink);

/* ─── Keyframe CSS injection ─────────────────────────────────── */
const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes printIn {
    from { opacity:0; transform:translateY(28px) scale(0.97); }
    to   { opacity:1; transform:translateY(0)    scale(1); }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }
  @keyframes spinArc {
    to { stroke-dashoffset: 0; }
  }
  @keyframes checkDraw {
    from { stroke-dashoffset: 40; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes pulseRing {
    0%   { transform:scale(1);   opacity:0.6; }
    100% { transform:scale(1.6); opacity:0; }
  }
  @keyframes fadeSlideUp {
    from { opacity:0; transform:translateY(14px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes stampIn {
    0%   { opacity:0; transform:scale(2) rotate(-12deg); }
    60%  { opacity:1; transform:scale(0.93) rotate(2deg); }
    100% { opacity:1; transform:scale(1) rotate(-3deg); }
  }
  @keyframes ripple {
    from { transform:scale(0); opacity:0.5; }
    to   { transform:scale(4); opacity:0; }
  }
  @keyframes tickerScroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  @keyframes borderFlow {
    0%,100% { background-position: 0% 50%; }
    50%     { background-position: 100% 50%; }
  }
  .receipt-card { animation: printIn 0.55s cubic-bezier(.22,.68,0,1.2) both; }
  .skeleton-shimmer {
    background: linear-gradient(90deg, #1E2D42 25%, #263548 50%, #1E2D42 75%);
    background-size: 400px 100%;
    animation: shimmer 1.4s ease-in-out infinite;
    border-radius: 6px;
  }
  .btn-ripple-wrapper { position:relative; overflow:hidden; }
  .ripple-el {
    position:absolute; border-radius:50%;
    width:60px; height:60px;
    background:rgba(255,255,255,0.25);
    animation: ripple 0.6s linear forwards;
    pointer-events:none;
    transform-origin: center;
  }
`;
document.head.appendChild(styleTag);

/* ─── Color tokens ───────────────────────────────────────────── */
const T = {
  navy:     "#0D1B2A",
  navyCard: "#111E2F",
  navyDeep: "#0A1520",
  navyMid:  "#162032",
  navyRim:  "#1E2D42",
  gold:     "#C9962A",
  gold2:    "#E8B84B",
  gold3:    "#F5D07A",
  goldDim:  "rgba(201,150,42,0.18)",
  cream:    "#F5F0E8",
  cream2:   "#EDE7D9",
  muted:    "#5A7490",
  muted2:   "#3D546A",
  success:  "#34D399",
  successBg:"rgba(52,211,153,0.09)",
  danger:   "#F87171",
  dangerBg: "rgba(248,113,113,0.09)",
  warn:     "#FBBF24",
  warnBg:   "rgba(251,191,36,0.09)",
  violet:   "#A78BFA",
  sky:      "#38BDF8",
};

/* ─── Transaction type config ────────────────────────────────── */
const TXN_TYPES = {
  transfer_out:  { label: "Transfer",   icon: "↗", color: T.cream,   bg: "rgba(245,240,232,0.07)" },
  transfer_in:   { label: "Transfer",   icon: "↙", color: T.success, bg: T.successBg },
  rtgs:          { label: "RTGS",       icon: "⚡", color: T.gold2,  bg: T.warnBg },
  loan_emi:      { label: "Loan EMI",   icon: "🏠", color: T.warn,   bg: T.warnBg },
  loan_disburse: { label: "Disbursement",icon:"💰", color: T.success, bg: T.successBg },
  cheque_cr:     { label: "Cheque",     icon: "📃", color: T.success, bg: T.successBg },
  cheque_dr:     { label: "Cheque",     icon: "📃", color: T.cream,   bg: "rgba(245,240,232,0.07)" },
  atm:           { label: "ATM",        icon: "🏧", color: T.cream,   bg: "rgba(245,240,232,0.07)" },
  pos:           { label: "POS",        icon: "💳", color: T.sky,     bg: "rgba(56,189,248,0.09)" },
  imps:          { label: "IMPS",       icon: "⚡", color: T.gold2,   bg: T.warnBg },
  cc_bill:       { label: "CC Bill",    icon: "🧾", color: T.cream,   bg: "rgba(245,240,232,0.07)" },
  forex:         { label: "Forex",      icon: "🌍", color: T.violet,  bg: "rgba(167,139,250,0.09)" },
};

/* ─── Receipt data ───────────────────────────────────────────── */
const RECEIPTS = [
  { id:"r01", type:"transfer_out", status:"PAYMENT SUCCESSFUL",   dir:"DR", amount:"₹8,500",     ref:"TXN-08212873",   time:"08 Mar 2026, 12:00 AM", from:"Ravi Verma",         to:"Anjali Desai",     auth:"OTP VERIFIED (Customer Session)",     extra:[{k:"Updated Balance",v:"₹1,11,01,950"}] },
  { id:"r02", type:"transfer_in",  status:"PAYMENT RECEIVED",     dir:"CR", amount:"₹8,500",     ref:"TXN-08212873",   time:"08 Mar 2026, 12:00 AM", from:"Ravi Verma",         to:"Anjali Desai",     auth:"SYSTEM CLEARED (Auto Credit)",        extra:[{k:"Updated Balance",v:"₹2,66,840"}] },
  { id:"r03", type:"rtgs",         status:"RTGS TRANSFER INITIATED",dir:"DR",amount:"₹15,00,000",ref:"SBIN42026030800124",time:"08 Mar 2026, 10:15 AM",from:"Karan Patel (MUM-003)",to:"Tata Motors Ltd", auth:"MANAGER APPROVED (Dual)",            extra:[{k:"Dest. Bank/IFSC",v:"HDFC0000123"},{k:"Updated Balance",v:"₹42,50,000"}] },
  { id:"r04", type:"loan_emi",     status:"LOAN EMI DEDUCTED",    dir:"DR", amount:"₹42,500",    ref:"EMI-08212899",   time:"08 Mar 2026, 06:00 AM", from:"Savings XXXX-0421", to:"Home Loan XXXX-8821",auth:"AUTO-DEBIT (NACH Mandate)",          extra:[{k:"Principal Remaining",v:"₹32,10,400"}] },
  { id:"r05", type:"loan_disburse",status:"LOAN DISBURSED",       dir:"CR", amount:"₹5,00,000",  ref:"DISB-08212905",  time:"08 Mar 2026, 02:30 PM", from:"Suraksha Bank (Treasury)",to:"Meera Sharma (Personal Loan)",auth:"MANAGER APPROVED (Branch)", extra:[{k:"Updated Balance",v:"₹5,12,050"}] },
  { id:"r06", type:"cheque_cr",    status:"CHEQUE CLEARED (CREDIT)",dir:"CR",amount:"₹24,000",   ref:"Cheque #004829", time:"08 Mar 2026, 04:00 PM", from:"ICICI Bank Ltd",    to:"Rahul Exports Pvt Ltd",auth:"CTS CLEARING (NPCI)",              extra:[{k:"Updated Balance",v:"₹8,45,200"}] },
  { id:"r07", type:"atm",          status:"ATM WITHDRAWAL",        dir:"DR", amount:"₹10,000",   ref:"ATM-08212950",   time:"08 Mar 2026, 09:14 AM", from:"SBNK ATM — MG Road",to:"XXXX-XXXX-XXXX-4192",auth:"ATM PIN VERIFIED",                 extra:[{k:"Updated Balance",v:"₹1,01,01,950"}] },
  { id:"r08", type:"pos",          status:"POS PAYMENT",           dir:"DR", amount:"₹4,250",    ref:"POS-08212988",   time:"08 Mar 2026, 01:45 PM", from:"Reliance Smart Superstore",to:"XXXX-XXXX-XXXX-4192",auth:"NFC TAP (No PIN Req)",      extra:[{k:"Updated Balance",v:"₹1,00,97,700"}] },
  { id:"r09", type:"imps",         status:"IMPS TRANSFER",         dir:"DR", amount:"₹25,000",   ref:"RRN: 606714298101",time:"08 Mar 2026, 11:20 AM",from:"Ravi Verma",        to:"Priya Sharma (Axis Bank)",auth:"BIOMETRIC VERIFIED (App)",       extra:[{k:"Updated Balance",v:"₹1,00,72,700"}] },
  { id:"r10", type:"cc_bill",      status:"CREDIT CARD BILL PAID", dir:"DR", amount:"₹82,400",   ref:"CCPAY-08213012", time:"08 Mar 2026, 05:00 PM", from:"Ravi Verma (Savings)",to:"Suraksha Signature XXXX-1099",auth:"AUTO-PAY MANDATE",       extra:[{k:"Card Outstanding",v:"₹0.00"}] },
  { id:"r11", type:"forex",        status:"FOREX REMITTANCE",      dir:"DR", amount:"₹1,67,000", ref:"FX-08213045",    time:"08 Mar 2026, 03:10 PM", from:"Ravi Verma (NRE)",  to:"Stanford University (USA)",auth:"SWIFT CLEARED (Branch)",          extra:[{k:"Exchange Rate",v:"1 USD = ₹83.50"},{k:"Remitted Amount",v:"$2,000.00 USD"}] },
  { id:"r12", type:"cheque_dr",    status:"CHEQUE CLEARED (DEBIT)",dir:"DR", amount:"₹45,000",   ref:"Cheque #882910", time:"08 Mar 2026, 10:30 AM", from:"Amit Singh (You)",  to:"Priya Enterprises",      auth:"SIGNATURE VERIFIED (CTS)",          extra:[{k:"Updated Balance",v:"₹5,12,400"}] },
  { id:"r13", type:"transfer_out", status:"NEFT TRANSFER",         dir:"DR", amount:"₹75,000",   ref:"NEFT-08213190",  time:"08 Mar 2026, 11:45 AM", from:"Vikram Joshi",      to:"Sneha Rao",              auth:"OTP VERIFIED (Customer Session)",    extra:[{k:"Updated Balance",v:"₹2,45,100"}] },
  { id:"r14", type:"transfer_in",  status:"NEFT RECEIVED",         dir:"CR", amount:"₹75,000",   ref:"NEFT-08213190",  time:"08 Mar 2026, 12:15 PM", from:"Vikram Joshi",      to:"Sneha Rao (You)",        auth:"RBI CLEARING (Auto Credit)",         extra:[{k:"Updated Balance",v:"₹1,80,500"}] },
  { id:"r15", type:"rtgs",         status:"RTGS PAYMENT",          dir:"DR", amount:"₹12,00,000",ref:"RTGS-08214005",  time:"08 Mar 2026, 02:10 PM", from:"TechCorp India",    to:"Global Suppliers Ltd",   auth:"MANAGER APPROVED (Dual)",            extra:[{k:"Updated Balance",v:"₹45,50,000"}] },
  { id:"r16", type:"imps",         status:"IMPS RECEIVED",         dir:"CR", amount:"₹15,500",   ref:"IMPS-08215522",  time:"08 Mar 2026, 06:45 PM", from:"Arjun Nair",        to:"Kavita Nair (You)",      auth:"NPCI CLEARED (Auto Credit)",         extra:[{k:"Updated Balance",v:"₹34,000"}] },
];

/* ─── Utility: ripple effect ─────────────────────────────────── */
function useRipple() {
  const [ripples, setRipples] = useState([]);
  const addRipple = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 30;
    const y = e.clientY - rect.top  - 30;
    const id = Date.now();
    setRipples(r => [...r, { id, x, y }]);
    setTimeout(() => setRipples(r => r.filter(r => r.id !== id)), 700);
  }, []);
  return [ripples, addRipple];
}

/* ─── Skeleton ───────────────────────────────────────────────── */
function Skeleton({ w = "100%", h = 14, mb = 8 }) {
  return (
    <div className="skeleton-shimmer"
      style={{ width: w, height: h, marginBottom: mb }} />
  );
}

function ReceiptSkeleton() {
  return (
    <div style={{
      background: T.navyCard,
      border: `1px solid ${T.navyRim}`,
      borderRadius: 16,
      padding: 0,
      overflow: "hidden",
    }}>
      <div style={{ padding: "28px 24px 20px", textAlign: "center", borderBottom: `1px solid ${T.navyRim}` }}>
        <Skeleton w="60%" h={18} mb={10} />
        <Skeleton w="80%" h={10} mb={0} />
      </div>
      <div style={{ padding: "22px 24px" }}>
        <Skeleton w="40%" h={10} mb={8} />
        <Skeleton w="55%" h={32} mb={4} />
      </div>
      <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ background: `rgba(0,0,0,0.2)`, borderRadius: 8, padding: 12 }}>
            <Skeleton w="90%" h={10} mb={8} />
            <Skeleton w="75%" h={10} mb={0} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Success stamp ──────────────────────────────────────────── */
function SuccessStamp({ dir }) {
  const isCredit = dir === "CR";
  return (
    <div style={{
      position: "absolute",
      top: 18, right: 18,
      animation: "stampIn 0.5s cubic-bezier(.22,.68,0,1.2) 0.6s both",
      opacity: 0,
    }}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r="23"
          fill="none"
          stroke={isCredit ? T.success : T.gold2}
          strokeWidth="1.5"
          strokeDasharray="144"
          strokeDashoffset="144"
          style={{
            animation: "spinArc 0.5s ease 0.6s forwards",
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
          }}
        />
        <polyline
          points={isCredit ? "16,27 22,33 36,19" : "18,26 26,34 38,18"}
          fill="none"
          stroke={isCredit ? T.success : T.gold2}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="40"
          strokeDashoffset="40"
          style={{ animation: "checkDraw 0.4s ease 1s forwards" }}
        />
      </svg>
    </div>
  );
}

/* ─── Amount display ─────────────────────────────────────────── */
function AmountDisplay({ receipt }) {
  const isCredit = receipt.dir === "CR";
  const type = TXN_TYPES[receipt.type];
  return (
    <div style={{
      textAlign: "center",
      padding: "22px 24px 18px",
      position: "relative",
    }}>
      {/* Glow blob behind amount */}
      <div style={{
        position: "absolute",
        width: 160, height: 80,
        left: "50%", top: "50%",
        transform: "translate(-50%,-50%)",
        background: isCredit
          ? "radial-gradient(ellipse, rgba(52,211,153,0.12) 0%, transparent 70%)"
          : "radial-gradient(ellipse, rgba(201,150,42,0.10) 0%, transparent 70%)",
        filter: "blur(12px)",
        pointerEvents: "none",
      }} />

      {/* Status pill */}
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 40,
        background: isCredit ? T.successBg : "rgba(201,150,42,0.1)",
        border: `1px solid ${isCredit ? "rgba(52,211,153,0.25)" : "rgba(201,150,42,0.25)"}`,
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 14 }}>{type.icon}</span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: isCredit ? T.success : T.gold2,
        }}>{receipt.status}</span>
      </div>

      {/* Amount */}
      <div style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 38,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        lineHeight: 1,
        color: isCredit ? T.success : T.cream,
        marginBottom: 4,
        textShadow: isCredit
          ? "0 0 40px rgba(52,211,153,0.3)"
          : "0 0 40px rgba(245,208,122,0.2)",
      }}>
        {isCredit ? "+ " : ""}{receipt.amount}
      </div>

      {/* Dr/Cr badge */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        letterSpacing: "0.12em",
        color: T.muted,
        textTransform: "uppercase",
        marginTop: 4,
      }}>{isCredit ? "CREDIT" : "DEBIT"} · {type.label}</div>
    </div>
  );
}

/* ─── Data table ─────────────────────────────────────────────── */
function DataTable({ rows }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.18)",
      border: `1px solid rgba(255,255,255,0.04)`,
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {rows.map((row, i) => (
        <div key={i} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "9px 14px",
          borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
          gap: 12,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9.5,
            color: T.muted,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            flexShrink: 0,
            paddingTop: 1,
          }}>{row.k}</span>
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11.5,
            fontWeight: 500,
            color: row.highlight ? T.gold2 : T.cream2,
            textAlign: "right",
            lineHeight: 1.4,
          }}>{row.v}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Animated CTA button ────────────────────────────────────── */
function ReceiptButton({ label, icon, onClick, variant = "ghost" }) {
  const [pressed, setPressed] = useState(false);
  const [done,    setDone]    = useState(false);
  const [ripples, addRipple]  = useRipple();

  const handleClick = (e) => {
    addRipple(e);
    setPressed(true);
    setTimeout(() => setPressed(false), 160);
    if (onClick) { onClick(e); setDone(true); setTimeout(() => setDone(false), 2000); }
  };

  const isPrimary = variant === "primary";
  return (
    <button
      onClick={handleClick}
      className="btn-ripple-wrapper"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "9px 0",
        borderRadius: 8,
        border: isPrimary
          ? "none"
          : `1px solid rgba(255,255,255,0.07)`,
        background: isPrimary
          ? `linear-gradient(135deg, ${T.gold} 0%, ${T.gold2} 100%)`
          : "rgba(255,255,255,0.04)",
        color: isPrimary ? T.navy : T.muted,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: "pointer",
        outline: "none",
        transform: pressed ? "scale(0.97)" : "scale(1)",
        transition: "transform 0.12s, box-shadow 0.2s, background 0.2s",
        boxShadow: isPrimary && !pressed
          ? `0 4px 16px rgba(201,150,42,0.3)`
          : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {ripples.map(r => (
        <span key={r.id} className="ripple-el"
          style={{ left: r.x, top: r.y }} />
      ))}
      <span style={{ fontSize: 12 }}>{done && variant === "primary" ? "✓" : icon}</span>
      <span>{done && variant === "primary" ? "COPIED" : label}</span>
    </button>
  );
}

/* ─── Perforated tear line ───────────────────────────────────── */
function TearLine({ color = "rgba(255,255,255,0.06)" }) {
  return (
    <div style={{
      position: "relative",
      height: 1,
      margin: "0 0",
      display: "flex",
      alignItems: "center",
    }}>
      <div style={{
        position: "absolute",
        left: -1, width: 10, height: 20,
        borderRadius: "0 10px 10px 0",
        background: T.navy,
        zIndex: 2,
      }} />
      <div style={{
        flex: 1,
        borderTop: `1px dashed ${color}`,
        marginLeft: 16,
        marginRight: 16,
      }} />
      <div style={{
        position: "absolute",
        right: -1, width: 10, height: 20,
        borderRadius: "10px 0 0 10px",
        background: T.navy,
        zIndex: 2,
      }} />
    </div>
  );
}

/* ─── Main receipt card ──────────────────────────────────────── */
function ReceiptCard({ receipt, index, isVisible }) {
  const [hovered,   setHovered]   = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [showStamp, setShowStamp] = useState(false);

  useEffect(() => {
    if (isVisible) {
      const t = setTimeout(() => setShowStamp(true), 800 + index * 80);
      return () => clearTimeout(t);
    }
  }, [isVisible, index]);

  const isCredit = receipt.dir === "CR";
  const type = TXN_TYPES[receipt.type];

  const borderColor = isCredit
    ? "rgba(52,211,153,0.2)"
    : "rgba(201,150,42,0.15)";

  const glowShadow = hovered
    ? isCredit
      ? `0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(52,211,153,0.18), 0 -1px 0 rgba(52,211,153,0.3)`
      : `0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,150,42,0.18), 0 -1px 0 rgba(201,150,42,0.3)`
    : "0 8px 32px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04)";

  return (
    <div
      className="receipt-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        animationDelay: `${index * 0.07}s`,
        position: "relative",
        background: `linear-gradient(160deg, ${T.navyCard} 0%, ${T.navyMid} 100%)`,
        border: `1px solid ${hovered ? borderColor : "rgba(255,255,255,0.05)"}`,
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transform: hovered ? "translateY(-5px) scale(1.008)" : "translateY(0) scale(1)",
        transition: "transform 0.3s cubic-bezier(.22,.68,0,1.2), box-shadow 0.3s ease, border-color 0.3s",
        boxShadow: glowShadow,
        cursor: "default",
      }}
    >
      {/* Layered depth: top gradient accent */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 3,
        background: isCredit
          ? `linear-gradient(90deg, transparent 0%, ${T.success} 40%, ${T.success} 60%, transparent 100%)`
          : `linear-gradient(90deg, transparent 0%, ${T.gold2} 40%, ${T.gold2} 60%, transparent 100%)`,
        opacity: hovered ? 0.9 : 0.5,
        transition: "opacity 0.3s",
      }} />

      {/* Watermark */}
      <div style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%,-50%) rotate(-35deg)",
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 52,
        fontWeight: 700,
        color: "rgba(201,150,42,0.035)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        letterSpacing: "0.1em",
      }}>SAFE VAULT</div>

      {/* Stamp */}
      {showStamp && <SuccessStamp dir={receipt.dir} />}

      {/* Header */}
      <div style={{
        textAlign: "center",
        padding: "24px 24px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        position: "relative",
      }}>
        {/* Bank logo mark */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginBottom: 8,
        }}>
          <div style={{
            width: 26, height: 26,
            borderRadius: 6,
            background: `linear-gradient(135deg, ${T.gold} 0%, ${T.gold2} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 2px 8px rgba(201,150,42,0.3)`,
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700,
              color: T.navyDeep,
            }}>SV</span>
          </div>
          <div>
            <div style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 17, fontWeight: 600,
              letterSpacing: "0.06em",
              color: T.cream,
              lineHeight: 1,
            }}>SURAKSHA BANK</div>
          </div>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: T.gold2,
          opacity: 0.7,
        }}>SAFE VAULT · SECURE TRANSACTION RECEIPT</div>
      </div>

      {/* Amount section */}
      <AmountDisplay receipt={receipt} />

      <TearLine />

      {/* Data tables */}
      <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <DataTable rows={[
          { k: "Reference", v: receipt.ref },
          { k: "Date & Time", v: receipt.time },
        ]} />
        <DataTable rows={[
          { k: "From", v: receipt.from },
          { k: "To",   v: receipt.to },
        ]} />
        <DataTable rows={[
          { k: "Authentication", v: receipt.auth },
          ...receipt.extra.map((e, i) => ({
            k: e.k, v: e.v,
            highlight: i === receipt.extra.length - 1,
          })),
        ]} />
      </div>

      {/* Expanded section toggle */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          margin: "0 18px",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(0,0,0,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          marginBottom: 8,
          transition: "background 0.2s",
        }}
      >
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, color: T.muted,
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>Security Details</span>
        <span style={{
          color: T.muted,
          fontSize: 12,
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.25s ease",
          display: "inline-block",
        }}>▾</span>
      </div>

      {expanded && (
        <div style={{
          margin: "0 18px 12px",
          padding: "10px 12px",
          borderRadius: 8,
          background: "rgba(0,0,0,0.18)",
          border: "1px solid rgba(255,255,255,0.04)",
          animation: "fadeSlideUp 0.25s ease both",
        }}>
          {[
            ["TXN Hash", "SHA-256:a4f2e..." + receipt.id.slice(-3).toUpperCase()],
            ["Oracle SP", receipt.type === "transfer_out" ? "sp_initiate_external_transfer" : receipt.type === "loan_emi" ? "sp_record_emi_payment" : "sp_deposit / sp_withdraw"],
            ["Session", `SURAKSHA_CTX:USER_${100 + parseInt(receipt.id.slice(1))}`],
            ["Encryption", "AES-256-GCM · TLS 1.3"],
          ].map(([k, v]) => (
            <div key={k} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "5px 0",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 8.5, color: T.muted2,
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>{k}</span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, color: T.muted,
                textAlign: "right",
              }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      <TearLine color="rgba(255,255,255,0.04)" />

      {/* Footer */}
      <div style={{
        background: "rgba(0,0,0,0.18)",
        padding: "14px 18px",
        textAlign: "center",
        borderTop: "1px solid rgba(255,255,255,0.03)",
      }}>
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 11,
          fontStyle: "italic",
          color: T.gold2,
          opacity: 0.7,
          marginBottom: 6,
        }}>Thank you for banking with us</div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8,
          color: T.muted2,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 12,
          lineHeight: 1.6,
        }}>
          Certified · Suraksha Bank Core Security Lab<br/>
          Authorised for digital records only · DICGC · RBI
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <ReceiptButton
            label="Share"
            icon="↗"
            variant="ghost"
            onClick={() => {}}
          />
          <ReceiptButton
            label="Copy Ref"
            icon="⎘"
            variant="primary"
            onClick={() => navigator.clipboard?.writeText(receipt.ref)}
          />
          <ReceiptButton
            label="Print"
            icon="⎙"
            variant="ghost"
            onClick={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Filter chip ────────────────────────────────────────────── */
function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 40,
        border: active ? "none" : "1px solid rgba(255,255,255,0.08)",
        background: active
          ? `linear-gradient(135deg, ${T.gold} 0%, ${T.gold2} 100%)`
          : "rgba(255,255,255,0.04)",
        color: active ? T.navy : T.muted,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        fontWeight: active ? 700 : 400,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: "pointer",
        outline: "none",
        transition: "all 0.2s ease",
        flexShrink: 0,
        boxShadow: active ? `0 4px 12px rgba(201,150,42,0.35)` : "none",
      }}
    >{label}</button>
  );
}

/* ─── Ticker bar ─────────────────────────────────────────────── */
function TickerBar() {
  const items = [
    "ACID Compliant · Oracle 21c",
    "AES-256-GCM Encryption",
    "TLS 1.3 · End-to-End Secure",
    "DICGC Insured · ₹5,00,000",
    "RBI Regulated",
    "PCI-DSS Level 1",
    "SOC 2 Type II",
    "ISO 27001 Certified",
  ];
  const doubled = [...items, ...items];
  return (
    <div style={{
      overflow: "hidden",
      borderTop: `1px solid rgba(201,150,42,0.1)`,
      borderBottom: `1px solid rgba(201,150,42,0.1)`,
      padding: "8px 0",
      background: "rgba(0,0,0,0.2)",
    }}>
      <div style={{
        display: "flex",
        gap: 48,
        animation: "tickerScroll 28s linear infinite",
        whiteSpace: "nowrap",
      }}>
        {doubled.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9.5,
            color: T.muted,
            letterSpacing: "0.08em",
            flexShrink: 0,
          }}>
            <div style={{
              width: 4, height: 4, borderRadius: "50%",
              background: T.gold,
              flexShrink: 0,
            }} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Root app ───────────────────────────────────────────────── */
export default function App() {
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState("all");
  const [visible,   setVisible]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setLoading(false); setVisible(true); }, 1800);
    return () => clearTimeout(t);
  }, []);

  const typeFilters = [
    { id: "all",     label: "All" },
    { id: "credit",  label: "Credits" },
    { id: "debit",   label: "Debits" },
    { id: "transfer_out", label: "Transfer" },
    { id: "rtgs",    label: "RTGS" },
    { id: "loan_emi", label: "Loans" },
    { id: "forex",   label: "Forex" },
  ];

  const filtered = RECEIPTS.filter(r => {
    if (filter === "all")    return true;
    if (filter === "credit") return r.dir === "CR";
    if (filter === "debit")  return r.dir === "DR";
    return r.type === filter;
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: `
        radial-gradient(ellipse 80% 50% at 10% 5%, rgba(201,150,42,0.06) 0%, transparent 55%),
        radial-gradient(ellipse 50% 40% at 90% 90%, rgba(52,211,153,0.04) 0%, transparent 55%),
        ${T.navy}
      `,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(13,27,42,0.92)",
        backdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}>
        <div style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 32px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `linear-gradient(135deg, ${T.gold} 0%, ${T.gold2} 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 12px rgba(201,150,42,0.35)`,
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, fontWeight: 700, color: T.navyDeep,
              }}>SV</span>
            </div>
            <div>
              <div style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 16, fontWeight: 600,
                letterSpacing: "0.08em", color: T.cream,
                lineHeight: 1,
              }}>SURAKSHA BANK</div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 8, color: T.gold2, opacity: 0.7,
                letterSpacing: "0.15em", textTransform: "uppercase",
                marginTop: 1,
              }}>Transaction Receipts</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: T.success,
                boxShadow: `0 0 8px ${T.success}`,
                animation: "pulseRing 2s ease-in-out infinite",
              }} />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, color: T.muted, letterSpacing: "0.08em",
              }}>ORACLE 21C · LIVE</span>
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, color: T.muted2, letterSpacing: "0.1em",
            }}>{filtered.length} receipts</div>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{
          maxWidth: 1280, margin: "0 auto", padding: "10px 32px",
          display: "flex", gap: 8, overflowX: "auto",
          paddingBottom: 10,
        }}>
          {typeFilters.map(f => (
            <FilterChip
              key={f.id}
              label={f.label}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
            />
          ))}
        </div>
      </div>

      <TickerBar />

      {/* ── Page header ────────────────────────────────────────── */}
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "40px 32px 24px",
        animation: visible ? "fadeSlideUp 0.5s ease both" : "none",
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, color: T.gold2,
          letterSpacing: "0.2em", textTransform: "uppercase",
          marginBottom: 8, opacity: 0.8,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ width: 20, height: 1, background: T.gold2, display: "inline-block" }} />
          08 March 2026 · Daily Transaction Log
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "clamp(28px, 4vw, 44px)",
          fontWeight: 300,
          letterSpacing: "-0.02em",
          color: T.cream,
          lineHeight: 1.1,
          marginBottom: 12,
        }}>
          Vault Receipts
          <span style={{
            fontStyle: "italic",
            color: T.gold2,
            fontWeight: 300,
          }}> — Secured.</span>
        </h1>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13, fontWeight: 300,
          color: T.muted, lineHeight: 1.6, maxWidth: 480,
        }}>
          Every transaction is cryptographically signed, Oracle-ACID verified, and stored
          immutably in the audit trail. Each receipt is a permanent record.
        </p>
      </div>

      {/* ── Grid ───────────────────────────────────────────────── */}
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "0 32px 60px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 20,
      }}>
        {loading
          ? Array(8).fill(0).map((_, i) => <ReceiptSkeleton key={i} />)
          : filtered.map((receipt, i) => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
                index={i}
                isVisible={visible}
              />
            ))
        }
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(0,0,0,0.3)",
        padding: "28px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
        maxWidth: "100%",
      }}>
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 13, fontWeight: 600,
          letterSpacing: "0.1em", color: T.cream2,
        }}>
          SURAKSHA <span style={{ color: T.gold2 }}>BANK</span> · SAFE VAULT
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8.5, color: T.muted2,
          letterSpacing: "0.08em", textAlign: "center", lineHeight: 1.8,
        }}>
          Oracle 21c · PL/SQL Stored Procedures · AES-256-GCM · TLS 1.3<br/>
          DICGC Insured · Regulated by RBI · PCI-DSS Level 1 · ISO 27001
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8.5, color: T.muted2,
          textAlign: "right", lineHeight: 1.8,
        }}>
          © 2026 Suraksha Bank<br/>
          All rights reserved
        </div>
      </div>
    </div>
  );
}
